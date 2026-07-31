//! Wire shapes for the cleanup planner and the usage scans.
//!
//! Split from [`super::dto`] only by subject; the same rules apply. The
//! generated mirror is written by `cargo test export_bindings`.

use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use ts_rs::TS;

use crate::application::delete_cleanup::{CleanupBucketDeleteResult, CleanupDeleteTarget};
use crate::application::scan_prefix_usage::{PrefixUsage, PrefixUsageEntry};
use crate::domain::cleanup::{
    CleanupCandidate, CleanupPlan, CleanupPlanSummary, CleanupScanOptions, CleanupScope,
    CleanupWarning,
};

use super::dto::{KeyFailureDto, UsageScopeDto};

/// Where the generated TypeScript mirror is written.
const BINDINGS: &str = "../../web/src/api/types.ts";

/// Renders a timestamp as RFC 3339.
fn to_rfc3339(value: SystemTime) -> Option<String> {
    OffsetDateTime::from(value).format(&Rfc3339).ok()
}

/// Usage of one immediate child of a scanned location.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct PrefixUsageEntryDto {
    /// Name relative to the scanned prefix.
    pub name: String,
    /// Whether this aggregates a sub-tree.
    pub is_prefix: bool,
    /// Combined size in bytes.
    #[ts(type = "number")]
    pub total_size: u64,
    /// Objects counted.
    #[ts(type = "number")]
    pub object_count: u64,
}

impl From<PrefixUsageEntry> for PrefixUsageEntryDto {
    fn from(entry: PrefixUsageEntry) -> Self {
        Self {
            name: entry.name,
            is_prefix: entry.is_prefix,
            total_size: entry.total_size,
            object_count: entry.object_count,
        }
    }
}

/// Breakdown of a location by what it directly contains.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct PrefixUsageDto {
    /// Human label for the location.
    pub scope: String,
    /// Direct children, largest first.
    pub entries: Vec<PrefixUsageEntryDto>,
    /// Combined size beneath the location.
    #[ts(type = "number")]
    pub total_size: u64,
    /// Objects beneath the location.
    #[ts(type = "number")]
    pub object_count: u64,
    /// Whether the breakdown stopped recording new children.
    pub truncated: bool,
}

impl From<PrefixUsage> for PrefixUsageDto {
    fn from(usage: PrefixUsage) -> Self {
        Self {
            scope: usage.scope,
            entries: usage.entries.into_iter().map(Into::into).collect(),
            total_size: usage.total_size,
            object_count: usage.object_count,
            truncated: usage.truncated,
        }
    }
}

/// A single object proposed for cleanup.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupCandidateDto {
    /// Bucket holding the object.
    pub bucket: String,
    /// Full object key.
    pub key: String,
    /// Size in bytes.
    #[ts(type = "number")]
    pub size_bytes: u64,
    /// Last modification time as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_modified: Option<String>,
    /// Storage class, when reported.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub storage_class: Option<String>,
    /// Why this object was ranked as a candidate.
    pub reasons: Vec<String>,
}

impl From<CleanupCandidate> for CleanupCandidateDto {
    fn from(candidate: CleanupCandidate) -> Self {
        Self {
            bucket: candidate.bucket,
            key: candidate.key,
            size_bytes: candidate.size_bytes,
            last_modified: to_rfc3339(candidate.last_modified),
            storage_class: candidate.storage_class,
            reasons: candidate.reasons,
        }
    }
}

/// A bucket that could not be scanned.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupWarningDto {
    /// Bucket that failed.
    pub bucket: String,
    /// Why it failed.
    pub message: String,
}

impl From<CleanupWarning> for CleanupWarningDto {
    fn from(warning: CleanupWarning) -> Self {
        Self {
            bucket: warning.bucket,
            message: warning.message,
        }
    }
}

/// Aggregate counts for a completed scan.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupPlanSummaryDto {
    /// Buckets successfully walked.
    #[ts(type = "number")]
    pub scanned_buckets: u32,
    /// Objects inspected.
    #[ts(type = "number")]
    pub scanned_objects: u64,
    /// Candidates returned.
    #[ts(type = "number")]
    pub candidate_count: usize,
    /// Combined size of the returned candidates.
    #[ts(type = "number")]
    pub candidate_total_size: u64,
}

impl From<CleanupPlanSummary> for CleanupPlanSummaryDto {
    fn from(summary: CleanupPlanSummary) -> Self {
        Self {
            scanned_buckets: summary.scanned_buckets,
            scanned_objects: summary.scanned_objects,
            candidate_count: summary.candidate_count,
            candidate_total_size: summary.candidate_total_size,
        }
    }
}

/// A completed cleanup plan.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupPlanDto {
    /// Ranked candidates, best first.
    pub candidates: Vec<CleanupCandidateDto>,
    /// Aggregate counts.
    pub summary: CleanupPlanSummaryDto,
    /// Buckets that could not be scanned.
    pub warnings: Vec<CleanupWarningDto>,
    /// When the scan finished, as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scanned_at: Option<String>,
}

impl From<CleanupPlan> for CleanupPlanDto {
    fn from(plan: CleanupPlan) -> Self {
        Self {
            candidates: plan.candidates.into_iter().map(Into::into).collect(),
            summary: plan.summary.into(),
            warnings: plan.warnings.into_iter().map(Into::into).collect(),
            scanned_at: to_rfc3339(plan.scanned_at),
        }
    }
}

/// Per-bucket outcome of a cleanup deletion.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupBucketDeleteResultDto {
    /// Bucket the keys belonged to.
    pub bucket: String,
    /// Keys removed.
    pub deleted: Vec<String>,
    /// Keys that survived.
    pub failed: Vec<KeyFailureDto>,
}

impl From<CleanupBucketDeleteResult> for CleanupBucketDeleteResultDto {
    fn from(result: CleanupBucketDeleteResult) -> Self {
        Self {
            bucket: result.bucket,
            deleted: result.deleted,
            failed: result.failed.into_iter().map(Into::into).collect(),
        }
    }
}

/// Result of a whole-bucket usage scan.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct BucketUsageDto {
    /// The measured bucket.
    pub scope: UsageScopeDto,
    /// When the scan finished, as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scanned_at: Option<String>,
}

/// Filters submitted with a cleanup scan.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupScanRequest {
    /// Restrict to one bucket; omit to scan every accessible bucket.
    #[serde(default)]
    #[ts(optional)]
    pub bucket: Option<String>,
    /// Restrict to a key prefix.
    #[serde(default)]
    #[ts(optional)]
    pub prefix: Option<String>,
    /// Keep objects at least this large.
    #[serde(default)]
    #[ts(optional, type = "number")]
    pub min_size_bytes: Option<u64>,
    /// Keep objects last modified strictly before this RFC 3339 instant.
    #[serde(default)]
    #[ts(optional)]
    pub older_than_iso: Option<String>,
    /// Cap on returned candidates.
    #[ts(type = "number")]
    pub max_results: usize,
}

/// Largest number of candidates a scan will return.
///
/// The cap sizes a server-side allocation, so it is clamped here rather than
/// trusted from the browser.
pub const MAX_CLEANUP_RESULTS: usize = 1000;

impl CleanupScanRequest {
    /// Splits the request into the scope and options the use case takes.
    ///
    /// # Errors
    ///
    /// Returns a message when `older_than_iso` is not a valid RFC 3339 instant.
    pub fn split(self) -> Result<(CleanupScope, CleanupScanOptions), String> {
        let older_than = match self.older_than_iso {
            Some(raw) => Some(
                OffsetDateTime::parse(&raw, &Rfc3339)
                    .map(|value| {
                        let seconds = value.unix_timestamp();
                        if seconds < 0 {
                            UNIX_EPOCH
                        } else {
                            UNIX_EPOCH + Duration::from_secs(seconds.unsigned_abs())
                        }
                    })
                    .map_err(|_| "olderThanIso must be an RFC 3339 timestamp".to_owned())?,
            ),
            None => None,
        };

        Ok((
            CleanupScope {
                bucket: self.bucket.filter(|value| !value.is_empty()),
                prefix: self.prefix.filter(|value| !value.is_empty()),
            },
            CleanupScanOptions {
                min_size_bytes: self.min_size_bytes,
                older_than,
                max_results: self.max_results.min(MAX_CLEANUP_RESULTS),
            },
        ))
    }
}

/// One object a cleanup deletion should remove.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CleanupDeleteTargetDto {
    /// Bucket holding the object.
    pub bucket: String,
    /// Full object key.
    pub key: String,
}

impl From<CleanupDeleteTargetDto> for CleanupDeleteTarget {
    fn from(target: CleanupDeleteTargetDto) -> Self {
        Self {
            bucket: target.bucket,
            key: target.key,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> CleanupScanRequest {
        CleanupScanRequest {
            bucket: None,
            prefix: None,
            min_size_bytes: None,
            older_than_iso: None,
            max_results: 30,
        }
    }

    #[test]
    fn an_empty_bucket_means_every_bucket() {
        let (scope, _) = CleanupScanRequest {
            bucket: Some(String::new()),
            ..request()
        }
        .split()
        .unwrap();
        assert_eq!(scope.bucket, None);
    }

    #[test]
    fn an_rfc3339_threshold_is_parsed() {
        let (_, options) = CleanupScanRequest {
            older_than_iso: Some("2024-01-01T00:00:00Z".to_owned()),
            ..request()
        }
        .split()
        .unwrap();
        assert!(options.older_than.is_some());
    }

    #[test]
    fn a_malformed_threshold_is_rejected() {
        let error = CleanupScanRequest {
            older_than_iso: Some("last tuesday".to_owned()),
            ..request()
        }
        .split()
        .unwrap_err();
        assert!(error.contains("RFC 3339"));
    }

    #[test]
    fn an_excessive_cap_is_clamped() {
        let (_, options) = CleanupScanRequest {
            max_results: usize::MAX,
            ..request()
        }
        .split()
        .unwrap();
        assert_eq!(options.max_results, MAX_CLEANUP_RESULTS);
    }
}
