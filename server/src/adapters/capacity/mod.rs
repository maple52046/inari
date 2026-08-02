//! Implementations of the capacity index port, and the scanner that fills it.
//!
//! The index is derived, rebuildable state rather than a source of truth, which
//! is why it lives in memory: losing it costs one rescan, where persisting it
//! would cost a writable volume the deployment does not otherwise need.

mod memory;
mod noop;
mod pacer;
mod requests;
mod scanner;
mod sweeper;

use std::sync::Arc;

use crate::domain::ports::CapacityIndex;

pub use memory::MemoryCapacityIndex;
pub use noop::NoopCapacityIndex;
pub use pacer::RateLimitedPacer;
pub use requests::ScanRequests;
pub use scanner::CapacityScanner;
pub use sweeper::CapacitySweeper;

/// The index and, when the feature is on, the scanner that keeps it current.
///
/// Bundled so the composition root decides once whether this deployment has an
/// index, and nothing downstream has to consult the configuration again.
#[derive(Clone)]
pub struct CapacityServices {
    index: Arc<dyn CapacityIndex>,
    scanner: Option<Arc<CapacityScanner>>,
}

impl CapacityServices {
    /// Builds the services a deployment without an index gets.
    #[must_use]
    pub fn disabled() -> Self {
        Self {
            index: Arc::new(NoopCapacityIndex),
            scanner: None,
        }
    }

    /// Builds the services backing an enabled index.
    #[must_use]
    pub fn enabled(index: Arc<dyn CapacityIndex>, scanner: Arc<CapacityScanner>) -> Self {
        Self {
            index,
            scanner: Some(scanner),
        }
    }

    /// Returns the index, which answers as unmeasured when disabled.
    #[must_use]
    pub fn index(&self) -> &dyn CapacityIndex {
        self.index.as_ref()
    }

    /// Returns the scanner, absent when no index is maintained.
    #[must_use]
    pub fn scanner(&self) -> Option<&Arc<CapacityScanner>> {
        self.scanner.as_ref()
    }
}
