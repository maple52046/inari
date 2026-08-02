//! Deciding what gets scanned next, and what does not need scanning at all.
//!
//! Pure state with no lock, timer, or runtime: the adapter that drives it owns
//! those. Everything that can cause a scan goes through here, so deduplication
//! and priority are decided once rather than per trigger.

use std::collections::{BTreeMap, BTreeSet};

use crate::domain::capacity::CapacityScope;

/// Most scopes that may wait at once.
///
/// The queue is long-lived process state, so it needs a ceiling like everything
/// else on it. Reaching this means scans are failing faster than they are
/// draining, and dropping the newest request is better than growing without
/// bound: the next read of that scope will ask again.
pub const MAX_PENDING: usize = 1_000;

/// Why a scan was asked for, which decides what waits for what.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ScanPriority {
    /// Housekeeping. Nobody is waiting on the result.
    Background,
    /// Somebody is looking at this figure right now.
    Interactive,
}

impl ScanPriority {
    /// The tier a refresh of `scope` belongs in.
    ///
    /// A whole bucket is never a targeted refresh, whoever asked for it and for
    /// whatever reason, so it waits behind anything narrower. Without this rule
    /// a cold index would put every bucket in the interactive tier the first
    /// time somebody opened the bucket list, and the one thing the tiers exist
    /// to protect -- a user browsing into a folder -- would queue behind all of
    /// them.
    ///
    /// Deciding it here rather than at each trigger is what keeps the callers
    /// from drifting apart on it.
    #[must_use]
    pub fn for_scope(scope: &CapacityScope) -> Self {
        if scope.is_bucket_root() {
            Self::Background
        } else {
            Self::Interactive
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct Pending {
    priority: ScanPriority,
    /// Arrival order, so a tier drains oldest first.
    sequence: u64,
}

/// The scopes waiting to be scanned, and the ones being scanned already.
#[derive(Debug, Default)]
pub struct ScanQueue {
    pending: BTreeMap<CapacityScope, Pending>,
    running: BTreeSet<CapacityScope>,
    next_sequence: u64,
}

impl ScanQueue {
    /// Asks for `scope` to be scanned, returning whether that changed anything.
    ///
    /// Three requests are absorbed rather than queued: one for a scope already
    /// waiting at the same or higher priority, one for a scope already being
    /// scanned, and one for a scope inside something already queued, since
    /// walking the ancestor measures the descendant too.
    ///
    /// A waiting background scan is promoted when somebody starts waiting on
    /// it, so a user's refresh does not sit behind a whole sweep.
    pub fn enqueue(&mut self, scope: CapacityScope, priority: ScanPriority) -> bool {
        if self.running.contains(&scope) || self.covered_by_pending_ancestor(&scope) {
            return false;
        }

        if let Some(existing) = self.pending.get_mut(&scope) {
            if existing.priority >= priority {
                return false;
            }
            existing.priority = priority;
            return true;
        }

        if self.pending.len() >= MAX_PENDING {
            tracing::warn!(
                scope = %scope.label(),
                pending = self.pending.len(),
                "capacity scan queue is full; dropping the request"
            );
            return false;
        }

        self.next_sequence += 1;
        self.pending.insert(
            scope,
            Pending {
                priority,
                sequence: self.next_sequence,
            },
        );
        true
    }

    /// Takes the next scope to scan and marks it as running.
    ///
    /// Interactive work goes first and the sweeper yields to it, because the
    /// alternative is a user's refresh queueing behind a full pass at exactly
    /// the moment responsiveness matters.
    pub fn take_next(&mut self) -> Option<CapacityScope> {
        let chosen = self
            .pending
            .iter()
            .min_by_key(|(_, pending)| (std::cmp::Reverse(pending.priority), pending.sequence))
            .map(|(scope, _)| scope.clone())?;

        self.pending.remove(&chosen);
        self.running.insert(chosen.clone());
        Some(chosen)
    }

    /// Records a scan as no longer running, whether it succeeded or not.
    pub fn finish(&mut self, scope: &CapacityScope) {
        self.running.remove(scope);
    }

    /// Whether a scan that would refresh `scope` is queued or running.
    ///
    /// An ancestor counts: walking a bucket measures every prefix in it, so a
    /// location inside a queued bucket is about to be refreshed too.
    #[must_use]
    pub fn is_scanning(&self, scope: &CapacityScope) -> bool {
        let mut candidate = Some(scope.clone());
        while let Some(current) = candidate {
            if self.pending.contains_key(&current) || self.running.contains(&current) {
                return true;
            }
            candidate = current.parent();
        }
        false
    }

    /// Returns how many scopes are waiting.
    #[must_use]
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }

    /// Whether nothing is waiting and nothing is being scanned.
    #[must_use]
    pub fn is_idle(&self) -> bool {
        self.pending.is_empty() && self.running.is_empty()
    }

    fn covered_by_pending_ancestor(&self, scope: &CapacityScope) -> bool {
        let mut candidate = scope.parent();
        while let Some(current) = candidate {
            if self.pending.contains_key(&current) || self.running.contains(&current) {
                return true;
            }
            candidate = current.parent();
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bucket(name: &str) -> CapacityScope {
        CapacityScope::bucket(name)
    }

    fn prefix(name: &str, prefix: &str) -> CapacityScope {
        CapacityScope::prefix(name, prefix)
    }

    #[test]
    fn the_same_scope_is_only_queued_once() {
        let mut queue = ScanQueue::default();

        assert!(queue.enqueue(bucket("photos"), ScanPriority::Interactive));
        assert!(!queue.enqueue(bucket("photos"), ScanPriority::Interactive));
        assert_eq!(queue.pending_count(), 1);
    }

    #[test]
    fn interactive_work_is_taken_before_background_work() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("first"), ScanPriority::Background);
        queue.enqueue(bucket("second"), ScanPriority::Background);
        queue.enqueue(bucket("urgent"), ScanPriority::Interactive);

        assert_eq!(queue.take_next(), Some(bucket("urgent")));
        assert_eq!(queue.take_next(), Some(bucket("first")));
        assert_eq!(queue.take_next(), Some(bucket("second")));
        assert_eq!(queue.take_next(), None);
    }

    #[test]
    fn a_waiting_background_scan_is_promoted_when_somebody_waits_on_it() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("slow"), ScanPriority::Background);
        queue.enqueue(bucket("other"), ScanPriority::Background);

        assert!(queue.enqueue(bucket("slow"), ScanPriority::Interactive));
        assert_eq!(
            queue.take_next(),
            Some(bucket("slow")),
            "a promoted scan must not stay behind the sweep it was queued with"
        );
    }

    #[test]
    fn priority_is_never_downgraded() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("a"), ScanPriority::Interactive);
        queue.enqueue(bucket("b"), ScanPriority::Background);

        assert!(!queue.enqueue(bucket("a"), ScanPriority::Background));
        assert_eq!(queue.take_next(), Some(bucket("a")));
    }

    #[test]
    fn a_location_inside_a_queued_bucket_is_not_queued_again() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("photos"), ScanPriority::Background);

        assert!(!queue.enqueue(prefix("photos", "raw/2024/"), ScanPriority::Interactive));
        assert_eq!(queue.pending_count(), 1);
    }

    #[test]
    fn a_location_inside_a_running_bucket_is_not_queued() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("photos"), ScanPriority::Background);
        queue.take_next();

        assert!(!queue.enqueue(prefix("photos", "raw/"), ScanPriority::Interactive));
    }

    #[test]
    fn a_running_scope_reports_as_scanning_until_it_finishes() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("photos"), ScanPriority::Interactive);
        let taken = queue.take_next().unwrap();

        assert!(queue.is_scanning(&bucket("photos")));
        assert!(
            queue.is_scanning(&prefix("photos", "raw/")),
            "walking the bucket refreshes everything inside it"
        );

        queue.finish(&taken);
        assert!(!queue.is_scanning(&bucket("photos")));
    }

    #[test]
    fn a_sibling_is_not_reported_as_scanning() {
        let mut queue = ScanQueue::default();
        queue.enqueue(prefix("photos", "raw/"), ScanPriority::Interactive);

        assert!(!queue.is_scanning(&prefix("photos", "thumbs/")));
        assert!(!queue.is_scanning(&bucket("photos")));
    }

    #[test]
    fn a_scope_still_being_scanned_leaves_the_queue_busy() {
        // The sweeper measures its interval from the end of a pass, so "empty"
        // must not read as "done" while a scan is still running.
        let mut queue = ScanQueue::default();
        assert!(queue.is_idle());

        queue.enqueue(bucket("photos"), ScanPriority::Background);
        assert!(!queue.is_idle());

        let taken = queue.take_next().unwrap();
        assert!(!queue.is_idle());

        queue.finish(&taken);
        assert!(queue.is_idle());
    }

    #[test]
    fn a_finished_scope_can_be_queued_again() {
        let mut queue = ScanQueue::default();
        queue.enqueue(bucket("photos"), ScanPriority::Interactive);
        let taken = queue.take_next().unwrap();
        queue.finish(&taken);

        assert!(queue.enqueue(bucket("photos"), ScanPriority::Interactive));
    }

    #[test]
    fn a_whole_bucket_is_never_treated_as_a_targeted_refresh() {
        assert_eq!(
            ScanPriority::for_scope(&bucket("photos")),
            ScanPriority::Background
        );
        assert_eq!(
            ScanPriority::for_scope(&prefix("photos", "raw/")),
            ScanPriority::Interactive
        );
    }

    #[test]
    fn browsing_into_a_folder_is_not_stuck_behind_a_cold_bucket_list() {
        let mut queue = ScanQueue::default();
        for name in ["one", "two", "three"] {
            let scope = bucket(name);
            queue.enqueue(scope.clone(), ScanPriority::for_scope(&scope));
        }

        let browsed = prefix("elsewhere", "deep/folder/");
        queue.enqueue(browsed.clone(), ScanPriority::for_scope(&browsed));

        assert_eq!(queue.take_next(), Some(browsed));
    }

    #[test]
    fn the_queue_refuses_to_grow_without_bound() {
        let mut queue = ScanQueue::default();
        for index in 0..MAX_PENDING {
            assert!(queue.enqueue(bucket(&format!("b{index}")), ScanPriority::Background));
        }

        assert!(!queue.enqueue(bucket("one-too-many"), ScanPriority::Interactive));
        assert_eq!(queue.pending_count(), MAX_PENDING);
    }
}
