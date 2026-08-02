//! The index a deployment gets when it has not enabled one.

use crate::domain::capacity::{
    CapacityIndexStats, CapacityLimits, CapacityMeasurement, CapacityScope, CapacitySnapshot,
};
use crate::domain::ports::CapacityIndex;

/// Answers every read as unmeasured and discards every write.
///
/// Exists so the mutation use cases can take the port unconditionally: the
/// requirement that every mutation maintains the index is then enforced by the
/// signature rather than by remembering to call something, and a deployment
/// with the feature off simply gets an implementation that does nothing.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoopCapacityIndex;

impl CapacityIndex for NoopCapacityIndex {
    fn is_enabled(&self) -> bool {
        false
    }

    fn begin_measurement(&self, scope: CapacityScope) -> CapacityMeasurement {
        CapacityMeasurement::new(
            scope,
            CapacityLimits {
                max_depth: 0,
                max_nodes: 0,
            },
        )
    }

    fn apply(&self, _measurement: CapacityMeasurement) {}

    fn mark_dirty(&self, _scopes: &[CapacityScope]) {}

    fn read(&self, scope: &CapacityScope) -> CapacitySnapshot {
        CapacitySnapshot::unmeasured(scope.clone())
    }

    fn stats(&self) -> CapacityIndexStats {
        CapacityIndexStats {
            node_count: 0,
            bucket_count: 0,
            effective_depth: 0,
            depth_reduced: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_disabled_index_never_claims_to_have_measured_anything() {
        let index = NoopCapacityIndex;
        let scope = CapacityScope::bucket("photos");

        let mut measurement = index.begin_measurement(scope.clone());
        measurement.record("a.jpg", 100);
        index.apply(measurement);

        assert!(!index.is_enabled());
        assert!(!index.read(&scope).is_measured());
    }
}
