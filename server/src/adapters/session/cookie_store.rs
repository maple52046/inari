//! Stores the active S3 connection in an encrypted cookie.
//!
//! The credentials never reach browser-readable storage: the cookie is
//! `HttpOnly` and sealed with a key derived from `SESSION_SECRET`, so only this
//! server can decrypt it. This is the boundary that lets every S3 call run
//! server-side while the user still supplies their own credentials.

use cookie::{Cookie, CookieJar, Key, SameSite};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::domain::models::S3Connection;

/// Name of the sealed cookie.
///
/// Deliberately not the Next.js `s3m_session`: cookies ignore the port, so
/// while both servers run side by side on one host during cutover they would
/// otherwise overwrite each other's session with an undecryptable value.
pub const COOKIE_NAME: &str = "inari_session";

/// Context string binding the derived key to this application and purpose.
const HKDF_INFO: &[u8] = b"inari session cookie v1";

/// An active connection together with its lifetime markers.
#[derive(Debug, Clone)]
pub struct ConnectionSession {
    /// The credentials and endpoint being used.
    pub connection: S3Connection,
    /// When the session was first established.
    pub created_at: OffsetDateTime,
    /// When the session was last touched.
    pub last_used_at: OffsetDateTime,
}

/// The payload sealed inside the cookie.
#[derive(Debug, Serialize, Deserialize)]
struct SessionPayload {
    endpoint: String,
    access_key_id: String,
    secret_access_key: String,
    region: String,
    force_path_style: bool,
    skip_tls_verification: bool,
    created_at: i64,
    last_used_at: i64,
}

/// Why a session could not be read or written.
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    /// The cookie was present but not authentic, or its contents were not the
    /// shape this version writes.
    #[error("the session cookie could not be opened")]
    Unreadable,
    /// The session could not be serialised.
    #[error("the session could not be sealed: {0}")]
    Unwritable(String),
}

/// Seals and opens session cookies.
#[derive(Clone)]
pub struct SessionStore {
    key: Key,
    path: String,
    secure: bool,
}

impl std::fmt::Debug for SessionStore {
    /// Omits the key so a state dump cannot expose the sealing material.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SessionStore")
            .field("path", &self.path)
            .field("secure", &self.secure)
            .finish_non_exhaustive()
    }
}

impl SessionStore {
    /// Builds a store from the configured secret.
    ///
    /// `SESSION_SECRET` is an operator-chosen string of at least 32 characters
    /// rather than 64 bytes of entropy, so it is stretched through HKDF instead
    /// of being used as the key directly.
    #[must_use]
    pub fn new(secret: &str, path: impl Into<String>, secure: bool) -> Self {
        let hkdf = hkdf::Hkdf::<sha2::Sha256>::new(None, secret.as_bytes());
        let mut material = [0_u8; 64];
        hkdf.expand(HKDF_INFO, &mut material)
            .expect("64 bytes is far below HKDF-SHA256's output limit");

        Self {
            key: Key::from(&material),
            path: path.into(),
            secure,
        }
    }

    /// Opens the session carried by a request's cookie header.
    ///
    /// Returns [`None`] when no session cookie is present, and an error when one
    /// is present but cannot be opened, which lets a caller distinguish "never
    /// connected" from "the secret changed".
    ///
    /// # Errors
    ///
    /// Returns [`SessionError::Unreadable`] when the cookie fails
    /// authentication or does not deserialise.
    pub fn read(
        &self,
        cookie_header: Option<&str>,
    ) -> Result<Option<ConnectionSession>, SessionError> {
        let Some(header) = cookie_header else {
            return Ok(None);
        };

        let mut jar = CookieJar::new();
        for cookie in Cookie::split_parse_encoded(header.to_owned()).flatten() {
            jar.add_original(cookie);
        }

        let Some(sealed) = jar.private(&self.key).get(COOKIE_NAME) else {
            // Absent and tampered-with are indistinguishable here, so a stale
            // cookie from a rotated secret simply reads as "not connected".
            return if jar.get(COOKIE_NAME).is_some() {
                Err(SessionError::Unreadable)
            } else {
                Ok(None)
            };
        };

        let payload: SessionPayload =
            serde_json::from_str(sealed.value()).map_err(|_| SessionError::Unreadable)?;

        Ok(Some(ConnectionSession {
            connection: S3Connection {
                endpoint: payload.endpoint,
                access_key_id: payload.access_key_id,
                secret_access_key: payload.secret_access_key,
                region: payload.region,
                force_path_style: payload.force_path_style,
                skip_tls_verification: payload.skip_tls_verification,
            },
            created_at: from_unix(payload.created_at),
            last_used_at: from_unix(payload.last_used_at),
        }))
    }

    /// Seals a session into a `Set-Cookie` value.
    ///
    /// # Errors
    ///
    /// Returns [`SessionError::Unwritable`] when the payload cannot be encoded.
    pub fn write(&self, session: &ConnectionSession) -> Result<String, SessionError> {
        let payload = SessionPayload {
            endpoint: session.connection.endpoint.clone(),
            access_key_id: session.connection.access_key_id.clone(),
            secret_access_key: session.connection.secret_access_key.clone(),
            region: session.connection.region.clone(),
            force_path_style: session.connection.force_path_style,
            skip_tls_verification: session.connection.skip_tls_verification,
            created_at: session.created_at.unix_timestamp(),
            last_used_at: session.last_used_at.unix_timestamp(),
        };
        let encoded = serde_json::to_string(&payload)
            .map_err(|error| SessionError::Unwritable(error.to_string()))?;

        let mut jar = CookieJar::new();
        jar.private_mut(&self.key)
            .add(self.decorate(Cookie::new(COOKIE_NAME, encoded)));
        jar.delta()
            .next()
            .map(|cookie| cookie.encoded().to_string())
            .ok_or_else(|| SessionError::Unwritable("the jar produced no cookie".to_owned()))
    }

    /// Builds the `Set-Cookie` value that removes the session.
    #[must_use]
    pub fn clear(&self) -> String {
        let mut jar = CookieJar::new();
        jar.add_original(Cookie::new(COOKIE_NAME, ""));
        jar.remove(self.decorate(Cookie::from(COOKIE_NAME)));
        jar.delta()
            .next()
            .map_or_else(String::new, |cookie| cookie.encoded().to_string())
    }

    /// Applies the attributes every session cookie must carry.
    ///
    /// `SameSite=Lax` is what stops a cross-site form from driving a mutation
    /// with the user's credentials, so it is applied here rather than left to
    /// each call site.
    fn decorate(&self, mut cookie: Cookie<'static>) -> Cookie<'static> {
        cookie.set_http_only(true);
        cookie.set_secure(self.secure);
        cookie.set_same_site(SameSite::Lax);
        cookie.set_path(self.path.clone());
        cookie
    }
}

/// Converts a Unix timestamp, falling back to the epoch for an unusable value.
fn from_unix(seconds: i64) -> OffsetDateTime {
    OffsetDateTime::from_unix_timestamp(seconds).unwrap_or(OffsetDateTime::UNIX_EPOCH)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "an-operator-chosen-secret-of-sufficient-length";

    fn sample() -> ConnectionSession {
        ConnectionSession {
            connection: S3Connection {
                endpoint: "https://minio.example.com".to_owned(),
                access_key_id: "AKIAEXAMPLE".to_owned(),
                secret_access_key: "s3cr3t-value".to_owned(),
                region: "us-east-1".to_owned(),
                force_path_style: true,
                skip_tls_verification: false,
            },
            created_at: OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap(),
            last_used_at: OffsetDateTime::from_unix_timestamp(1_700_000_500).unwrap(),
        }
    }

    fn header_from(set_cookie: &str) -> String {
        set_cookie
            .split(';')
            .next()
            .expect("a Set-Cookie value always has a name=value pair")
            .to_owned()
    }

    #[test]
    fn a_sealed_session_round_trips() {
        let store = SessionStore::new(SECRET, "/", true);
        let sealed = store.write(&sample()).unwrap();
        let restored = store.read(Some(&header_from(&sealed))).unwrap().unwrap();

        assert_eq!(restored.connection.endpoint, "https://minio.example.com");
        assert_eq!(restored.connection.secret_access_key, "s3cr3t-value");
        assert!(restored.connection.force_path_style);
        assert_eq!(restored.created_at.unix_timestamp(), 1_700_000_000);
    }

    #[test]
    fn the_secret_never_appears_in_the_cookie() {
        let store = SessionStore::new(SECRET, "/", true);
        let sealed = store.write(&sample()).unwrap();
        assert!(!sealed.contains("s3cr3t-value"));
        assert!(!sealed.contains("AKIAEXAMPLE"));
    }

    #[test]
    fn a_missing_cookie_is_not_an_error() {
        let store = SessionStore::new(SECRET, "/", true);
        assert!(store.read(None).unwrap().is_none());
        assert!(store.read(Some("other=1")).unwrap().is_none());
    }

    #[test]
    fn a_cookie_sealed_with_another_secret_is_rejected() {
        let sealed = SessionStore::new(SECRET, "/", true)
            .write(&sample())
            .unwrap();
        let other = SessionStore::new("a-completely-different-secret-value-32", "/", true);
        assert!(other.read(Some(&header_from(&sealed))).is_err());
    }

    #[test]
    fn a_tampered_cookie_is_rejected() {
        let store = SessionStore::new(SECRET, "/", true);
        let sealed = store.write(&sample()).unwrap();
        let mut header = header_from(&sealed);
        header.push('x');
        assert!(store.read(Some(&header)).is_err());
    }

    #[test]
    fn attributes_protect_the_credential_bearing_cookie() {
        let sealed = SessionStore::new(SECRET, "/dashboard", true)
            .write(&sample())
            .unwrap();
        assert!(sealed.contains("HttpOnly"));
        assert!(sealed.contains("Secure"));
        assert!(sealed.contains("SameSite=Lax"));
        assert!(sealed.contains("Path=/dashboard"));
    }

    #[test]
    fn an_insecure_deployment_omits_the_secure_attribute() {
        let sealed = SessionStore::new(SECRET, "/", false)
            .write(&sample())
            .unwrap();
        assert!(!sealed.contains("Secure"));
        assert!(sealed.contains("HttpOnly"));
    }

    #[test]
    fn clearing_expires_the_cookie_on_the_same_path() {
        let cleared = SessionStore::new(SECRET, "/dashboard", true).clear();
        assert!(cleared.contains(COOKIE_NAME));
        assert!(cleared.contains("Path=/dashboard"));
    }
}
