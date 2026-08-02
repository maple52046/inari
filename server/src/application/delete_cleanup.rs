//! Deleting the objects a cleanup plan proposed.

use std::collections::BTreeMap;

use crate::domain::errors::StorageError;
use crate::domain::models::KeyFailure;
use crate::domain::ports::{CapacityIndex, ObjectStorage};

use super::dirty_scopes::scopes_for_cleanup;

/// A single object to delete, identified by its bucket and key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupDeleteTarget {
    /// Bucket holding the object.
    pub bucket: String,
    /// Full object key.
    pub key: String,
}

/// Per-bucket outcome of a cleanup deletion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupBucketDeleteResult {
    /// Bucket the keys belonged to.
    pub bucket: String,
    /// Keys the backend confirmed as removed.
    pub deleted: Vec<String>,
    /// Keys that survived.
    pub failed: Vec<KeyFailure>,
}

/// Deletes cleanup candidates, one request per bucket.
///
/// Grouping is required rather than cosmetic: `DeleteObjects` is bucket-scoped,
/// and a plan spans buckets. One result per affected bucket lets the UI report
/// success and failure separately.
///
/// Every affected bucket is marked for re-measurement here rather than at the
/// call site. This is the mutation path most easily overlooked, which is
/// exactly why the obligation lives in the signature.
///
/// # Errors
///
/// Returns a [`StorageError`] when a bucket's delete request fails outright.
pub async fn delete_cleanup_candidates(
    storage: &dyn ObjectStorage,
    index: &dyn CapacityIndex,
    targets: &[CleanupDeleteTarget],
) -> Result<Vec<CleanupBucketDeleteResult>, StorageError> {
    let mut grouped: BTreeMap<&str, Vec<String>> = BTreeMap::new();
    for target in targets {
        grouped
            .entry(target.bucket.as_str())
            .or_default()
            .push(target.key.clone());
    }

    let mut results = Vec::with_capacity(grouped.len());
    for (bucket, keys) in grouped {
        let result = storage.delete_objects(bucket, &keys).await?;
        results.push(CleanupBucketDeleteResult {
            bucket: bucket.to_owned(),
            deleted: result.deleted,
            failed: result.failed,
        });
    }
    index.mark_dirty(&scopes_for_cleanup(&results));
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeCapacityIndex, FakeStorage};

    fn target(bucket: &str, key: &str) -> CleanupDeleteTarget {
        CleanupDeleteTarget {
            bucket: bucket.to_owned(),
            key: key.to_owned(),
        }
    }

    #[tokio::test]
    async fn keys_are_grouped_into_one_request_per_bucket() {
        let storage = FakeStorage::default();
        let targets = [
            target("photos", "a.jpg"),
            target("backups", "db.sql"),
            target("photos", "b.jpg"),
        ];

        let results = delete_cleanup_candidates(&storage, &FakeCapacityIndex::default(), &targets)
            .await
            .unwrap();

        assert_eq!(results.len(), 2);
        let calls = storage.calls.lock().unwrap().clone();
        assert_eq!(
            calls,
            ["delete backups db.sql", "delete photos a.jpg,b.jpg"]
        );
    }

    #[tokio::test]
    async fn every_affected_bucket_is_marked_for_re_measurement() {
        // The cleanup planner is the mutation path most easily forgotten, so
        // this is the one that proves the obligation is enforced rather than
        // remembered.
        let storage = FakeStorage::default();
        let index = FakeCapacityIndex::default();
        let targets = [target("photos", "raw/a.jpg"), target("backups", "db.sql")];

        delete_cleanup_candidates(&storage, &index, &targets)
            .await
            .unwrap();

        assert_eq!(index.dirtied(), ["backups", "photos/raw/"]);
    }

    #[tokio::test]
    async fn nothing_to_delete_makes_no_request() {
        let storage = FakeStorage::default();
        let results = delete_cleanup_candidates(&storage, &FakeCapacityIndex::default(), &[])
            .await
            .unwrap();

        assert!(results.is_empty());
        assert!(storage.calls.lock().unwrap().is_empty());
    }
}
