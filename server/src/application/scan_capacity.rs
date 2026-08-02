//! Walking one location to produce a capacity measurement.

use crate::domain::capacity::CapacityMeasurement;
use crate::domain::errors::StorageError;
use crate::domain::ports::{ListObjectsInput, ObjectStorage, ScanPacer};

use super::scan_usage::SCAN_PAGE_SIZE;

/// Walks everything under the measurement's scope and folds it in.
///
/// Memory stays proportional to the number of distinct prefixes rather than to
/// the number of keys: each page is folded into the aggregates and dropped, and
/// objects never become nodes of their own.
///
/// Every page is admitted by the pacer first, so a walk of an enormous location
/// costs the backend a bounded rate rather than as much as the network allows.
///
/// # Errors
///
/// Returns a [`StorageError`] when any page of the walk fails. The measurement
/// is discarded in that case rather than applied half-finished, which would
/// install an undercount as though it were a completed scan.
pub async fn scan_capacity(
    storage: &dyn ObjectStorage,
    pacer: &dyn ScanPacer,
    mut measurement: CapacityMeasurement,
) -> Result<CapacityMeasurement, StorageError> {
    let bucket = measurement.scope().bucket_name().to_owned();
    let prefix = measurement.scope().prefix_path().to_owned();
    let mut continuation_token = None;

    loop {
        pacer.acquire().await;
        let page = storage
            .list_objects(&ListObjectsInput {
                bucket: bucket.clone(),
                prefix: prefix.clone(),
                // A flat listing walks the whole subtree in one pass, which is
                // what lets every level be aggregated from a single walk.
                delimiter: String::new(),
                continuation_token,
                max_keys: Some(SCAN_PAGE_SIZE),
            })
            .await?;

        for object in &page.objects {
            measurement.record(&object.key, object.size);
        }

        continuation_token = page.continuation_token;
        if continuation_token.is_none() {
            return Ok(measurement);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeStorage, NoPacing, object, page};
    use crate::domain::capacity::{CapacityLimits, CapacityScope, CapacityTree};
    use crate::domain::errors::StorageErrorKind;
    use std::time::UNIX_EPOCH;

    const LIMITS: CapacityLimits = CapacityLimits {
        max_depth: 6,
        max_nodes: 1000,
    };

    fn measurement(scope: CapacityScope) -> CapacityMeasurement {
        CapacityMeasurement::new(scope, LIMITS)
    }

    #[tokio::test]
    async fn every_page_is_folded_into_the_aggregates() {
        let storage = FakeStorage::default()
            .with_page(
                None,
                page(
                    "photos",
                    "",
                    vec![object("raw/a.jpg", 100)],
                    Vec::new(),
                    Some("t2"),
                ),
            )
            .with_page(
                Some("t2"),
                page(
                    "photos",
                    "",
                    vec![object("raw/b.jpg", 200), object("thumbs/c.jpg", 5)],
                    Vec::new(),
                    None,
                ),
            );

        let measured = scan_capacity(
            &storage,
            &NoPacing::default(),
            measurement(CapacityScope::bucket("photos")),
        )
        .await
        .unwrap();

        assert_eq!(measured.total_size(), 305);
        assert_eq!(measured.object_count(), 3);

        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(measured, UNIX_EPOCH);
        assert_eq!(
            tree.read(&CapacityScope::prefix("photos", "raw/"))
                .total_size,
            300
        );
    }

    #[tokio::test]
    async fn a_pacer_admits_one_request_per_page() {
        let storage = FakeStorage::default()
            .with_page(
                None,
                page("photos", "", vec![object("a", 1)], Vec::new(), Some("t2")),
            )
            .with_page(
                Some("t2"),
                page("photos", "", vec![object("b", 1)], Vec::new(), None),
            );
        let pacer = NoPacing::default();

        scan_capacity(
            &storage,
            &pacer,
            measurement(CapacityScope::bucket("photos")),
        )
        .await
        .unwrap();

        assert_eq!(pacer.admitted(), 2);
    }

    #[tokio::test]
    async fn a_failed_page_abandons_the_whole_measurement() {
        // Applying a partial walk would install an undercount indistinguishable
        // from a completed scan, so the error must reach the caller instead.
        let storage =
            FakeStorage::default().failing(StorageError::new(StorageErrorKind::PaginationFailed));

        let error = scan_capacity(
            &storage,
            &NoPacing::default(),
            measurement(CapacityScope::bucket("photos")),
        )
        .await
        .unwrap_err();

        assert_eq!(error.kind(), StorageErrorKind::PaginationFailed);
    }

    #[tokio::test]
    async fn a_prefix_scan_lists_only_that_prefix() {
        let storage = FakeStorage::default().with_page(
            None,
            page(
                "photos",
                "raw/",
                vec![object("raw/a.jpg", 10)],
                Vec::new(),
                None,
            ),
        );

        let measured = scan_capacity(
            &storage,
            &NoPacing::default(),
            measurement(CapacityScope::prefix("photos", "raw/")),
        )
        .await
        .unwrap();

        assert_eq!(measured.total_size(), 10);
        assert_eq!(
            storage.listed_prefixes(),
            ["raw/"],
            "a targeted rescan must not walk the whole bucket"
        );
    }
}
