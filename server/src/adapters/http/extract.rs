//! Request extractors.

use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, header};

use super::errors::ApiError;
use super::state::AppState;
use crate::adapters::session::ConnectionSession;
use crate::domain::capacity::CapacityScope;
use crate::domain::errors::{StorageError, StorageErrorKind};
use crate::domain::ports::{ListObjectsInput, ObjectStorage};

/// A request carrying a usable session, with storage already bound to it.
///
/// Extracting this is what enforces authentication: a handler that names it
/// cannot run without a session, so the guard cannot be forgotten at a call
/// site the way an explicit check can.
pub struct ActiveSession {
    /// Storage bound to this session's credentials.
    pub storage: Arc<dyn ObjectStorage>,
}

impl ActiveSession {
    /// Returns the buckets this session's own credentials can list.
    ///
    /// The authority on what a caller may be told about. Anything derived from
    /// the shared capacity index has to be filtered through this, because that
    /// index is built by a key that sees more than any one session does.
    ///
    /// # Errors
    ///
    /// Returns the storage failure when the backend refuses the listing.
    pub async fn visible_buckets(&self) -> Result<Vec<String>, ApiError> {
        Ok(self
            .storage
            .list_buckets()
            .await?
            .into_iter()
            .map(|bucket| bucket.name)
            .collect())
    }

    /// Fails unless this session's own credentials can list `bucket`.
    ///
    /// # Errors
    ///
    /// Returns [`ApiError::Storage`] with a not-found kind when the bucket is
    /// invisible, which deliberately does not distinguish "does not exist" from
    /// "not yours": the difference is itself information the caller has no
    /// claim to.
    pub async fn require_bucket(&self, bucket: &str) -> Result<(), ApiError> {
        if self
            .visible_buckets()
            .await?
            .iter()
            .any(|name| name == bucket)
        {
            return Ok(());
        }
        Err(ApiError::Storage(StorageError::new(
            StorageErrorKind::NotFound,
        )))
    }

    /// Fails unless this session's own credentials can list inside `scope`.
    ///
    /// Closes the one gap bucket-level filtering leaves: a policy granting
    /// `s3://data/team-a/*` and nothing else is invisible to a bucket listing,
    /// so without this probe the shared index would happily report team-b's
    /// totals to someone who cannot read a single key of them.
    ///
    /// Costs one listing of a single key, which is why it is opt-in: only a
    /// deployment using prefix-scoped policies needs to pay it.
    ///
    /// # Errors
    ///
    /// Returns the backend's own refusal, so a denial is reported as a denial
    /// rather than being recast as something the caller might retry.
    pub async fn require_prefix(&self, scope: &CapacityScope) -> Result<(), ApiError> {
        self.storage
            .list_objects(&ListObjectsInput {
                bucket: scope.bucket_name().to_owned(),
                prefix: scope.prefix_path().to_owned(),
                delimiter: String::new(),
                continuation_token: None,
                max_keys: Some(1),
            })
            .await?;
        Ok(())
    }
}

impl FromRequestParts<AppState> for ActiveSession {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = read_session(&parts.headers, state)?.ok_or(ApiError::Unauthenticated)?;
        let storage = state.storage_factory().create(&session.connection)?;
        Ok(Self { storage })
    }
}

/// Reads the session cookie without requiring one to be present.
///
/// # Errors
///
/// Returns [`ApiError::Unauthenticated`] when a cookie is present but cannot be
/// opened, which is what a rotated `SESSION_SECRET` looks like.
pub fn read_session(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<Option<ConnectionSession>, ApiError> {
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok());

    state
        .sessions()
        .read(cookie)
        .map_err(|_| ApiError::Unauthenticated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FakeStorage;
    use crate::domain::errors::StorageErrorKind;

    fn session(storage: FakeStorage) -> ActiveSession {
        ActiveSession {
            storage: Arc::new(storage),
        }
    }

    #[tokio::test]
    async fn only_the_buckets_the_session_can_list_are_visible() {
        let session = session(FakeStorage::default().with_buckets(["photos", "backups"]));
        assert_eq!(
            session.visible_buckets().await.unwrap(),
            ["photos", "backups"]
        );
    }

    #[tokio::test]
    async fn a_bucket_outside_the_session_is_refused() {
        // The shared index is built by a key that sees more than any one
        // session, so this check is what keeps the extra out of the response.
        let session = session(FakeStorage::default().with_buckets(["photos"]));

        let error = session.require_bucket("secret").await.unwrap_err();
        match error {
            ApiError::Storage(error) => {
                assert_eq!(
                    error.kind(),
                    StorageErrorKind::NotFound,
                    "a refusal must not distinguish absent from forbidden"
                );
            }
            other => panic!("expected a storage refusal, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_bucket_within_the_session_is_allowed() {
        let session = session(FakeStorage::default().with_buckets(["photos"]));
        assert!(session.require_bucket("photos").await.is_ok());
    }

    #[tokio::test]
    async fn a_prefix_probe_passes_on_the_backends_refusal() {
        let session = session(
            FakeStorage::default().failing(StorageError::new(StorageErrorKind::AccessDenied)),
        );

        let error = session
            .require_prefix(&CapacityScope::prefix("data", "team-b/"))
            .await
            .unwrap_err();
        assert_eq!(error.code(), "access_denied");
    }

    #[tokio::test]
    async fn a_prefix_probe_reads_a_single_key_of_the_prefix_it_checks() {
        let storage = FakeStorage::default().with_page(
            None,
            crate::application::test_double::page("data", "team-a/", Vec::new(), Vec::new(), None),
        );
        let session = ActiveSession {
            storage: Arc::new(storage.clone()),
        };

        session
            .require_prefix(&CapacityScope::prefix("data", "team-a/"))
            .await
            .unwrap();

        assert_eq!(storage.listed_prefixes(), ["team-a/"]);
    }
}
