//! The in-process prefix tree behind the capacity index port.

use std::sync::{Arc, PoisonError, RwLock};

use crate::application::scan_queue::ScanPriority;
use crate::domain::capacity::{
    CapacityIndexStats, CapacityLimits, CapacityMeasurement, CapacityScope, CapacitySnapshot,
    CapacityTree,
};
use crate::domain::ports::{CapacityIndex, Clock};

use super::requests::ScanRequests;

/// Holds the capacity tree for the process's lifetime.
///
/// Reads outnumber writes by a wide margin -- every page view reads, only a
/// completed scan writes -- so the tree sits behind a read-write lock rather
/// than a mutex. No guard is ever held across an await: every critical section
/// is a tree operation with no I/O in it.
#[derive(Debug)]
pub struct MemoryCapacityIndex {
    tree: RwLock<CapacityTree>,
    clock: Arc<dyn Clock>,
    requests: Arc<ScanRequests>,
}

impl MemoryCapacityIndex {
    /// Builds an empty index under the given ceilings.
    #[must_use]
    pub fn new(limits: CapacityLimits, clock: Arc<dyn Clock>, requests: Arc<ScanRequests>) -> Self {
        Self {
            tree: RwLock::new(CapacityTree::new(limits)),
            clock,
            requests,
        }
    }

    /// Drops a bucket the backend no longer reports.
    pub fn forget_bucket(&self, bucket: &str) {
        self.write().forget_bucket(bucket);
    }

    /// Returns the buckets the index currently holds.
    #[must_use]
    pub fn bucket_names(&self) -> Vec<String> {
        self.read_guard().bucket_names()
    }

    /// Recovers the tree after a panic rather than propagating the poison.
    ///
    /// The index is a cache: continuing with figures that may be momentarily
    /// inconsistent is strictly better than turning every later read into a
    /// panic, and the next scan of the affected scope corrects them.
    fn write(&self) -> std::sync::RwLockWriteGuard<'_, CapacityTree> {
        self.tree.write().unwrap_or_else(PoisonError::into_inner)
    }

    fn read_guard(&self) -> std::sync::RwLockReadGuard<'_, CapacityTree> {
        self.tree.read().unwrap_or_else(PoisonError::into_inner)
    }
}

impl CapacityIndex for MemoryCapacityIndex {
    fn is_enabled(&self) -> bool {
        true
    }

    fn begin_measurement(&self, scope: CapacityScope) -> CapacityMeasurement {
        CapacityMeasurement::new(scope, self.read_guard().measurement_limits())
    }

    fn apply(&self, measurement: CapacityMeasurement) {
        let now = self.clock.now();
        self.write().apply(measurement, now);
    }

    fn mark_dirty(&self, scopes: &[CapacityScope]) {
        for scope in scopes {
            self.requests
                .request(scope.clone(), ScanPriority::for_scope(scope));
        }
    }

    fn read(&self, scope: &CapacityScope) -> CapacitySnapshot {
        self.read_guard().read(scope)
    }

    fn stats(&self) -> CapacityIndexStats {
        self.read_guard().stats()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FixedClock;
    use std::time::{Duration, UNIX_EPOCH};

    const LIMITS: CapacityLimits = CapacityLimits {
        max_depth: 6,
        max_nodes: 1000,
    };

    fn index() -> (MemoryCapacityIndex, Arc<FixedClock>, Arc<ScanRequests>) {
        let clock = Arc::new(FixedClock::new(UNIX_EPOCH + Duration::from_secs(1_000)));
        let requests = Arc::new(ScanRequests::default());
        let index = MemoryCapacityIndex::new(
            LIMITS,
            Arc::clone(&clock) as Arc<dyn Clock>,
            Arc::clone(&requests),
        );
        (index, clock, requests)
    }

    #[test]
    fn an_applied_measurement_is_readable_afterwards() {
        let (index, _, _) = index();
        let scope = CapacityScope::bucket("photos");

        let mut measurement = index.begin_measurement(scope.clone());
        measurement.record("raw/a.jpg", 100);
        index.apply(measurement);

        let snapshot = index.read(&scope);
        assert_eq!(snapshot.total_size, 100);
        assert!(snapshot.is_measured());
    }

    #[test]
    fn the_scan_time_comes_from_the_injected_clock() {
        let (index, clock, _) = index();
        let scope = CapacityScope::bucket("photos");
        clock.set(UNIX_EPOCH + Duration::from_secs(4_242));

        index.apply(index.begin_measurement(scope.clone()));

        assert_eq!(
            index.read(&scope).scanned_at,
            Some(UNIX_EPOCH + Duration::from_secs(4_242))
        );
    }

    #[test]
    fn a_forgotten_bucket_disappears_from_the_listing() {
        let (index, _, _) = index();
        index.apply(index.begin_measurement(CapacityScope::bucket("photos")));
        assert_eq!(index.bucket_names(), ["photos"]);

        index.forget_bucket("photos");
        assert!(index.bucket_names().is_empty());
    }

    #[test]
    fn marking_dirty_queues_the_location_without_scanning_it() {
        let (index, _, requests) = index();
        let scope = CapacityScope::prefix("photos", "raw/");

        index.mark_dirty(std::slice::from_ref(&scope));

        assert!(requests.is_scanning(&scope));
        assert!(
            !index.read(&scope).is_measured(),
            "marking dirty must record work, not perform it"
        );
    }

    #[test]
    fn a_dirtied_bucket_root_waits_behind_interactive_work() {
        let (index, _, requests) = index();
        index.mark_dirty(&[CapacityScope::bucket("photos")]);
        requests.request(
            CapacityScope::prefix("backups", "db/"),
            ScanPriority::Interactive,
        );

        // A whole-bucket walk must not delay a figure somebody is waiting on.
        assert_eq!(
            requests.take_next(),
            Some(CapacityScope::prefix("backups", "db/"))
        );
    }
}
