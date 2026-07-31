//! Deleting the objects a cleanup plan proposed.

use std::collections::BTreeMap;

use crate::domain::errors::StorageError;
use crate::domain::models::KeyFailure;
use crate::domain::ports::ObjectStorage;

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
/// # Errors
///
/// Returns a [`StorageError`] when a bucket's delete request fails outright.
pub async fn delete_cleanup_candidates(
    storage: &dyn ObjectStorage,
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
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FakeStorage;

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

        let results = delete_cleanup_candidates(&storage, &targets).await.unwrap();

        assert_eq!(results.len(), 2);
        let calls = storage.calls.lock().unwrap().clone();
        assert_eq!(
            calls,
            ["delete backups db.sql", "delete photos a.jpg,b.jpg"]
        );
    }

    #[tokio::test]
    async fn nothing_to_delete_makes_no_request() {
        let storage = FakeStorage::default();
        let results = delete_cleanup_candidates(&storage, &[]).await.unwrap();

        assert!(results.is_empty());
        assert!(storage.calls.lock().unwrap().is_empty());
    }
}
