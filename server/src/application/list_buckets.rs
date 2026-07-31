//! Listing the buckets a session can see.

use crate::domain::errors::StorageError;
use crate::domain::models::BucketSummary;
use crate::domain::ports::ObjectStorage;

/// Lists every bucket the connection can see.
///
/// # Errors
///
/// Returns a [`StorageError`] when the backend refuses or cannot be reached.
pub async fn list_buckets(storage: &dyn ObjectStorage) -> Result<Vec<BucketSummary>, StorageError> {
    storage.list_buckets().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FakeStorage;
    use crate::domain::errors::StorageErrorKind;

    #[tokio::test]
    async fn buckets_are_passed_through_unchanged() {
        let storage = FakeStorage::default().with_buckets(["photos", "backups"]);
        let buckets = list_buckets(&storage).await.unwrap();

        let names: Vec<_> = buckets.iter().map(|bucket| bucket.name.as_str()).collect();
        assert_eq!(names, ["photos", "backups"]);
    }

    #[tokio::test]
    async fn an_empty_account_is_not_an_error() {
        let storage = FakeStorage::default();
        assert!(list_buckets(&storage).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_refusal_propagates() {
        let storage =
            FakeStorage::default().failing(StorageError::new(StorageErrorKind::AccessDenied));
        let error = list_buckets(&storage).await.unwrap_err();
        assert_eq!(error.kind(), StorageErrorKind::AccessDenied);
    }
}
