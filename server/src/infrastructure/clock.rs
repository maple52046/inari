//! The system clock behind the [`Clock`] port.

use std::time::SystemTime;

use crate::domain::ports::Clock;

/// Reads the host's wall clock.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}
