//! Port traits the use-case layer depends on.
//!
//! Implementations live in the adapter layer and are injected at the
//! composition root. Nothing here may name a concrete SDK or runtime.

use std::time::SystemTime;

use async_trait::async_trait;

use super::capacity::{CapacityIndexStats, CapacityMeasurement, CapacityScope, CapacitySnapshot};
use super::errors::StorageError;
use super::models::{BucketSummary, DeleteResult, ObjectListPage, S3Connection};

/// Default lifetime of a presigned download URL.
pub const DEFAULT_DOWNLOAD_URL_TTL: u64 = 3600;

/// Source and destination of a single server-side object copy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CopyObjectInput {
    /// Bucket the object is read from.
    pub source_bucket: String,
    /// Key the object is read from.
    pub source_key: String,
    /// Bucket the object is written to.
    pub destination_bucket: String,
    /// Key the object is written to.
    pub destination_key: String,
}

/// Parameters for a single object-listing request.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ListObjectsInput {
    /// Bucket to list.
    pub bucket: String,
    /// Prefix to list under; empty lists from the root.
    pub prefix: String,
    /// Delimiter grouping keys into folders.
    ///
    /// An empty delimiter requests a flat recursive listing, which is what the
    /// usage and cleanup scans walk.
    pub delimiter: String,
    /// Opaque token from a previous page; absent for the first page.
    pub continuation_token: Option<String>,
    /// Upper bound on keys returned in this page.
    pub max_keys: Option<i32>,
}

/// Vendor-neutral operations against an S3-compatible backend.
///
/// Every method reports failure as a [`StorageError`], so no SDK-shaped error
/// ever escapes the adapter.
#[async_trait]
pub trait ObjectStorage: Send + Sync {
    /// Verifies that the backend is reachable and the credentials authenticate.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] describing why the connection is unusable.
    async fn test_connection(&self) -> Result<(), StorageError>;

    /// Lists every bucket the credentials can see.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when the listing fails.
    async fn list_buckets(&self) -> Result<Vec<BucketSummary>, StorageError>;

    /// Lists one page of objects.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when the page cannot be fetched, including a
    /// rejected continuation token.
    async fn list_objects(&self, input: &ListObjectsInput) -> Result<ObjectListPage, StorageError>;

    /// Deletes the given keys, chunking internally to respect API limits.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] only when the request itself fails; per-key
    /// refusals come back in [`DeleteResult::failed`].
    async fn delete_objects(
        &self,
        bucket: &str,
        keys: &[String],
    ) -> Result<DeleteResult, StorageError>;

    /// Reports whether an object exists at exactly this key.
    ///
    /// A listing cannot answer this: it drops the key equal to the requested
    /// prefix, which is the very row an existence probe asks about.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] for failures other than a plain absence.
    async fn object_exists(&self, bucket: &str, key: &str) -> Result<bool, StorageError>;

    /// Copies one object server-side, across buckets when asked.
    ///
    /// Implementations must handle sources beyond the backend's single-request
    /// copy limit, so a caller can copy any object it can list. Overwrites the
    /// destination; callers that must not clobber check first.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when the copy does not complete.
    async fn copy_object(&self, input: &CopyObjectInput) -> Result<(), StorageError>;

    /// Returns a presigned URL to download a single object.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when the URL cannot be signed.
    async fn download_url(
        &self,
        bucket: &str,
        key: &str,
        expires_in: u64,
    ) -> Result<String, StorageError>;
}

/// Paces the scanner so its load on the backend stays bounded.
///
/// Expressed as a port rather than a sleep inside the walk because the walk is
/// application policy and the timer is a runtime detail; it also lets a test
/// exercise a multi-page scan without waiting.
#[async_trait]
pub trait ScanPacer: Send + Sync {
    /// Waits until another listing request may be issued.
    async fn acquire(&self);
}

/// Reads the wall clock.
///
/// Defined inward so anything time-dependent, staleness above all, can be
/// exercised without waiting for real time to pass.
pub trait Clock: Send + Sync + std::fmt::Debug {
    /// Returns the current instant.
    fn now(&self) -> SystemTime;
}

/// The server-side capacity index shared by every session.
///
/// Deliberately synchronous. The index is in-process state, and a synchronous
/// contract is what keeps an async runtime out of the use cases that maintain
/// it; an implementation needing I/O owns a worker of its own rather than
/// making every caller await.
pub trait CapacityIndex: Send + Sync {
    /// Whether this deployment maintains an index at all.
    ///
    /// Callers branch on this instead of on configuration, so the decision
    /// stays at the composition root.
    fn is_enabled(&self) -> bool;

    /// Starts a measurement of `scope` under the index's current ceilings.
    ///
    /// The ceilings come from the index rather than from configuration because
    /// a tree that has already shed a level of detail must not have it rebuilt
    /// by the next scan.
    fn begin_measurement(&self, scope: CapacityScope) -> CapacityMeasurement;

    /// Installs a completed measurement, correcting the ancestors it affects.
    fn apply(&self, measurement: CapacityMeasurement);

    /// Records locations whose stored figures a change has invalidated.
    ///
    /// Record-only by contract: it appends and returns, performing no I/O,
    /// awaiting nothing, and spawning nothing. That is what lets the mutation
    /// use cases take this port without an async runtime reaching them, and it
    /// is what keeps a delete from waiting on the re-measurement it triggers.
    fn mark_dirty(&self, scopes: &[CapacityScope]);

    /// Reports what the index holds for one location.
    ///
    /// A location the index has never walked comes back as unmeasured rather
    /// than as zero, so a caller cannot present "not known yet" as "empty".
    fn read(&self, scope: &CapacityScope) -> CapacitySnapshot;

    /// Reports what the index currently costs, for tuning its ceilings.
    fn stats(&self) -> CapacityIndexStats;
}

/// Builds a storage port for a candidate connection.
///
/// Defined inward so use cases can validate and connect without naming the
/// concrete SDK adapter; the composition root supplies the implementation.
pub trait ObjectStorageFactory: Send + Sync {
    /// Creates a port bound to `connection`.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when a client cannot be constructed, for
    /// example because the endpoint is not a usable URL.
    fn create(
        &self,
        connection: &S3Connection,
    ) -> Result<std::sync::Arc<dyn ObjectStorage>, StorageError>;
}
