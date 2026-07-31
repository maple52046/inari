//! Deleting a batch of objects.

use crate::domain::errors::StorageError;
use crate::domain::models::DeleteResult;
use crate::domain::ports::ObjectStorage;

/// Deletes the given keys from one bucket.
///
/// # Errors
///
/// Returns a [`StorageError`] only when the request itself fails; per-key
/// refusals come back in [`DeleteResult::failed`].
pub async fn delete_objects(
    storage: &dyn ObjectStorage,
    bucket: &str,
    keys: &[String],
) -> Result<DeleteResult, StorageError> {
    if keys.is_empty() {
        return Ok(DeleteResult::default());
    }
    storage.delete_objects(bucket, keys).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FakeStorage;

    #[tokio::test]
    async fn an_empty_request_never_reaches_the_backend() {
        let storage = FakeStorage::default();
        let result = delete_objects(&storage, "photos", &[]).await.unwrap();

        assert!(result.deleted.is_empty());
        assert!(storage.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn every_key_is_forwarded_in_one_call() {
        let storage = FakeStorage::default();
        let keys = vec!["a.jpg".to_owned(), "b.jpg".to_owned()];
        let result = delete_objects(&storage, "photos", &keys).await.unwrap();

        assert_eq!(result.deleted, keys);
        assert_eq!(
            storage.calls.lock().unwrap().as_slice(),
            ["delete photos a.jpg,b.jpg"]
        );
    }
}
