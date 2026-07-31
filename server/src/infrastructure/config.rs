//! Process configuration read from the environment.
//!
//! Only the composition root and adapters read this. Loading fails fast so a
//! misconfigured deployment never reaches the point of serving requests with a
//! weak session secret or an unreachable mount path.

use std::env::{self, VarError};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::time::Duration;

/// Minimum accepted length of [`Config::session_secret`].
///
/// Carried over from the TypeScript loader: a short secret would undermine the
/// boundary that keeps S3 credentials out of the browser.
const MIN_SECRET_LENGTH: usize = 32;

/// Endpoint prefilled on the connection form when the operator sets none.
const DEFAULT_ENDPOINT_FALLBACK: &str = "https://s3.example.com";

const DEFAULT_PORT: u16 = 3000;
const DEFAULT_REQUEST_BODY_LIMIT: usize = 1024 * 1024;
const DEFAULT_S3_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);

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
    /// Endpoint prefilled on the connection form.
    pub default_endpoint: String,
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

        let session_cookie_secure = match read_var("SESSION_COOKIE_SECURE")?
            .map(|raw| raw.trim().to_ascii_lowercase())
            .as_deref()
        {
            Some("true" | "1") => true,
            Some("false" | "0") => false,
            _ => !environment.is_development(),
        };

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
            default_endpoint: read_var("DEFAULT_S3_ENDPOINT")?
                .unwrap_or_else(|| DEFAULT_ENDPOINT_FALLBACK.to_owned()),
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
    fn route_breaking_characters_are_rejected() {
        for raw in ["/a b", "/a?b", "/a#b"] {
            assert!(
                normalize_base_path(Some(raw)).is_err(),
                "expected {raw} to be rejected"
            );
        }
    }
}
