//! The shared queue of locations waiting to be measured.

use std::sync::{Mutex, PoisonError};

use tokio::sync::Notify;

use crate::application::scan_queue::{ScanPriority, ScanQueue};
use crate::domain::capacity::CapacityScope;

/// Locations asked for, and the signal that wakes whoever measures them.
///
/// Held by both the index and the scanner rather than owned by the scanner, so
/// marking something dirty needs no handle on the scanner and the two do not
/// have to point at each other.
#[derive(Debug, Default)]
pub struct ScanRequests {
    queue: Mutex<ScanQueue>,
    wake: Notify,
}

impl ScanRequests {
    /// Asks for a location to be measured.
    ///
    /// The single door every trigger comes through -- a stale read, a mutation,
    /// the manual button, the sweeper -- so deduplication, priority, and the
    /// rate ceiling apply to all of them alike.
    pub fn request(&self, scope: CapacityScope, priority: ScanPriority) {
        if self.with_queue(|queue| queue.enqueue(scope, priority)) {
            self.wake.notify_one();
        }
    }

    /// Takes the next location to measure, marking it as running.
    pub fn take_next(&self) -> Option<CapacityScope> {
        self.with_queue(ScanQueue::take_next)
    }

    /// Records a measurement as no longer running, whether or not it succeeded.
    pub fn finish(&self, scope: &CapacityScope) {
        self.with_queue(|queue| queue.finish(scope));
    }

    /// Whether a measurement that would refresh `scope` is queued or running.
    #[must_use]
    pub fn is_scanning(&self, scope: &CapacityScope) -> bool {
        self.with_queue(|queue| queue.is_scanning(scope))
    }

    /// Returns how many locations are waiting.
    #[must_use]
    pub fn pending_count(&self) -> usize {
        self.with_queue(|queue| queue.pending_count())
    }

    /// Whether nothing is waiting and nothing is being measured.
    ///
    /// This is how the sweeper knows a pass is over, which it has to know
    /// because its interval is measured from the end of the previous pass
    /// rather than from its start.
    #[must_use]
    pub fn is_idle(&self) -> bool {
        self.with_queue(|queue| queue.is_idle())
    }

    /// Waits until something is asked for.
    ///
    /// `notify_one` leaves a permit behind when nobody is waiting, so a request
    /// arriving between an empty [`ScanRequests::take_next`] and this call is
    /// not lost.
    pub async fn wait_for_work(&self) {
        self.wake.notified().await;
    }

    /// Recovers the queue after a panic rather than propagating the poison.
    ///
    /// Losing a queued location costs one delayed refresh; refusing every later
    /// request would leave the index frozen for the process's lifetime.
    fn with_queue<T>(&self, action: impl FnOnce(&mut ScanQueue) -> T) -> T {
        let mut queue = self.queue.lock().unwrap_or_else(PoisonError::into_inner);
        action(&mut queue)
    }
}
