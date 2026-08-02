//! The rate ceiling that bounds what scanning costs the backend.

use std::num::NonZeroU32;
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use async_trait::async_trait;
use tokio::time::Instant;

use crate::domain::ports::ScanPacer;

/// Admits listing requests at a fixed rate, shared by every scan.
///
/// This is the one ceiling that holds regardless of how large the backend turns
/// out to be: a limit expressed in objects or in minutes would be wrong at some
/// scale, where requests per second bounds the load itself. Every scan draws on
/// the same budget, so several at once cannot multiply it.
#[derive(Debug)]
pub struct RateLimitedPacer {
    interval: Duration,
    /// Earliest instant the next request may go out.
    next: Mutex<Instant>,
}

impl RateLimitedPacer {
    /// Builds a pacer admitting `per_second` requests per second.
    #[must_use]
    pub fn new(per_second: NonZeroU32) -> Self {
        Self {
            interval: Duration::from_secs(1) / per_second.get(),
            next: Mutex::new(Instant::now()),
        }
    }
}

#[async_trait]
impl ScanPacer for RateLimitedPacer {
    async fn acquire(&self) {
        let wait = {
            let mut next = self.next.lock().unwrap_or_else(PoisonError::into_inner);
            let now = Instant::now();
            // A pacer that has been idle must not bank the idle time as a burst
            // of free requests, so the slot never starts earlier than now.
            let slot = (*next).max(now);
            *next = slot + self.interval;
            slot.saturating_duration_since(now)
        };

        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pacer(per_second: u32) -> RateLimitedPacer {
        RateLimitedPacer::new(NonZeroU32::new(per_second).unwrap())
    }

    #[tokio::test(start_paused = true)]
    async fn requests_are_spread_across_the_second() {
        let pacer = pacer(4);
        let started = Instant::now();

        for _ in 0..4 {
            pacer.acquire().await;
        }

        // Four slots at a quarter-second each: the first goes out at once, so
        // three intervals have elapsed by the time the fourth is admitted.
        assert!(started.elapsed() >= Duration::from_millis(750));
    }

    #[tokio::test(start_paused = true)]
    async fn idling_does_not_bank_a_burst() {
        let pacer = pacer(2);
        pacer.acquire().await;

        tokio::time::sleep(Duration::from_secs(10)).await;
        let resumed = Instant::now();
        pacer.acquire().await;
        pacer.acquire().await;

        assert!(
            resumed.elapsed() >= Duration::from_millis(500),
            "a long idle period must not let the next requests all go out at once"
        );
    }
}
