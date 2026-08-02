//! Deleting a batch of objects.

use crate::domain::errors::StorageError;
use crate::domain::models::DeleteResult;
use crate::domain::ports::{CapacityIndex, ObjectStorage};

use super::dirty_scopes::scopes_for_delete;

/// Deletes the given keys from one bucket.
///
/// The capacity index is told what changed as part of doing the deleting, not
/// as a step a caller has to remember: taking the port here is what makes it
/// impossible to add a path that removes objects and leaves the stored figures
/// claiming they are still there.
///
/// Marking is record-only, so nothing here waits on the re-measurement.
///
/// # Errors
///
/// Returns a [`StorageError`] only when the request itself fails; per-key
/// refusals come back in [`DeleteResult::failed`].
pub async fn delete_objects(
    storage: &dyn ObjectStorage,
    index: &dyn CapacityIndex,
    bucket: &str,
    keys: &[String],
) -> Result<DeleteResult, StorageError> {
    if keys.is_empty() {
        return Ok(DeleteResult::default());
    }
    let result = storage.delete_objects(bucket, keys).await?;
    index.mark_dirty(&scopes_for_delete(bucket, &result));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeCapacityIndex, FakeStorage};

    #[tokio::test]
    async fn an_empty_request_never_reaches_the_backend() {
        let storage = FakeStorage::default();
        let index = FakeCapacityIndex::default();
        let result = delete_objects(&storage, &index, "photos", &[])
            .await
            .unwrap();

        assert!(result.deleted.is_empty());
        assert!(storage.calls.lock().unwrap().is_empty());
        assert!(index.dirtied().is_empty());
    }

    #[tokio::test]
    async fn every_key_is_forwarded_in_one_call() {
        let storage = FakeStorage::default();
        let index = FakeCapacityIndex::default();
        let keys = vec!["a.jpg".to_owned(), "b.jpg".to_owned()];
        let result = delete_objects(&storage, &index, "photos", &keys)
            .await
            .unwrap();

        assert_eq!(result.deleted, keys);
        assert_eq!(
            storage.calls.lock().unwrap().as_slice(),
            ["delete photos a.jpg,b.jpg"]
        );
    }

    #[tokio::test]
    async fn what_was_removed_is_marked_for_re_measurement() {
        let storage = FakeStorage::default();
        let index = FakeCapacityIndex::default();
        let keys = vec!["raw/2024/a.jpg".to_owned(), "raw/2024/b.jpg".to_owned()];

        delete_objects(&storage, &index, "photos", &keys)
            .await
            .unwrap();

        assert_eq!(index.dirtied(), ["photos/raw/2024/"]);
    }
}
