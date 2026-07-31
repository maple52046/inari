//! Port traits the use-case layer depends on.
//!
//! Implementations live in the adapter layer and are injected at the
//! composition root. Nothing here may name a concrete SDK or runtime.

use async_trait::async_trait;

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
