//! Building a cleanup plan.

use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::time::SystemTime;

use super::scan_usage::SCAN_PAGE_SIZE;
use crate::domain::cleanup::{
    CleanupCandidate, CleanupPlan, CleanupPlanSummary, CleanupScanOptions, CleanupScope,
    CleanupWarning, derive_reasons,
};
use crate::domain::errors::StorageError;
use crate::domain::ports::{ListObjectsInput, ObjectStorage};

/// A candidate ordered by cleanup priority, best first.
///
/// [`CleanupCandidate`] cannot implement [`Ord`] itself without implying that
/// its ranking is its natural order, which would be wrong for a value that is
/// also compared for equality elsewhere.
#[derive(Debug, PartialEq, Eq)]
struct Ranked(CleanupCandidate);

impl Ord for Ranked {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.compare(&other.0)
    }
}

impl PartialOrd for Ranked {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Keeps only the best `capacity` candidates seen so far.
///
/// [`BinaryHeap`] is a max-heap and [`Ranked`] orders best-first, so its top is
/// always the *worst* retained candidate and can be evicted in constant time.
/// This is what bounds the scan's memory: the TypeScript original collected
/// every match before sorting, so a large bucket could hold millions of
/// candidates at once. The selected set is identical either way.
#[derive(Debug)]
struct TopK {
    capacity: usize,
    heap: BinaryHeap<Ranked>,
}

impl TopK {
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            heap: BinaryHeap::new(),
        }
    }

    fn offer(&mut self, candidate: CleanupCandidate) {
        if self.capacity == 0 {
            return;
        }
        let candidate = Ranked(candidate);
        if self.heap.len() < self.capacity {
            self.heap.push(candidate);
            return;
        }
        if let Some(worst) = self.heap.peek()
            && candidate < *worst
        {
            self.heap.pop();
            self.heap.push(candidate);
        }
    }

    fn into_sorted(self) -> Vec<CleanupCandidate> {
        let mut candidates: Vec<_> = self
            .heap
            .into_iter()
            .map(|Ranked(candidate)| candidate)
            .collect();
        candidates.sort_by(CleanupCandidate::compare);
        candidates
    }
}

/// Whether an object passes the scan's filters.
///
/// An object without a modification time never qualifies, because ranking is
/// built on that field.
fn matches(
    size_bytes: u64,
    last_modified: Option<SystemTime>,
    options: &CleanupScanOptions,
) -> Option<SystemTime> {
    let last_modified = last_modified?;
    if options
        .min_size_bytes
        .is_some_and(|minimum| size_bytes < minimum)
    {
        return None;
    }
    if options
        .older_than
        .is_some_and(|threshold| last_modified >= threshold)
    {
        return None;
    }
    Some(last_modified)
}

/// Walks one bucket, offering every match to the shared selection.
///
/// Returns how many objects were inspected.
async fn scan_bucket(
    storage: &dyn ObjectStorage,
    bucket: &str,
    prefix: Option<&str>,
    options: &CleanupScanOptions,
    selection: &mut TopK,
) -> Result<u64, StorageError> {
    let mut continuation_token = None;
    let mut scanned = 0_u64;

    loop {
        let page = storage
            .list_objects(&ListObjectsInput {
                bucket: bucket.to_owned(),
                prefix: prefix.unwrap_or_default().to_owned(),
                // A flat listing walks every object recursively.
                delimiter: String::new(),
                continuation_token,
                max_keys: Some(SCAN_PAGE_SIZE),
            })
            .await?;

        for object in &page.objects {
            scanned += 1;
            let Some(last_modified) = matches(object.size, object.last_modified, options) else {
                continue;
            };
            selection.offer(CleanupCandidate {
                bucket: bucket.to_owned(),
                key: object.key.clone(),
                size_bytes: object.size,
                last_modified,
                storage_class: object.storage_class.clone(),
                reasons: derive_reasons(object.size, last_modified, options),
            });
        }

        continuation_token = page.continuation_token;
        if continuation_token.is_none() {
            break;
        }
    }

    Ok(scanned)
}

/// Builds a cleanup plan by scanning the scope, filtering, and ranking.
///
/// Resilience: a per-bucket failure such as access denied becomes a warning and
/// the scan continues, so one inaccessible bucket never aborts an all-buckets
/// plan.
///
/// # Errors
///
/// Returns a [`StorageError`] only when the bucket list itself cannot be read,
/// which leaves nothing to scan.
pub async fn scan_cleanup(
    storage: &dyn ObjectStorage,
    scope: &CleanupScope,
    options: &CleanupScanOptions,
) -> Result<CleanupPlan, StorageError> {
    let buckets = match &scope.bucket {
        Some(bucket) => vec![bucket.clone()],
        None => storage
            .list_buckets()
            .await?
            .into_iter()
            .map(|bucket| bucket.name)
            .collect(),
    };

    let mut selection = TopK::new(options.max_results);
    let mut warnings = Vec::new();
    let mut scanned_objects = 0_u64;
    let mut scanned_buckets = 0_u32;

    for bucket in buckets {
        match scan_bucket(
            storage,
            &bucket,
            scope.prefix.as_deref(),
            options,
            &mut selection,
        )
        .await
        {
            Ok(scanned) => {
                scanned_buckets += 1;
                scanned_objects += scanned;
            }
            Err(error) => warnings.push(CleanupWarning {
                bucket,
                message: error.message().to_owned(),
            }),
        }
    }

    let candidates = selection.into_sorted();
    let candidate_total_size = candidates.iter().fold(0_u64, |sum, candidate| {
        sum.saturating_add(candidate.size_bytes)
    });

    Ok(CleanupPlan {
        summary: CleanupPlanSummary {
            scanned_buckets,
            scanned_objects,
            candidate_count: candidates.len(),
            candidate_total_size,
        },
        candidates,
        warnings,
        scanned_at: SystemTime::now(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeStorage, page};
    use crate::domain::errors::StorageErrorKind;
    use crate::domain::models::ObjectSummary;
    use std::time::{Duration, UNIX_EPOCH};

    fn aged(key: &str, size: u64, at: u64) -> ObjectSummary {
        ObjectSummary {
            key: key.to_owned(),
            name: key.to_owned(),
            size,
            last_modified: Some(UNIX_EPOCH + Duration::from_secs(at)),
            storage_class: None,
            etag: None,
        }
    }

    fn options(max_results: usize) -> CleanupScanOptions {
        CleanupScanOptions {
            min_size_bytes: None,
            older_than: None,
            max_results,
        }
    }

    fn one_bucket(objects: Vec<ObjectSummary>) -> FakeStorage {
        FakeStorage::default()
            .with_buckets(["photos"])
            .with_page(None, page("photos", "", objects, Vec::new(), None))
    }

    #[tokio::test]
    async fn candidates_come_back_oldest_first() {
        let storage = one_bucket(vec![
            aged("new.txt", 10, 300),
            aged("old.txt", 10, 100),
            aged("mid.txt", 10, 200),
        ]);
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };

        let plan = scan_cleanup(&storage, &scope, &options(10)).await.unwrap();
        let keys: Vec<_> = plan.candidates.iter().map(|c| c.key.as_str()).collect();
        assert_eq!(keys, ["old.txt", "mid.txt", "new.txt"]);
    }

    #[tokio::test]
    async fn the_cap_keeps_the_highest_priority_candidates() {
        let storage = one_bucket(vec![
            aged("newest.txt", 10, 400),
            aged("oldest.txt", 10, 100),
            aged("older.txt", 10, 200),
            aged("newer.txt", 10, 300),
        ]);
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };

        let plan = scan_cleanup(&storage, &scope, &options(2)).await.unwrap();
        let keys: Vec<_> = plan.candidates.iter().map(|c| c.key.as_str()).collect();
        assert_eq!(keys, ["oldest.txt", "older.txt"]);
        assert_eq!(plan.summary.scanned_objects, 4);
        assert_eq!(plan.summary.candidate_count, 2);
    }

    #[tokio::test]
    async fn bounded_selection_matches_collect_then_sort() {
        // The whole point of the heap is that it cannot change the answer.
        let objects: Vec<_> = (0_u64..200)
            .map(|index| aged(&format!("k{index:03}.txt"), index % 7, 1000 - index))
            .collect();

        let mut expected: Vec<_> = objects
            .iter()
            .map(|object| CleanupCandidate {
                bucket: "photos".to_owned(),
                key: object.key.clone(),
                size_bytes: object.size,
                last_modified: object.last_modified.unwrap(),
                storage_class: None,
                reasons: Vec::new(),
            })
            .collect();
        expected.sort_by(CleanupCandidate::compare);
        let expected: Vec<_> = expected.iter().take(25).map(|c| c.key.clone()).collect();

        let storage = one_bucket(objects);
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };
        let plan = scan_cleanup(&storage, &scope, &options(25)).await.unwrap();
        let actual: Vec<_> = plan.candidates.iter().map(|c| c.key.clone()).collect();

        assert_eq!(actual, expected);
    }

    #[tokio::test]
    async fn an_object_without_a_timestamp_never_qualifies() {
        let storage = one_bucket(vec![ObjectSummary {
            last_modified: None,
            ..aged("undated.txt", 10, 100)
        }]);
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };

        let plan = scan_cleanup(&storage, &scope, &options(10)).await.unwrap();
        assert!(plan.candidates.is_empty());
        assert_eq!(plan.summary.scanned_objects, 1);
    }

    #[tokio::test]
    async fn filters_exclude_objects_that_are_too_small_or_too_new() {
        let storage = one_bucket(vec![
            aged("small-old.txt", 10, 100),
            aged("big-old.txt", 5000, 100),
            aged("big-new.txt", 5000, 900),
        ]);
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };
        let filters = CleanupScanOptions {
            min_size_bytes: Some(1000),
            older_than: Some(UNIX_EPOCH + Duration::from_secs(500)),
            max_results: 10,
        };

        let plan = scan_cleanup(&storage, &scope, &filters).await.unwrap();
        let keys: Vec<_> = plan.candidates.iter().map(|c| c.key.as_str()).collect();
        assert_eq!(keys, ["big-old.txt"]);
        assert_eq!(
            plan.candidates[0].reasons,
            ["Older than selected date", "Larger than selected size"]
        );
    }

    #[tokio::test]
    async fn an_unreadable_bucket_becomes_a_warning() {
        let storage = FakeStorage::default()
            .with_buckets(["photos"])
            .failing(StorageError::new(StorageErrorKind::AccessDenied));
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };

        let plan = scan_cleanup(&storage, &scope, &options(10)).await.unwrap();
        assert_eq!(plan.warnings.len(), 1);
        assert_eq!(plan.warnings[0].bucket, "photos");
        assert_eq!(plan.summary.scanned_buckets, 0);
    }

    #[tokio::test]
    async fn the_candidate_total_covers_only_returned_candidates() {
        let storage = one_bucket(vec![
            aged("a.txt", 100, 100),
            aged("b.txt", 200, 200),
            aged("c.txt", 400, 300),
        ]);
        let scope = CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        };

        let plan = scan_cleanup(&storage, &scope, &options(2)).await.unwrap();
        assert_eq!(plan.summary.candidate_total_size, 300);
    }

    #[test]
    fn a_zero_cap_keeps_nothing() {
        let mut selection = TopK::new(0);
        selection.offer(CleanupCandidate {
            bucket: "b".to_owned(),
            key: "k".to_owned(),
            size_bytes: 1,
            last_modified: UNIX_EPOCH,
            storage_class: None,
            reasons: Vec::new(),
        });
        assert!(selection.into_sorted().is_empty());
    }
}
