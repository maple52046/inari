//! Runs capacity scans under the server's own credentials.

use std::num::NonZeroU32;
use std::sync::Arc;

use crate::application::scan_capacity::scan_capacity;
use crate::application::scan_queue::ScanPriority;
use crate::domain::capacity::CapacityScope;
use crate::domain::errors::StorageError;
use crate::domain::ports::{CapacityIndex, ObjectStorage};

use super::pacer::RateLimitedPacer;
use super::requests::ScanRequests;

/// Owns the scanner connection and drains the queue of scopes to measure.
///
/// The storage client here is the one long-lived credentialed client in the
/// process, and it is deliberately not the one any request uses. A user's
/// session may see only part of a bucket, so letting a user-triggered scan run
/// under their credentials would install an undercount into an index everyone
/// else reads. Triggering a scan is a user's; measuring it is the server's.
pub struct CapacityScanner {
    storage: Arc<dyn ObjectStorage>,
    index: Arc<dyn CapacityIndex>,
    pacer: RateLimitedPacer,
    requests: Arc<ScanRequests>,
}

impl CapacityScanner {
    /// Wires the scanner to its connection, its index, and its rate ceiling.
    #[must_use]
    pub fn new(
        storage: Arc<dyn ObjectStorage>,
        index: Arc<dyn CapacityIndex>,
        requests: Arc<ScanRequests>,
        scan_rate: NonZeroU32,
    ) -> Self {
        Self {
            storage,
            index,
            pacer: RateLimitedPacer::new(scan_rate),
            requests,
        }
    }

    /// Asks for a location to be measured, without waiting for it.
    pub fn request(&self, scope: CapacityScope, priority: ScanPriority) {
        self.requests.request(scope, priority);
    }

    /// Whether a measurement that would refresh `scope` is queued or running.
    #[must_use]
    pub fn is_scanning(&self, scope: &CapacityScope) -> bool {
        self.requests.is_scanning(scope)
    }

    /// Whether nothing is waiting and nothing is being measured.
    #[must_use]
    pub fn is_idle(&self) -> bool {
        self.requests.is_idle()
    }

    /// Drains the queue until the runtime shuts the task down.
    ///
    /// One location at a time on purpose: concurrency here would multiply the
    /// load the rate ceiling exists to bound, and that ceiling is the property
    /// worth keeping when the backend's size is unknown.
    pub async fn run(self: Arc<Self>) {
        loop {
            let Some(scope) = self.requests.take_next() else {
                self.requests.wait_for_work().await;
                continue;
            };

            if let Err(error) = self.scan(scope.clone()).await {
                tracing::warn!(
                    scope = %scope.label(),
                    %error,
                    "capacity scan failed; the stored figures are left as they were"
                );
            }
            self.requests.finish(&scope);
        }
    }

    /// Walks one location and installs the result.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when the walk fails, leaving the index as it
    /// was rather than installing a partial result.
    pub async fn scan(&self, scope: CapacityScope) -> Result<(), StorageError> {
        let measurement = self.index.begin_measurement(scope);
        let measured = scan_capacity(self.storage.as_ref(), &self.pacer, measurement).await?;

        tracing::debug!(
            scope = %measured.scope().label(),
            total_size = measured.total_size(),
            object_count = measured.object_count(),
            "capacity scan completed"
        );
        self.index.apply(measured);
        Ok(())
    }

    /// Lists the buckets the scanner itself can see.
    ///
    /// # Errors
    ///
    /// Returns a [`StorageError`] when the backend refuses or is unreachable.
    pub async fn visible_buckets(&self) -> Result<Vec<String>, StorageError> {
        Ok(self
            .storage
            .list_buckets()
            .await?
            .into_iter()
            .map(|bucket| bucket.name)
            .collect())
    }
}

impl std::fmt::Debug for CapacityScanner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CapacityScanner")
            .field("pending", &self.requests.pending_count())
            .finish_non_exhaustive()
    }
}
