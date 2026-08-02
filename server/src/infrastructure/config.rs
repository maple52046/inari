//! Process configuration read from the environment.
//!
//! Only the composition root and adapters read this. Loading fails fast so a
//! misconfigured deployment never reaches the point of serving requests with a
//! weak session secret or an unreachable mount path.

use std::env::{self, VarError};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::num::{NonZeroU32, NonZeroUsize};
use std::path::PathBuf;
use std::time::Duration;

use crate::domain::capacity::CapacityLimits;
use crate::domain::models::S3Connection;

/// Minimum accepted length of [`Config::session_secret`].
///
/// Carried over from the TypeScript loader: a short secret would undermine the
/// boundary that keeps S3 credentials out of the browser.
const MIN_SECRET_LENGTH: usize = 32;

/// Endpoint prefilled on the connection form when the operator sets none.
const DEFAULT_ENDPOINT_FALLBACK: &str = "https://s3.example.com";

/// Region assumed when the operator sets none, matching the previous Zod schema.
const DEFAULT_REGION: &str = "us-east-1";

const DEFAULT_PORT: u16 = 3000;
const DEFAULT_REQUEST_BODY_LIMIT: usize = 1024 * 1024;
const DEFAULT_S3_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);

/// How long a measured location stays fresh before a read refreshes it.
const DEFAULT_CAPACITY_TTL: Duration = Duration::from_secs(5 * 60);

/// Smallest gap between two background sweeps, measured from the previous end.
const DEFAULT_CAPACITY_AUTOSCAN_INTERVAL: Duration = Duration::from_secs(15 * 60);

/// Listing requests per second the scanner may issue in total.
///
/// The one ceiling that bounds load on the backend regardless of how large it
/// turns out to be: ten requests per second reads at most ten thousand keys per
/// second, which walks a million-object backend in about a hundred seconds
/// without the backend noticing.
const DEFAULT_CAPACITY_SCAN_RATE: u32 = 10;

/// Prefix depth beyond which a location is measured but not broken down.
const DEFAULT_CAPACITY_MAX_DEPTH: usize = 6;

/// Nodes the tree may hold before it starts shedding its deepest level.
///
/// At roughly two hundred bytes a node this is about twenty megabytes, which is
/// safe on the smallest host the server is expected to run on.
const DEFAULT_CAPACITY_MAX_NODES: usize = 100_000;

/// Hard ceiling on the configured prefix depth.
///
/// The tree is walked recursively, so an operator must not be able to turn a
/// configuration value into a stack overflow.
const MAX_CAPACITY_DEPTH: usize = 32;

/// Which environment the process believes it is running in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    /// Local development: relaxed cookie and CORS handling, verbose errors.
    Development,
    /// Anything deployed.
    Production,
}

impl Environment {
    /// Whether this is a development process.
    #[must_use]
    pub const fn is_development(self) -> bool {
        matches!(self, Self::Development)
    }
}

/// Which storage backend the deployment points at, and who decides.
///
/// Every field except the credentials describes *where* to connect and *how*
/// to talk to it, which is an operator's decision rather than a user's once a
/// deployment serves one backend. Unlocked they are merely the form's starting
/// values; locked they are the only accepted answer.
#[derive(Debug, Clone)]
pub struct ConnectionDefaults {
    /// Base URL of the endpoint.
    pub endpoint: String,
    /// Signing region.
    pub region: String,
    /// Path-style addressing, required by most self-hosted backends.
    pub force_path_style: bool,
    /// Whether to skip TLS certificate verification.
    pub skip_tls_verification: bool,
    /// Whether users may connect to anything other than the values above.
    ///
    /// The project began as a browser for several backends, so the connect form
    /// lets a visitor point the server at any address it can reach. On a host
    /// exposed to the internet that is an outbound request primitive aimed at
    /// the operator's own network, so a deployment serving one backend should
    /// close it.
    pub locked: bool,
}

/// Credentials the server itself uses to keep the capacity index current.
///
/// Separate from [`S3Connection`] on purpose. These are the one credentials the
/// process holds of its own, and giving them a type that cannot be passed where
/// a session's connection is expected is what stops them from ever being used
/// to serve a user's request.
#[derive(Clone, PartialEq, Eq)]
pub struct ScannerCredentials {
    /// Access key identifier.
    pub access_key_id: String,
    /// Secret access key.
    pub secret_access_key: String,
}

impl std::fmt::Debug for ScannerCredentials {
    /// Redacts both fields so the scanner key cannot leak through a log line.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScannerCredentials")
            .field("access_key_id", &"<redacted>")
            .field("secret_access_key", &"<redacted>")
            .finish()
    }
}

/// Which buckets the sweeper covers.
///
/// The allowlist is empty by default, meaning every bucket the scanner can see.
/// The denylist is applied afterwards so an operator can subtract from "all"
/// without having to enumerate the rest.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CapacityCoverage {
    /// Buckets to cover; empty means all of them.
    pub include: Vec<String>,
    /// Buckets to skip, applied after the allowlist.
    pub exclude: Vec<String>,
}

impl CapacityCoverage {
    /// Whether the sweeper should measure `bucket`.
    #[must_use]
    pub fn covers(&self, bucket: &str) -> bool {
        if self.exclude.iter().any(|name| name == bucket) {
            return false;
        }
        self.include.is_empty() || self.include.iter().any(|name| name == bucket)
    }
}

/// Everything the shared capacity index needs, once it is switched on.
#[derive(Debug, Clone)]
pub struct CapacitySettings {
    /// Credentials the scanner authenticates with.
    pub scanner: ScannerCredentials,
    /// How long a measurement stays fresh.
    pub ttl: Duration,
    /// Whether the background sweeper runs.
    pub autoscan: bool,
    /// Smallest gap between sweeps, measured from the end of the previous one.
    pub autoscan_interval: Duration,
    /// Listing requests per second across all scanning.
    pub scan_rate: NonZeroU32,
    /// Ceilings on the tree's size.
    pub limits: CapacityLimits,
    /// Which buckets the sweeper covers.
    pub coverage: CapacityCoverage,
    /// Whether a read probes the prefix with the caller's own credentials.
    pub verify_prefix_access: bool,
}

/// Whether this deployment maintains a shared capacity index.
#[derive(Debug, Clone)]
pub enum CapacityConfig {
    /// No server-side index; the browser keeps its own cache as before.
    Off,
    /// A server-side index shared by every session.
    Shared(Box<CapacitySettings>),
}

impl CapacityConfig {
    /// Returns the settings when an index is enabled.
    #[must_use]
    pub fn settings(&self) -> Option<&CapacitySettings> {
        match self {
            Self::Off => None,
            Self::Shared(settings) => Some(settings),
        }
    }
}

/// Everything the process needs to start.
#[derive(Debug, Clone)]
pub struct Config {
    /// Address the HTTP listener binds to.
    pub bind: SocketAddr,
    /// Path prefix the whole application is mounted under, or empty for root.
    pub base_path: String,
    /// Secret sealing the session cookie.
    pub session_secret: String,
    /// Whether the session cookie carries the `Secure` attribute.
    pub session_cookie_secure: bool,
    /// The storage target the connection form starts from, and may be pinned to.
    pub connection: ConnectionDefaults,
    /// Deployment environment.
    pub environment: Environment,
    /// PEM file holding a CA trusted in addition to the platform store.
    ///
    /// Additive rather than a replacement, so a deployment that trusts an
    /// internal CA still reaches public endpoints. This is the equivalent of
    /// the `NODE_EXTRA_CA_CERTS` the Node implementation used.
    pub extra_ca_certs: Option<PathBuf>,
    /// Tokio worker count; [`None`] selects the single-threaded runtime.
    pub worker_threads: Option<NonZeroUsize>,
    /// Largest accepted request body.
    pub request_body_limit: usize,
    /// Deadline applied to a single S3 operation.
    pub s3_timeout: Duration,
    /// How long in-flight requests may run after a shutdown signal.
    pub shutdown_timeout: Duration,
    /// Origin the Vite dev server runs on, when one should be allowed through
    /// CORS. Only ever set in development.
    pub dev_origin: Option<String>,
    /// Whether a shared capacity index is maintained, and how.
    pub capacity: CapacityConfig,
}

/// Why configuration could not be loaded.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// A required variable was absent or empty.
    #[error("{0} must be set")]
    Missing(&'static str),
    /// A variable was present but not usable.
    #[error("{name} is invalid: {reason}")]
    Invalid {
        /// The offending variable.
        name: &'static str,
        /// What was wrong with it, never echoing a secret value.
        reason: String,
    },
}

impl ConfigError {
    fn invalid(name: &'static str, reason: impl Into<String>) -> Self {
        Self::Invalid {
            name,
            reason: reason.into(),
        }
    }
}

/// Loads a `.env` file into the environment when one is present.
///
/// Values already set in the environment win, so a systemd unit or a Kubernetes
/// secret is never shadowed by a file that happened to be left in the working
/// directory. Absence is the normal case in production and is not an error.
pub fn load_dotenv() {
    match dotenvy::dotenv() {
        Ok(path) => tracing::info!(path = %path.display(), "loaded environment file"),
        Err(error) if error.not_found() => {}
        Err(error) => tracing::warn!(%error, "an environment file was present but unreadable"),
    }
}

impl Config {
    /// Loads configuration from the process environment.
    ///
    /// # Errors
    ///
    /// Returns [`ConfigError`] when a required variable is missing or a
    /// provided value cannot be used, so start-up fails loudly rather than
    /// serving a subtly broken deployment.
    pub fn from_env() -> Result<Self, ConfigError> {
        let environment = match read_var("INARI_ENV")?.as_deref() {
            Some("development" | "dev") => Environment::Development,
            _ => Environment::Production,
        };

        let session_secret = read_var("SESSION_SECRET")?
            .ok_or(ConfigError::Missing("SESSION_SECRET"))
            .and_then(|secret| {
                if secret.len() < MIN_SECRET_LENGTH {
                    return Err(ConfigError::invalid(
                        "SESSION_SECRET",
                        format!("must be at least {MIN_SECRET_LENGTH} characters"),
                    ));
                }
                Ok(secret)
            })?;

        let port = match read_var("PORT")? {
            Some(raw) => raw
                .parse::<u16>()
                .map_err(|error| ConfigError::invalid("PORT", error.to_string()))?,
            None => DEFAULT_PORT,
        };
        let host = match read_var("HOST")? {
            Some(raw) => raw
                .parse::<IpAddr>()
                .map_err(|error| ConfigError::invalid("HOST", error.to_string()))?,
            None => IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        };

        let base_path = normalize_base_path(read_var("BASE_PATH")?.as_deref())?;

        let configured_endpoint = read_var("DEFAULT_S3_ENDPOINT")?;
        let locked = read_flag("INARI_LOCK_CONNECTION")?.unwrap_or(false);
        // Locking to a fallback nobody chose would leave the deployment
        // pointing at an example host with no way for a user to correct it, so
        // the pair is required rather than merely recommended.
        if locked && configured_endpoint.is_none() {
            return Err(ConfigError::invalid(
                "INARI_LOCK_CONNECTION",
                "requires DEFAULT_S3_ENDPOINT to be set, since that becomes the only reachable endpoint",
            ));
        }

        let connection = ConnectionDefaults {
            endpoint: configured_endpoint.unwrap_or_else(|| DEFAULT_ENDPOINT_FALLBACK.to_owned()),
            region: read_var("DEFAULT_S3_REGION")?.unwrap_or_else(|| DEFAULT_REGION.to_owned()),
            force_path_style: read_flag("DEFAULT_S3_FORCE_PATH_STYLE")?.unwrap_or(true),
            skip_tls_verification: read_flag("DEFAULT_S3_SKIP_TLS_VERIFICATION")?.unwrap_or(false),
            locked,
        };

        let session_cookie_secure =
            read_flag("SESSION_COOKIE_SECURE")?.unwrap_or(!environment.is_development());

        let capacity = load_capacity(locked)?;

        let worker_threads = match read_var("INARI_WORKER_THREADS")? {
            Some(raw) => {
                let parsed = raw.parse::<usize>().map_err(|error| {
                    ConfigError::invalid("INARI_WORKER_THREADS", error.to_string())
                })?;
                NonZeroUsize::new(parsed).filter(|count| count.get() > 1)
            }
            None => None,
        };

        Ok(Self {
            bind: SocketAddr::new(host, port),
            base_path,
            session_secret,
            session_cookie_secure,
            connection,
            environment,
            extra_ca_certs: read_var("INARI_EXTRA_CA_CERTS")?.map(PathBuf::from),
            worker_threads,
            request_body_limit: match read_var("INARI_REQUEST_BODY_LIMIT")? {
                Some(raw) => raw.parse().map_err(|error: std::num::ParseIntError| {
                    ConfigError::invalid("INARI_REQUEST_BODY_LIMIT", error.to_string())
                })?,
                None => DEFAULT_REQUEST_BODY_LIMIT,
            },
            s3_timeout: DEFAULT_S3_TIMEOUT,
            shutdown_timeout: DEFAULT_SHUTDOWN_TIMEOUT,
            dev_origin: match environment {
                Environment::Development => Some(
                    read_var("INARI_DEV_ORIGIN")?
                        .unwrap_or_else(|| "http://localhost:5173".to_owned()),
                ),
                Environment::Production => None,
            },
            capacity,
        })
    }

    /// Returns the cookie `Path`, which must cover the whole mount point.
    #[must_use]
    pub fn cookie_path(&self) -> &str {
        if self.base_path.is_empty() {
            "/"
        } else {
            &self.base_path
        }
    }

    /// Builds the connection the scanner uses, when an index is enabled.
    ///
    /// Takes its target from [`Config::connection`] rather than from settings of
    /// its own, which is sound only because a shared index requires a locked
    /// deployment: those defaults are then the single backend every session
    /// talks to, so the index the scanner builds describes the same storage the
    /// users are looking at.
    #[must_use]
    pub fn scanner_connection(&self) -> Option<S3Connection> {
        let settings = self.capacity.settings()?;
        Some(S3Connection {
            endpoint: self.connection.endpoint.clone(),
            access_key_id: settings.scanner.access_key_id.clone(),
            secret_access_key: settings.scanner.secret_access_key.clone(),
            region: self.connection.region.clone(),
            force_path_style: self.connection.force_path_style,
            skip_tls_verification: self.connection.skip_tls_verification,
        })
    }
}

/// Loads the capacity index settings and enforces what they depend on.
///
/// Every inconsistency here is a hard failure rather than a warning: an index
/// that silently fails to start would leave the dashboard showing figures that
/// never refresh, which is worse than not booting.
fn load_capacity(locked: bool) -> Result<CapacityConfig, ConfigError> {
    let mode = read_var("INARI_CAPACITY_INDEX")?;
    let scanner = read_scanner_credentials()?;

    let shared = match mode.as_deref() {
        None | Some("off") => false,
        Some("shared") => true,
        Some(_) => {
            return Err(ConfigError::invalid(
                "INARI_CAPACITY_INDEX",
                "must be \"off\" or \"shared\"",
            ));
        }
    };

    if !shared {
        // A scanner key sitting in the environment while nothing uses it is an
        // unnecessary secret on the host, and far more likely to be a typo in
        // the mode than a deliberate choice.
        if scanner.is_some() {
            return Err(ConfigError::invalid(
                "INARI_SCANNER_ACCESS_KEY_ID",
                "is set while INARI_CAPACITY_INDEX is off, so the key would never be used",
            ));
        }
        return Ok(CapacityConfig::Off);
    }

    // A scanner key authenticates against exactly one backend, so an index it
    // builds only describes what every session sees when the deployment is
    // pinned to that backend. Without the lock the index has no coherent
    // meaning at all.
    if !locked {
        return Err(ConfigError::invalid(
            "INARI_CAPACITY_INDEX",
            "\"shared\" requires INARI_LOCK_CONNECTION=true, since the index describes the one backend the scanner key authenticates against",
        ));
    }

    let scanner = scanner.ok_or_else(|| {
        ConfigError::invalid(
            "INARI_SCANNER_ACCESS_KEY_ID",
            "is required by INARI_CAPACITY_INDEX=shared, together with INARI_SCANNER_SECRET_ACCESS_KEY",
        )
    })?;

    let coverage = CapacityCoverage {
        include: read_list("INARI_CAPACITY_BUCKETS")?,
        exclude: read_list("INARI_CAPACITY_EXCLUDE_BUCKETS")?,
    };
    if let Some(name) = coverage
        .include
        .iter()
        .find(|name| coverage.exclude.contains(name))
    {
        return Err(ConfigError::invalid(
            "INARI_CAPACITY_EXCLUDE_BUCKETS",
            format!("lists {name}, which INARI_CAPACITY_BUCKETS also includes"),
        ));
    }

    let max_depth = read_usize("INARI_CAPACITY_MAX_DEPTH", DEFAULT_CAPACITY_MAX_DEPTH)?;
    if max_depth > MAX_CAPACITY_DEPTH {
        return Err(ConfigError::invalid(
            "INARI_CAPACITY_MAX_DEPTH",
            format!("must be at most {MAX_CAPACITY_DEPTH}"),
        ));
    }

    let scan_rate = read_u32("INARI_CAPACITY_SCAN_RATE", DEFAULT_CAPACITY_SCAN_RATE)?;
    let scan_rate = NonZeroU32::new(scan_rate).ok_or_else(|| {
        ConfigError::invalid(
            "INARI_CAPACITY_SCAN_RATE",
            "must be at least 1, since a rate of zero would stop the index ever being measured",
        )
    })?;

    Ok(CapacityConfig::Shared(Box::new(CapacitySettings {
        scanner,
        ttl: read_duration("INARI_CAPACITY_INDEX_TTL", DEFAULT_CAPACITY_TTL)?,
        autoscan: read_flag("INARI_CAPACITY_AUTOSCAN")?.unwrap_or(true),
        autoscan_interval: read_duration(
            "INARI_CAPACITY_AUTOSCAN_INTERVAL",
            DEFAULT_CAPACITY_AUTOSCAN_INTERVAL,
        )?,
        scan_rate,
        limits: CapacityLimits {
            max_depth,
            max_nodes: read_usize("INARI_CAPACITY_MAX_NODES", DEFAULT_CAPACITY_MAX_NODES)?,
        },
        coverage,
        verify_prefix_access: read_flag("INARI_CAPACITY_VERIFY_PREFIX_ACCESS")?.unwrap_or(false),
    })))
}

/// Reads the scanner key pair, requiring both halves or neither.
fn read_scanner_credentials() -> Result<Option<ScannerCredentials>, ConfigError> {
    let access_key_id = read_secret("INARI_SCANNER_ACCESS_KEY_ID")?;
    let secret_access_key = read_secret("INARI_SCANNER_SECRET_ACCESS_KEY")?;

    match (access_key_id, secret_access_key) {
        (Some(access_key_id), Some(secret_access_key)) => Ok(Some(ScannerCredentials {
            access_key_id,
            secret_access_key,
        })),
        (None, None) => Ok(None),
        (Some(_), None) => Err(ConfigError::Missing("INARI_SCANNER_SECRET_ACCESS_KEY")),
        (None, Some(_)) => Err(ConfigError::Missing("INARI_SCANNER_ACCESS_KEY_ID")),
    }
}

/// Reads a variable, treating an empty or whitespace-only value as absent.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] when the value is not valid Unicode.
fn read_var(name: &'static str) -> Result<Option<String>, ConfigError> {
    match env::var(name) {
        Ok(value) => {
            let trimmed = value.trim();
            Ok(if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_owned())
            })
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(ConfigError::invalid(name, "is not valid Unicode")),
    }
}

/// Reads a boolean variable.
///
/// Returns [`None`] when unset, leaving the caller to pick its own default.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for a value that is neither truthy nor
/// falsy, rather than quietly treating a typo as "off" -- which for a flag that
/// closes an attack surface would be the wrong way to fail.
fn read_flag(name: &'static str) -> Result<Option<bool>, ConfigError> {
    read_var(name)?
        .map(|raw| parse_flag(name, &raw))
        .transpose()
}

/// Interprets one boolean value.
///
/// Split from [`read_flag`] so the accepted spellings can be tested without
/// mutating the process environment, which is global and shared by every test
/// running in parallel.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for anything unrecognised.
fn parse_flag(name: &'static str, raw: &str) -> Result<bool, ConfigError> {
    match raw.to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => Ok(true),
        "false" | "0" | "no" | "off" => Ok(false),
        _ => Err(ConfigError::invalid(name, "must be true or false")),
    }
}

/// Reads a secret from a variable, or from the file a `_FILE` variant names.
///
/// The file form exists so a Kubernetes Secret or a systemd credential can be
/// mounted rather than inlined into a unit file or a pod spec, where it would
/// be visible to anything that can read the manifest.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] when both forms are set, which is
/// ambiguous, or when the named file cannot be read.
fn read_secret(name: &'static str) -> Result<Option<String>, ConfigError> {
    let direct = read_var(name)?;
    let path = match env::var(format!("{name}_FILE")) {
        Ok(value) if !value.trim().is_empty() => Some(value.trim().to_owned()),
        Ok(_) | Err(VarError::NotPresent) => None,
        Err(VarError::NotUnicode(_)) => {
            return Err(ConfigError::invalid(
                name,
                "the _FILE path is not valid Unicode",
            ));
        }
    };

    match (direct, path) {
        (Some(_), Some(_)) => Err(ConfigError::invalid(
            name,
            "is set both directly and through its _FILE variant; keep only one",
        )),
        (Some(value), None) => Ok(Some(value)),
        (None, Some(path)) => {
            let contents = std::fs::read_to_string(&path).map_err(|error| {
                ConfigError::invalid(name, format!("cannot read {path}: {error}"))
            })?;
            // A mounted secret almost always ends in a newline the writer did
            // not intend as part of the value, but interior whitespace may be
            // genuine, so only the trailing line ending is removed.
            let value = contents
                .strip_suffix('\n')
                .map_or(contents.as_str(), |value| {
                    value.strip_suffix('\r').unwrap_or(value)
                });
            if value.is_empty() {
                return Err(ConfigError::invalid(name, format!("{path} is empty")));
            }
            Ok(Some(value.to_owned()))
        }
        (None, None) => Ok(None),
    }
}

/// Reads a comma-separated list, dropping empty entries.
fn read_list(name: &'static str) -> Result<Vec<String>, ConfigError> {
    Ok(read_var(name)?
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default())
}

/// Reads a count, falling back to `default` when unset.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for anything that is not a number.
fn read_usize(name: &'static str, default: usize) -> Result<usize, ConfigError> {
    match read_var(name)? {
        Some(raw) => raw.parse().map_err(|error: std::num::ParseIntError| {
            ConfigError::invalid(name, error.to_string())
        }),
        None => Ok(default),
    }
}

/// Reads a rate, falling back to `default` when unset.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for anything that is not a number.
fn read_u32(name: &'static str, default: u32) -> Result<u32, ConfigError> {
    match read_var(name)? {
        Some(raw) => raw.parse().map_err(|error: std::num::ParseIntError| {
            ConfigError::invalid(name, error.to_string())
        }),
        None => Ok(default),
    }
}

/// Reads a duration, falling back to `default` when unset.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for an unparsable value.
fn read_duration(name: &'static str, default: Duration) -> Result<Duration, ConfigError> {
    match read_var(name)? {
        Some(raw) => parse_duration(name, &raw),
        None => Ok(default),
    }
}

/// Interprets one duration written the way an operator would write it.
///
/// Accepts `30s`, `5m`, `2h`, and a bare number read as seconds. Split from
/// [`read_duration`] so the accepted spellings can be tested without mutating
/// the process environment, which every parallel test shares.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for an unrecognised suffix, a non-numeric
/// value, or zero, which for an interval would mean an unbounded loop.
fn parse_duration(name: &'static str, raw: &str) -> Result<Duration, ConfigError> {
    let raw = raw.trim();
    let (digits, multiplier) = match raw.chars().last() {
        Some('s') => (&raw[..raw.len() - 1], 1),
        Some('m') => (&raw[..raw.len() - 1], 60),
        Some('h') => (&raw[..raw.len() - 1], 3600),
        _ => (raw, 1),
    };

    let value: u64 = digits
        .trim()
        .parse()
        .map_err(|_| ConfigError::invalid(name, "must be a duration such as 30s, 5m, or 2h"))?;
    if value == 0 {
        return Err(ConfigError::invalid(name, "must be greater than zero"));
    }
    Ok(Duration::from_secs(value.saturating_mul(multiplier)))
}

/// Canonicalises an operator-supplied mount prefix.
///
/// Unset, empty, and `/` all mean "mounted at the root" and normalise to an
/// empty string. Anything else gains a leading slash and loses trailing ones.
///
/// # Errors
///
/// Returns [`ConfigError::Invalid`] for a value containing whitespace, `?`, or
/// `#`, which would silently make every route unreachable.
pub fn normalize_base_path(raw: Option<&str>) -> Result<String, ConfigError> {
    let trimmed = raw.unwrap_or_default().trim();
    if trimmed.is_empty() || trimmed == "/" {
        return Ok(String::new());
    }
    if trimmed
        .chars()
        .any(|character| character.is_whitespace() || character == '?' || character == '#')
    {
        return Err(ConfigError::invalid(
            "BASE_PATH",
            "must not contain whitespace, \"?\" or \"#\"",
        ));
    }
    let rooted = if trimmed.starts_with('/') {
        trimmed.to_owned()
    } else {
        format!("/{trimmed}")
    };
    Ok(rooted.trim_end_matches('/').to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_mount_normalizes_to_empty() {
        assert_eq!(normalize_base_path(None).unwrap(), "");
        assert_eq!(normalize_base_path(Some("")).unwrap(), "");
        assert_eq!(normalize_base_path(Some("   ")).unwrap(), "");
        assert_eq!(normalize_base_path(Some("/")).unwrap(), "");
    }

    #[test]
    fn prefix_gains_a_leading_slash_and_loses_trailing_ones() {
        assert_eq!(
            normalize_base_path(Some("dashboard")).unwrap(),
            "/dashboard"
        );
        assert_eq!(
            normalize_base_path(Some("/dashboard")).unwrap(),
            "/dashboard"
        );
        assert_eq!(
            normalize_base_path(Some("/dashboard///")).unwrap(),
            "/dashboard"
        );
        assert_eq!(normalize_base_path(Some("  /a/b  ")).unwrap(), "/a/b");
    }

    #[test]
    fn flags_accept_the_spellings_operators_actually_write() {
        for raw in ["true", "TRUE", "1", "yes", "on"] {
            assert!(parse_flag("F", raw).unwrap(), "{raw} should read as true");
        }
        for raw in ["false", "FALSE", "0", "no", "off"] {
            assert!(!parse_flag("F", raw).unwrap(), "{raw} should read as false");
        }
    }

    #[test]
    fn a_misspelled_flag_is_an_error_rather_than_a_silent_false() {
        // A flag that closes an attack surface must not read as "off" because
        // of a typo.
        assert!(parse_flag("F", "ture").is_err());
        assert!(parse_flag("F", "").is_err());
    }

    #[test]
    fn route_breaking_characters_are_rejected() {
        for raw in ["/a b", "/a?b", "/a#b"] {
            assert!(
                normalize_base_path(Some(raw)).is_err(),
                "expected {raw} to be rejected"
            );
        }
    }

    #[test]
    fn durations_accept_the_units_operators_actually_write() {
        assert_eq!(parse_duration("D", "45s").unwrap(), Duration::from_secs(45));
        assert_eq!(parse_duration("D", "5m").unwrap(), Duration::from_secs(300));
        assert_eq!(
            parse_duration("D", "2h").unwrap(),
            Duration::from_secs(7_200)
        );
        assert_eq!(
            parse_duration("D", " 90 ").unwrap(),
            Duration::from_secs(90),
            "a bare number reads as seconds"
        );
    }

    #[test]
    fn a_zero_duration_is_rejected() {
        // An interval of zero would turn the sweeper into a busy loop against
        // the backend, so it must not be reachable by configuration.
        assert!(parse_duration("D", "0m").is_err());
        assert!(parse_duration("D", "0").is_err());
    }

    #[test]
    fn an_unparsable_duration_names_the_forms_it_accepts() {
        let error = parse_duration("D", "soon").unwrap_err().to_string();
        assert!(error.contains("30s"), "unhelpful message: {error}");
    }

    #[test]
    fn coverage_defaults_to_every_bucket() {
        let coverage = CapacityCoverage::default();
        assert!(coverage.covers("photos"));
    }

    #[test]
    fn an_allowlist_excludes_everything_it_omits() {
        let coverage = CapacityCoverage {
            include: vec!["photos".to_owned()],
            exclude: Vec::new(),
        };
        assert!(coverage.covers("photos"));
        assert!(!coverage.covers("backups"));
    }

    #[test]
    fn a_denylist_subtracts_from_every_bucket() {
        let coverage = CapacityCoverage {
            include: Vec::new(),
            exclude: vec!["scratch".to_owned()],
        };
        assert!(coverage.covers("photos"));
        assert!(!coverage.covers("scratch"));
    }
}
