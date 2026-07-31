//! An in-memory [`ObjectStorage`] for exercising use cases without a backend.
//!
//! Test doubles live beside the use cases they serve rather than inside the SDK
//! adapter, which is what keeps the application layer testable without a
//! network, a runtime detail, or a real MinIO.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::errors::{StorageError, StorageErrorKind};
use crate::domain::models::{
    BucketSummary, CommonPrefix, DeleteResult, ObjectListPage, ObjectSummary, S3Connection,
};
use crate::domain::ports::{
    CopyObjectInput, ListObjectsInput, ObjectStorage, ObjectStorageFactory,
};

/// A scripted storage backend.
#[derive(Debug, Default, Clone)]
pub struct FakeStorage {
    buckets: Vec<String>,
    /// Pages keyed by continuation token, with [`None`] holding the first page.
    pages: BTreeMap<Option<String>, ObjectListPage>,
    existing_keys: Vec<String>,
    failure: Option<StorageError>,
    /// Records every mutating call so tests can assert on orchestration.
    pub calls: Arc<Mutex<Vec<String>>>,
}

impl FakeStorage {
    /// Declares the buckets this backend reports.
    #[must_use]
    pub fn with_buckets<'a>(mut self, names: impl IntoIterator<Item = &'a str>) -> Self {
        self.buckets = names.into_iter().map(str::to_owned).collect();
        self
    }

    /// Declares the page returned for a given continuation token.
    #[must_use]
    pub fn with_page(mut self, token: Option<&str>, page: ObjectListPage) -> Self {
        self.pages.insert(token.map(str::to_owned), page);
        self
    }

    /// Declares keys that [`ObjectStorage::object_exists`] reports as present.
    #[must_use]
    pub fn with_existing_keys<'a>(mut self, keys: impl IntoIterator<Item = &'a str>) -> Self {
        self.existing_keys = keys.into_iter().map(str::to_owned).collect();
        self
    }

    /// Makes every operation fail with `error`.
    #[must_use]
    pub fn failing(mut self, error: StorageError) -> Self {
        self.failure = Some(error);
        self
    }

    fn guard(&self) -> Result<(), StorageError> {
        self.failure.clone().map_or(Ok(()), Err)
    }

    fn record(&self, call: impl Into<String>) {
        if let Ok(mut calls) = self.calls.lock() {
            calls.push(call.into());
        }
    }
}

/// Builds an [`ObjectListPage`] without restating every field at each call site.
#[must_use]
pub fn page(
    bucket: &str,
    prefix: &str,
    objects: Vec<ObjectSummary>,
    prefixes: Vec<CommonPrefix>,
    next_token: Option<&str>,
) -> ObjectListPage {
    let key_count = i32::try_from(objects.len()).unwrap_or(i32::MAX);
    ObjectListPage {
        bucket: bucket.to_owned(),
        prefix: prefix.to_owned(),
        delimiter: "/".to_owned(),
        prefixes,
        objects,
        is_truncated: next_token.is_some(),
        continuation_token: next_token.map(str::to_owned),
        key_count,
    }
}

/// Builds an [`ObjectSummary`] with only the fields a test cares about.
#[must_use]
pub fn object(key: &str, size: u64) -> ObjectSummary {
    ObjectSummary {
        name: key.rsplit('/').next().unwrap_or(key).to_owned(),
        key: key.to_owned(),
        size,
        last_modified: None,
        storage_class: None,
        etag: None,
    }
}

#[async_trait]
impl ObjectStorage for FakeStorage {
    async fn test_connection(&self) -> Result<(), StorageError> {
        self.guard()
    }

    async fn list_buckets(&self) -> Result<Vec<BucketSummary>, StorageError> {
        self.guard()?;
        Ok(self
            .buckets
            .iter()
            .map(|name| BucketSummary {
                name: name.clone(),
                created_at: None,
            })
            .collect())
    }

    async fn list_objects(&self, input: &ListObjectsInput) -> Result<ObjectListPage, StorageError> {
        self.guard()?;
        self.pages
            .get(&input.continuation_token)
            .cloned()
            .ok_or_else(|| {
                StorageError::new(StorageErrorKind::PaginationFailed)
                    .with_detail("the test declared no page for this token")
            })
    }

    async fn delete_objects(
        &self,
        bucket: &str,
        keys: &[String],
    ) -> Result<DeleteResult, StorageError> {
        self.guard()?;
        self.record(format!("delete {bucket} {}", keys.join(",")));
        Ok(DeleteResult {
            deleted: keys.to_vec(),
            failed: Vec::new(),
        })
    }

    async fn object_exists(&self, _bucket: &str, key: &str) -> Result<bool, StorageError> {
        self.guard()?;
        Ok(self.existing_keys.iter().any(|existing| existing == key))
    }

    async fn copy_object(&self, input: &CopyObjectInput) -> Result<(), StorageError> {
        self.guard()?;
        self.record(format!(
            "copy {}/{} -> {}/{}",
            input.source_bucket, input.source_key, input.destination_bucket, input.destination_key
        ));
        Ok(())
    }

    async fn download_url(
        &self,
        bucket: &str,
        key: &str,
        expires_in: u64,
    ) -> Result<String, StorageError> {
        self.guard()?;
        Ok(format!(
            "https://signed.example.com/{bucket}/{key}?expires={expires_in}"
        ))
    }
}

/// Hands out a single prepared [`FakeStorage`] regardless of the connection.
#[derive(Debug, Clone)]
pub struct FakeStorageFactory {
    storage: Arc<FakeStorage>,
}

impl FakeStorageFactory {
    /// Wraps a prepared backend.
    #[must_use]
    pub fn new(storage: FakeStorage) -> Self {
        Self {
            storage: Arc::new(storage),
        }
    }
}

impl ObjectStorageFactory for FakeStorageFactory {
    fn create(&self, _connection: &S3Connection) -> Result<Arc<dyn ObjectStorage>, StorageError> {
        Ok(Arc::clone(&self.storage) as Arc<dyn ObjectStorage>)
    }
}
