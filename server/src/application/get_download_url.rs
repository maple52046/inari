//! Signing a download URL.

use crate::domain::errors::StorageError;
use crate::domain::ports::{DEFAULT_DOWNLOAD_URL_TTL, ObjectStorage};

/// Longest lifetime a caller may request, matching the UI's widest choice.
///
/// A cap belongs on the server because the expiry arrives from the browser: a
/// crafted request could otherwise mint a URL that outlives the session that
/// authorised it.
pub const MAX_DOWNLOAD_URL_TTL: u64 = 86_400;

/// Returns a presigned URL for one object.
///
/// # Errors
///
/// Returns a [`StorageError`] when the URL cannot be signed.
pub async fn get_download_url(
    storage: &dyn ObjectStorage,
    bucket: &str,
    key: &str,
    expires_in: Option<u64>,
) -> Result<String, StorageError> {
    let expires_in = expires_in
        .unwrap_or(DEFAULT_DOWNLOAD_URL_TTL)
        .clamp(1, MAX_DOWNLOAD_URL_TTL);
    storage.download_url(bucket, key, expires_in).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FakeStorage;

    #[tokio::test]
    async fn the_default_lifetime_is_one_hour() {
        let storage = FakeStorage::default();
        let url = get_download_url(&storage, "photos", "a.jpg", None)
            .await
            .unwrap();
        assert!(url.ends_with("expires=3600"));
    }

    #[tokio::test]
    async fn an_excessive_lifetime_is_capped() {
        let storage = FakeStorage::default();
        let url = get_download_url(&storage, "photos", "a.jpg", Some(u64::MAX))
            .await
            .unwrap();
        assert!(url.ends_with(&format!("expires={MAX_DOWNLOAD_URL_TTL}")));
    }

    #[tokio::test]
    async fn a_zero_lifetime_is_raised_to_something_usable() {
        let storage = FakeStorage::default();
        let url = get_download_url(&storage, "photos", "a.jpg", Some(0))
            .await
            .unwrap();
        assert!(url.ends_with("expires=1"));
    }
}
