//! In-memory stand-ins for the ports, for exercising use cases without drivers.
//!
//! Test doubles live beside the use cases they serve rather than inside the SDK
//! adapter, which is what keeps the application layer testable without a
//! network, a runtime detail, or a real MinIO. Adapters may reach in here too,
//! so a fake clock or index is written once rather than per layer.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use async_trait::async_trait;

use crate::domain::capacity::{
    CapacityChild, CapacityIndexStats, CapacityLimits, CapacityMeasurement, CapacityScope,
    CapacitySnapshot,
};
use crate::domain::errors::{StorageError, StorageErrorKind};
use crate::domain::models::{
    BucketSummary, CommonPrefix, DeleteResult, ObjectListPage, ObjectSummary, S3Connection,
};
use crate::domain::ports::{
    CapacityIndex, Clock, CopyObjectInput, ListObjectsInput, ObjectStorage, ObjectStorageFactory,
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
    /// Prefixes handed to [`ObjectStorage::list_objects`], in order.
    listings: Arc<Mutex<Vec<String>>>,
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

    /// Returns the prefixes that were listed, so a test can prove a rescan was
    /// targeted rather than a disguised full walk.
    #[must_use]
    pub fn listed_prefixes(&self) -> Vec<String> {
        self.listings
            .lock()
            .expect("a test double is never poisoned")
            .clone()
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
        if input.continuation_token.is_none() {
            self.listings
                .lock()
                .expect("a test double is never poisoned")
                .push(input.prefix.clone());
        }
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

/// A pacer that admits every request at once, counting them as it goes.
#[derive(Debug, Default)]
pub struct NoPacing {
    admitted: Mutex<usize>,
}

impl NoPacing {
    /// Returns how many requests have been admitted.
    #[must_use]
    pub fn admitted(&self) -> usize {
        *self
            .admitted
            .lock()
            .expect("a test double is never poisoned")
    }
}

#[async_trait]
impl crate::domain::ports::ScanPacer for NoPacing {
    async fn acquire(&self) {
        *self
            .admitted
            .lock()
            .expect("a test double is never poisoned") += 1;
    }
}

/// A clock a test drives by hand.
#[derive(Debug)]
pub struct FixedClock {
    now: Mutex<SystemTime>,
}

impl FixedClock {
    /// Starts the clock at `now`.
    #[must_use]
    pub fn new(now: SystemTime) -> Self {
        Self {
            now: Mutex::new(now),
        }
    }

    /// Moves the clock to `now`, forwards or backwards.
    pub fn set(&self, now: SystemTime) {
        *self.now.lock().expect("a test clock is never poisoned") = now;
    }

    /// Moves the clock forward.
    pub fn advance(&self, by: Duration) {
        let mut guard = self.now.lock().expect("a test clock is never poisoned");
        *guard += by;
    }
}

impl Clock for FixedClock {
    fn now(&self) -> SystemTime {
        *self.now.lock().expect("a test clock is never poisoned")
    }
}

/// A capacity index whose contents a test states outright.
///
/// Scripted rather than backed by a real tree so a use-case test asserts on the
/// policy it is exercising and not on the tree's own arithmetic, which
/// [`crate::domain::capacity`] already covers.
#[derive(Debug, Default)]
pub struct FakeCapacityIndex {
    snapshots: Mutex<BTreeMap<CapacityScope, CapacitySnapshot>>,
    applied: Mutex<Vec<CapacityScope>>,
    dirtied: Mutex<Vec<CapacityScope>>,
}

impl FakeCapacityIndex {
    /// Returns the labels of the locations marked dirty, in order.
    #[must_use]
    pub fn dirtied(&self) -> Vec<String> {
        self.dirtied
            .lock()
            .expect("a test double is never poisoned")
            .iter()
            .map(CapacityScope::label)
            .collect()
    }

    /// Returns the labels of the locations whose measurements were installed.
    #[must_use]
    pub fn applied(&self) -> Vec<String> {
        self.applied
            .lock()
            .expect("a test double is never poisoned")
            .iter()
            .map(CapacityScope::label)
            .collect()
    }
    /// Declares a location as measured at `scanned_at` with the given totals.
    #[must_use]
    pub fn with_measured(
        self,
        scope: CapacityScope,
        total_size: u64,
        object_count: u64,
        scanned_at: SystemTime,
    ) -> Self {
        self.snapshots
            .lock()
            .expect("a test double is never poisoned")
            .insert(
                scope.clone(),
                CapacitySnapshot {
                    scope,
                    total_size,
                    object_count,
                    scanned_at: Some(scanned_at),
                    subdivided: true,
                    children: Vec::new(),
                },
            );
        self
    }

    /// Attaches a sub-prefix to a location already declared as measured.
    ///
    /// # Panics
    ///
    /// Panics when the parent was not declared first, which is a mistake in the
    /// test rather than a condition the code under test can produce.
    #[must_use]
    pub fn with_child(
        self,
        parent: &CapacityScope,
        name: &str,
        total_size: u64,
        scanned_at: Option<SystemTime>,
    ) -> Self {
        self.snapshots
            .lock()
            .expect("a test double is never poisoned")
            .get_mut(parent)
            .expect("declare the parent location before its children")
            .children
            .push(CapacityChild {
                name: name.to_owned(),
                total_size,
                object_count: 1,
                scanned_at,
            });
        self
    }
}

impl CapacityIndex for FakeCapacityIndex {
    fn is_enabled(&self) -> bool {
        true
    }

    fn begin_measurement(&self, scope: CapacityScope) -> CapacityMeasurement {
        CapacityMeasurement::new(
            scope,
            CapacityLimits {
                max_depth: 6,
                max_nodes: 1000,
            },
        )
    }

    fn apply(&self, measurement: CapacityMeasurement) {
        self.applied
            .lock()
            .expect("a test double is never poisoned")
            .push(measurement.scope().clone());
    }

    fn mark_dirty(&self, scopes: &[CapacityScope]) {
        self.dirtied
            .lock()
            .expect("a test double is never poisoned")
            .extend_from_slice(scopes);
    }

    fn read(&self, scope: &CapacityScope) -> CapacitySnapshot {
        self.snapshots
            .lock()
            .expect("a test double is never poisoned")
            .get(scope)
            .cloned()
            .unwrap_or_else(|| CapacitySnapshot::unmeasured(scope.clone()))
    }

    fn stats(&self) -> CapacityIndexStats {
        CapacityIndexStats {
            node_count: self
                .snapshots
                .lock()
                .expect("a test double is never poisoned")
                .len(),
            bucket_count: 0,
            effective_depth: 6,
            depth_reduced: false,
        }
    }
}
