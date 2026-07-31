//! Domain models and ranking for the cleanup planner.
//!
//! Cleanup works across buckets, so unlike [`ObjectSummary`](super::models::ObjectSummary)
//! every candidate carries its owning bucket. Time is always `last_modified`
//! because standard S3 listings expose no universal creation time.

use std::cmp::Ordering;
use std::time::SystemTime;

/// Selection of what to scan.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CleanupScope {
    /// [`None`] means every accessible bucket.
    pub bucket: Option<String>,
    /// Restricts the scan to a key prefix within the bucket.
    pub prefix: Option<String>,
}

/// Filters and limits applied while building a plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupScanOptions {
    /// Keep objects at least this large.
    pub min_size_bytes: Option<u64>,
    /// Keep objects last modified strictly before this instant.
    pub older_than: Option<SystemTime>,
    /// Hard cap on the number of returned candidates.
    pub max_results: usize,
}

/// A single object proposed for cleanup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupCandidate {
    /// Bucket holding the object.
    pub bucket: String,
    /// Full object key.
    pub key: String,
    /// Size in bytes.
    pub size_bytes: u64,
    /// Last modification time, which ranking depends on.
    pub last_modified: SystemTime,
    /// Storage class, when reported.
    pub storage_class: Option<String>,
    /// Human-readable reasons this object was ranked as a candidate.
    pub reasons: Vec<String>,
}

impl CleanupCandidate {
    /// Compares two candidates by cleanup priority.
    ///
    /// Oldest first, then largest first, then bucket and key ascending as
    /// deterministic tie-breakers so equal time and size never produce an
    /// unstable order.
    #[must_use]
    pub fn compare(&self, other: &Self) -> Ordering {
        self.last_modified
            .cmp(&other.last_modified)
            .then_with(|| other.size_bytes.cmp(&self.size_bytes))
            .then_with(|| self.bucket.cmp(&other.bucket))
            .then_with(|| self.key.cmp(&other.key))
    }
}

/// Derives the reasons an object qualifies as a candidate.
///
/// When no filter is active the object is included purely by ranking, which is
/// stated explicitly so the UI never shows an empty reason.
#[must_use]
pub fn derive_reasons(
    size_bytes: u64,
    last_modified: SystemTime,
    options: &CleanupScanOptions,
) -> Vec<String> {
    let mut reasons = Vec::new();
    if options
        .older_than
        .is_some_and(|threshold| last_modified < threshold)
    {
        reasons.push("Older than selected date".to_owned());
    }
    if options
        .min_size_bytes
        .is_some_and(|minimum| size_bytes >= minimum)
    {
        reasons.push("Larger than selected size".to_owned());
    }
    if reasons.is_empty() {
        reasons.push("Ranked by cleanup order".to_owned());
    }
    reasons
}

/// A bucket that could not be scanned, surfaced without aborting the scan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupWarning {
    /// Bucket that failed.
    pub bucket: String,
    /// Why it failed, safe to show a user.
    pub message: String,
}

/// Aggregate counts for a completed scan.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CleanupPlanSummary {
    /// Buckets successfully walked.
    pub scanned_buckets: u32,
    /// Objects inspected, whether or not they matched.
    pub scanned_objects: u64,
    /// Candidates returned after the cap.
    pub candidate_count: usize,
    /// Combined size of the returned candidates.
    pub candidate_total_size: u64,
}

/// Result of a cleanup scan: ranked candidates plus context and warnings.
#[derive(Debug, Clone)]
pub struct CleanupPlan {
    /// Ranked candidates, best first.
    pub candidates: Vec<CleanupCandidate>,
    /// Aggregate counts.
    pub summary: CleanupPlanSummary,
    /// Buckets that could not be scanned.
    pub warnings: Vec<CleanupWarning>,
    /// When the scan finished.
    pub scanned_at: SystemTime,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, UNIX_EPOCH};

    fn candidate(bucket: &str, key: &str, size: u64, at: u64) -> CleanupCandidate {
        CleanupCandidate {
            bucket: bucket.to_owned(),
            key: key.to_owned(),
            size_bytes: size,
            last_modified: UNIX_EPOCH + Duration::from_secs(at),
            storage_class: None,
            reasons: Vec::new(),
        }
    }

    #[test]
    fn the_oldest_object_ranks_first() {
        let older = candidate("b", "a", 1, 100);
        let newer = candidate("b", "a", 999, 200);
        assert_eq!(older.compare(&newer), Ordering::Less);
    }

    #[test]
    fn equal_ages_rank_the_largest_first() {
        let big = candidate("b", "a", 900, 100);
        let small = candidate("b", "z", 100, 100);
        assert_eq!(big.compare(&small), Ordering::Less);
    }

    #[test]
    fn bucket_then_key_break_remaining_ties() {
        let first = candidate("alpha", "a", 100, 100);
        let second = candidate("beta", "a", 100, 100);
        assert_eq!(first.compare(&second), Ordering::Less);

        let early = candidate("alpha", "a", 100, 100);
        let late = candidate("alpha", "b", 100, 100);
        assert_eq!(early.compare(&late), Ordering::Less);
    }

    #[test]
    fn an_unfiltered_scan_still_states_a_reason() {
        let options = CleanupScanOptions {
            min_size_bytes: None,
            older_than: None,
            max_results: 10,
        };
        let reasons = derive_reasons(10, UNIX_EPOCH, &options);
        assert_eq!(reasons, ["Ranked by cleanup order"]);
    }

    #[test]
    fn both_filters_contribute_their_own_reason() {
        let options = CleanupScanOptions {
            min_size_bytes: Some(100),
            older_than: Some(UNIX_EPOCH + Duration::from_secs(500)),
            max_results: 10,
        };
        let reasons = derive_reasons(200, UNIX_EPOCH + Duration::from_secs(100), &options);
        assert_eq!(
            reasons,
            ["Older than selected date", "Larger than selected size"]
        );
    }
}
