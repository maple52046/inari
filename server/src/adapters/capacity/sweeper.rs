//! The background pass that warms the index and keeps it warm.

use std::sync::Arc;
use std::time::Duration;

use tokio::time::Instant;

use crate::application::scan_queue::ScanPriority;
use crate::domain::capacity::CapacityScope;
use crate::domain::errors::StorageError;
use crate::domain::ports::CapacityIndex;
use crate::infrastructure::config::CapacityCoverage;

use super::memory::MemoryCapacityIndex;
use super::scanner::CapacityScanner;

/// How often the sweeper checks whether its pass has drained.
const DRAIN_CHECK: Duration = Duration::from_secs(1);

/// Walks every covered bucket, slowly and out of everybody's way.
///
/// Its job is narrower than it looks. Freshness is guaranteed by reads, which
/// refresh what they find stale; the sweeper exists to fill a cold index after
/// a restart and to keep visited locations warm, so that a user usually finds
/// figures already there. That narrower job is what lets it run at the
/// background priority and yield the rate budget to anyone waiting.
pub struct CapacitySweeper {
    scanner: Arc<CapacityScanner>,
    index: Arc<MemoryCapacityIndex>,
    coverage: CapacityCoverage,
    interval: Duration,
}

impl CapacitySweeper {
    /// Wires the sweeper to the scanner it queues work on.
    #[must_use]
    pub fn new(
        scanner: Arc<CapacityScanner>,
        index: Arc<MemoryCapacityIndex>,
        coverage: CapacityCoverage,
        interval: Duration,
    ) -> Self {
        Self {
            scanner,
            index,
            coverage,
            interval,
        }
    }

    /// Sweeps until the runtime shuts the task down.
    ///
    /// The interval is a gap after the previous pass finishes rather than a
    /// fixed period. With the backend's size unknown a pass may outlast any
    /// period one could pick, and a fixed schedule would then queue the next
    /// pass on top of the one still running.
    pub async fn run(self) {
        loop {
            match self.sweep_once().await {
                Ok(()) => {}
                Err(error) => tracing::warn!(
                    %error,
                    "capacity sweep could not list buckets; retrying after the usual interval"
                ),
            }
            tokio::time::sleep(self.interval).await;
        }
    }

    /// Queues one pass and waits for it, and everything else, to drain.
    async fn sweep_once(&self) -> Result<(), StorageError> {
        let started = Instant::now();
        let visible = self.scanner.visible_buckets().await?;

        self.forget_departed_buckets(&visible);

        let covered: Vec<&String> = visible
            .iter()
            .filter(|bucket| self.coverage.covers(bucket))
            .collect();
        for bucket in &covered {
            self.scanner.request(
                CapacityScope::bucket((*bucket).clone()),
                ScanPriority::Background,
            );
        }

        // Waiting on the whole queue rather than only this pass's scopes is
        // deliberate: interactive work shares the same rate budget, so the pass
        // is not really over until that has drained too.
        while !self.scanner.is_idle() {
            tokio::time::sleep(DRAIN_CHECK).await;
        }

        let stats = self.index.stats();
        tracing::info!(
            buckets = covered.len(),
            skipped = visible.len() - covered.len(),
            duration_secs = started.elapsed().as_secs(),
            node_count = stats.node_count,
            effective_depth = stats.effective_depth,
            depth_reduced = stats.depth_reduced,
            "capacity sweep finished"
        );
        if stats.depth_reduced {
            // The operator cannot know the right ceiling in advance, so the one
            // symptom worth surfacing on its own is the index having given up
            // resolution to stay within it.
            tracing::warn!(
                node_count = stats.node_count,
                effective_depth = stats.effective_depth,
                "the node ceiling has cost the capacity index some detail; \
                 raise INARI_CAPACITY_MAX_NODES to get it back"
            );
        }
        Ok(())
    }

    /// Drops buckets the backend has stopped reporting.
    ///
    /// Without this a deleted bucket would keep contributing its last measured
    /// size to the index for the process's lifetime, because nothing else ever
    /// removes a node.
    fn forget_departed_buckets(&self, visible: &[String]) {
        for known in self.index.bucket_names() {
            if !visible.contains(&known) {
                tracing::info!(bucket = %known, "forgetting a bucket the backend no longer reports");
                self.index.forget_bucket(&known);
            }
        }
    }
}
