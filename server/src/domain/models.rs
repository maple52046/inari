//! Domain models for S3-compatible object storage.
//!
//! Plain, framework-free structures. Data crossing the boundary from the SDK
//! adapter or towards the API is expressed only in these terms, never as
//! SDK-shaped values.

use std::time::SystemTime;

/// Credentials and endpoint configuration for one S3 target.
///
/// Holds a secret, so it must never be logged, serialised into a response, or
/// included in an error. [`Debug`] is implemented by hand to enforce that.
#[derive(Clone, PartialEq, Eq)]
pub struct S3Connection {
    /// Base URL of the S3-compatible endpoint.
    pub endpoint: String,
    /// Access key identifier.
    pub access_key_id: String,
    /// Secret access key.
    pub secret_access_key: String,
    /// Signing region.
    pub region: String,
    /// Path-style addressing, required by most self-hosted backends.
    pub force_path_style: bool,
    /// Disables TLS certificate verification.
    ///
    /// Insecure: intended only for self-hosted backends using self-signed or
    /// internal-CA certificates.
    pub skip_tls_verification: bool,
}

impl std::fmt::Debug for S3Connection {
    /// Redacts both key fields so a connection can never leak through a log
    /// line, a panic message, or an error chain.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("S3Connection")
            .field("endpoint", &self.endpoint)
            .field("access_key_id", &"<redacted>")
            .field("secret_access_key", &"<redacted>")
            .field("region", &self.region)
            .field("force_path_style", &self.force_path_style)
            .field("skip_tls_verification", &self.skip_tls_verification)
            .finish()
    }
}

/// A bucket as listed by the backend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BucketSummary {
    /// Bucket name.
    pub name: String,
    /// Creation time, when the backend reports one.
    pub created_at: Option<SystemTime>,
}

/// A single stored object within a bucket or prefix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectSummary {
    /// Full object key.
    pub key: String,
    /// Basename of the key relative to the listed prefix.
    pub name: String,
    /// Size in bytes.
    pub size: u64,
    /// Last modification time, when the backend reports one.
    pub last_modified: Option<SystemTime>,
    /// Storage class, when the backend reports one.
    pub storage_class: Option<String>,
    /// Entity tag, when the backend reports one.
    pub etag: Option<String>,
}

/// A folder-like grouping produced by the listing delimiter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommonPrefix {
    /// Full prefix, including the trailing delimiter.
    pub prefix: String,
    /// Basename of the prefix relative to the listed prefix.
    pub name: String,
}

/// One page of a delimited object listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectListPage {
    /// Bucket that was listed.
    pub bucket: String,
    /// Prefix that was listed.
    pub prefix: String,
    /// Delimiter used, empty for a flat recursive listing.
    pub delimiter: String,
    /// Folder-like groupings at this level.
    pub prefixes: Vec<CommonPrefix>,
    /// Objects at this level.
    pub objects: Vec<ObjectSummary>,
    /// Whether the backend has more to give.
    pub is_truncated: bool,
    /// Token for the next page; absent once the listing is exhausted.
    pub continuation_token: Option<String>,
    /// Number of keys the backend reported for this page.
    pub key_count: i32,
}

/// Aggregated usage for a single scope: all buckets, one bucket, or a prefix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsageScope {
    /// Human-readable identifier of what was measured.
    pub scope: String,
    /// Total size in bytes.
    pub total_size: u64,
    /// Number of objects counted.
    pub object_count: u64,
}

/// Builds the [`UsageScope::scope`] identifier for a bucket or a prefix in it.
///
/// Lives beside the field it produces so the scanner and the UI cannot drift on
/// the format. Prefixes carry their trailing delimiter, so the result reads as a
/// path; an empty prefix is treated as absent rather than leaving a separator.
#[must_use]
pub fn usage_scope_label(bucket: &str, prefix: Option<&str>) -> String {
    match prefix.filter(|value| !value.is_empty()) {
        Some(prefix) => format!("{bucket}/{prefix}"),
        None => bucket.to_owned(),
    }
}

/// A key that could not be acted on, with a normalised reason.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyFailure {
    /// The key that failed.
    pub key: String,
    /// Why it failed, safe to show a user.
    pub message: String,
}

/// Outcome of a batch delete.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeleteResult {
    /// Keys the backend confirmed as removed.
    pub deleted: Vec<String>,
    /// Keys that survived, with a reason each.
    pub failed: Vec<KeyFailure>,
}

/// An object that reached its destination and no longer exists at `key`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MovedObject {
    /// Original key.
    pub key: String,
    /// Key it now lives at.
    pub destination_key: String,
}

/// Outcome of a batch move.
///
/// A move is a copy followed by a delete and so is not atomic: every requested
/// key lands in exactly one list, and a failure may mean the copy never happened
/// *or* that it happened and the source could not be removed. The failure
/// message distinguishes the two.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MoveResult {
    /// Objects that were relocated.
    pub moved: Vec<MovedObject>,
    /// Objects that stayed put, with a reason each.
    pub failed: Vec<KeyFailure>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_label_omits_an_absent_prefix() {
        assert_eq!(usage_scope_label("photos", None), "photos");
        assert_eq!(usage_scope_label("photos", Some("")), "photos");
        assert_eq!(usage_scope_label("photos", Some("2024/")), "photos/2024/");
    }

    #[test]
    fn debug_output_redacts_both_keys() {
        let connection = S3Connection {
            endpoint: "https://minio.example.com".to_owned(),
            access_key_id: "AKIAREALKEY".to_owned(),
            secret_access_key: "s3cr3t".to_owned(),
            region: "us-east-1".to_owned(),
            force_path_style: true,
            skip_tls_verification: false,
        };
        let rendered = format!("{connection:?}");
        assert!(!rendered.contains("AKIAREALKEY"));
        assert!(!rendered.contains("s3cr3t"));
        assert!(rendered.contains("minio.example.com"));
    }
}
