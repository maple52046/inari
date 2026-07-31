//! Measuring how much a bucket holds.

use crate::domain::errors::StorageError;
use crate::domain::models::{UsageScope, usage_scope_label};
use crate::domain::ports::{ListObjectsInput, ObjectStorage};

/// Keys requested per page while walking a bucket recursively.
pub const SCAN_PAGE_SIZE: i32 = 1000;

/// Estimates one bucket's usage by walking every visible object.
///
/// Memory is constant regardless of bucket size: each page updates two counters
/// and is then dropped, so nothing accumulates.
///
/// This is a best-effort estimate. It excludes provider overhead, incomplete
/// multipart uploads, object versions, and delete markers, so callers must
/// present the result as scan-based rather than authoritative.
///
/// # Errors
///
/// Returns a [`StorageError`] when any page of the walk fails.
pub async fn scan_bucket_usage(
    storage: &dyn ObjectStorage,
    bucket: &str,
) -> Result<UsageScope, StorageError> {
    let mut continuation_token = None;
    let mut total_size = 0_u64;
    let mut object_count = 0_u64;

    loop {
        let page = storage
            .list_objects(&ListObjectsInput {
                bucket: bucket.to_owned(),
                prefix: String::new(),
                // A flat listing walks the whole bucket recursively.
                delimiter: String::new(),
                continuation_token,
                max_keys: Some(SCAN_PAGE_SIZE),
            })
            .await?;

        for object in &page.objects {
            total_size = total_size.saturating_add(object.size);
            object_count += 1;
        }

        continuation_token = page.continuation_token;
        if continuation_token.is_none() {
            break;
        }
    }

    Ok(UsageScope {
        scope: usage_scope_label(bucket, None),
        total_size,
        object_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeStorage, object, page};

    #[tokio::test]
    async fn a_single_page_bucket_is_summed() {
        let storage = FakeStorage::default().with_page(
            None,
            page(
                "photos",
                "",
                vec![object("a.jpg", 100), object("b.jpg", 250)],
                Vec::new(),
                None,
            ),
        );

        let usage = scan_bucket_usage(&storage, "photos").await.unwrap();
        assert_eq!(usage.total_size, 350);
        assert_eq!(usage.object_count, 2);
        assert_eq!(usage.scope, "photos");
    }

    #[tokio::test]
    async fn every_page_is_walked() {
        let storage = FakeStorage::default()
            .with_page(
                None,
                page("photos", "", vec![object("a", 100)], Vec::new(), Some("t2")),
            )
            .with_page(
                Some("t2"),
                page("photos", "", vec![object("b", 200)], Vec::new(), Some("t3")),
            )
            .with_page(
                Some("t3"),
                page("photos", "", vec![object("c", 300)], Vec::new(), None),
            );

        let usage = scan_bucket_usage(&storage, "photos").await.unwrap();
        assert_eq!(usage.total_size, 600);
        assert_eq!(usage.object_count, 3);
    }

    #[tokio::test]
    async fn an_empty_bucket_measures_zero() {
        let storage = FakeStorage::default()
            .with_page(None, page("photos", "", Vec::new(), Vec::new(), None));

        let usage = scan_bucket_usage(&storage, "photos").await.unwrap();
        assert_eq!(usage.total_size, 0);
        assert_eq!(usage.object_count, 0);
    }
}
