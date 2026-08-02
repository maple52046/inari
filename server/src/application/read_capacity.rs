//! Reading the capacity index, with the freshness judgement made server-side.
//!
//! Staleness is decided here rather than in the browser so a client with a
//! skewed clock cannot decide for itself that a figure is current.

use std::time::{Duration, SystemTime};

use crate::domain::capacity::CapacityScope;
use crate::domain::ports::{CapacityIndex, Clock};

/// One row of a view: a whole bucket, or a sub-prefix of the viewed location.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapacityEntry {
    /// The location this row describes.
    pub scope: CapacityScope,
    /// Name to show: the bucket, or the child prefix with its delimiter.
    pub name: String,
    /// Combined size beneath the row.
    pub total_size: u64,
    /// Objects beneath the row.
    pub object_count: u64,
    /// When the row's own subtree was last walked in full.
    pub scanned_at: Option<SystemTime>,
    /// Whether the row's figures should be refreshed.
    pub stale: bool,
}

/// What a read of the index reports.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapacityView {
    /// The location described, or [`None`] when the view spans every bucket.
    pub scope: Option<CapacityScope>,
    /// Combined size across the view.
    pub total_size: u64,
    /// Objects across the view.
    pub object_count: u64,
    /// When the view was last measured in full; the oldest part decides.
    pub scanned_at: Option<SystemTime>,
    /// Whether every part of the view has been walked at least once.
    pub measured: bool,
    /// Whether the view's figures should be refreshed.
    ///
    /// True while any part is unmeasured as well as when a measurement has aged
    /// past the threshold, because both are answered by the same scan.
    pub stale: bool,
    /// Whether [`CapacityView::entries`] lists every sub-prefix.
    pub subdivided: bool,
    /// The rows making up the view, largest first.
    pub entries: Vec<CapacityEntry>,
}

/// Whether a measurement taken at `scanned_at` should be refreshed.
///
/// An unmeasured location counts as needing a refresh: a caller decides whether
/// to scan from this one answer rather than having to combine two.
fn is_stale(scanned_at: Option<SystemTime>, now: SystemTime, ttl: Duration) -> bool {
    let Some(scanned_at) = scanned_at else {
        return true;
    };
    // A scan time in the future means the clock moved backwards; treating that
    // as fresh would pin the figure until the clock caught up again.
    now.duration_since(scanned_at).map_or(true, |age| age > ttl)
}

/// Reports the index's view of every bucket the caller can see.
///
/// Takes the visible buckets from the caller rather than from the index, which
/// is what keeps a shared index from reporting a bucket the caller's own
/// credentials cannot list.
#[must_use]
pub fn read_bucket_capacity(
    index: &dyn CapacityIndex,
    clock: &dyn Clock,
    ttl: Duration,
    visible_buckets: &[String],
) -> CapacityView {
    let now = clock.now();
    let mut entries = Vec::with_capacity(visible_buckets.len());
    let mut total_size = 0_u64;
    let mut object_count = 0_u64;
    let mut oldest: Option<SystemTime> = None;
    let mut measured = true;

    for bucket in visible_buckets {
        let scope = CapacityScope::bucket(bucket.clone());
        let snapshot = index.read(&scope);

        total_size = total_size.saturating_add(snapshot.total_size);
        object_count = object_count.saturating_add(snapshot.object_count);
        match snapshot.scanned_at {
            Some(scanned_at) => {
                oldest = Some(oldest.map_or(scanned_at, |current| current.min(scanned_at)));
            }
            None => measured = false,
        }

        entries.push(CapacityEntry {
            scope,
            name: bucket.clone(),
            total_size: snapshot.total_size,
            object_count: snapshot.object_count,
            scanned_at: snapshot.scanned_at,
            stale: is_stale(snapshot.scanned_at, now, ttl),
        });
    }

    sort_entries(&mut entries);
    CapacityView {
        scope: None,
        total_size,
        object_count,
        // A view is only as fresh as its oldest part, and an unmeasured bucket
        // leaves it with no honest timestamp at all.
        scanned_at: if measured { oldest } else { None },
        measured,
        stale: entries.iter().any(|entry| entry.stale),
        subdivided: true,
        entries,
    }
}

/// Reports the index's view of one location and its immediate sub-prefixes.
#[must_use]
pub fn read_location_capacity(
    index: &dyn CapacityIndex,
    clock: &dyn Clock,
    ttl: Duration,
    scope: &CapacityScope,
) -> CapacityView {
    let now = clock.now();
    let snapshot = index.read(scope);
    let bucket = scope.bucket_name();

    let mut entries: Vec<CapacityEntry> = snapshot
        .children
        .into_iter()
        .map(|child| CapacityEntry {
            scope: CapacityScope::prefix(
                bucket.to_owned(),
                &format!("{}{}", scope.prefix_path(), child.name),
            ),
            name: child.name,
            total_size: child.total_size,
            object_count: child.object_count,
            scanned_at: child.scanned_at,
            stale: is_stale(child.scanned_at, now, ttl),
        })
        .collect();

    sort_entries(&mut entries);
    CapacityView {
        scope: Some(scope.clone()),
        total_size: snapshot.total_size,
        object_count: snapshot.object_count,
        scanned_at: snapshot.scanned_at,
        measured: snapshot.scanned_at.is_some(),
        stale: is_stale(snapshot.scanned_at, now, ttl),
        subdivided: snapshot.subdivided,
        entries,
    }
}

fn sort_entries(entries: &mut [CapacityEntry]) {
    entries.sort_by(|left, right| {
        right
            .total_size
            .cmp(&left.total_size)
            .then_with(|| left.name.cmp(&right.name))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeCapacityIndex, FixedClock};
    use std::time::UNIX_EPOCH;

    const TTL: Duration = Duration::from_secs(300);

    fn start() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(1_700_000_000)
    }

    fn names(view: &CapacityView) -> Vec<&str> {
        view.entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect()
    }

    #[test]
    fn a_bucket_the_caller_cannot_see_is_absent_from_the_view() {
        let index = FakeCapacityIndex::default()
            .with_measured(CapacityScope::bucket("secret"), 100, 1, start())
            .with_measured(CapacityScope::bucket("shared"), 10, 1, start());
        let clock = FixedClock::new(start());

        let view = read_bucket_capacity(&index, &clock, TTL, &["shared".to_owned()]);

        assert_eq!(names(&view), ["shared"]);
        assert_eq!(
            view.total_size, 10,
            "an invisible bucket must not even reach the total"
        );
    }

    #[test]
    fn a_measurement_older_than_the_threshold_is_stale() {
        let index = FakeCapacityIndex::default().with_measured(
            CapacityScope::bucket("photos"),
            1,
            1,
            start(),
        );
        let clock = FixedClock::new(start() + TTL);

        let at_threshold = read_bucket_capacity(&index, &clock, TTL, &["photos".to_owned()]);
        assert!(
            !at_threshold.stale,
            "exactly at the threshold is not yet past it"
        );

        clock.advance(Duration::from_secs(1));
        let aged = read_bucket_capacity(&index, &clock, TTL, &["photos".to_owned()]);
        assert!(aged.stale);
    }

    #[test]
    fn an_unmeasured_bucket_is_reported_as_unmeasured_rather_than_empty() {
        let view = read_bucket_capacity(
            &FakeCapacityIndex::default(),
            &FixedClock::new(start()),
            TTL,
            &["photos".to_owned()],
        );

        assert!(!view.measured);
        assert!(view.stale, "an unmeasured view has to ask for a scan");
        assert_eq!(view.scanned_at, None);
    }

    #[test]
    fn one_unmeasured_bucket_leaves_the_whole_view_unmeasured() {
        let index = FakeCapacityIndex::default().with_measured(
            CapacityScope::bucket("photos"),
            1,
            1,
            start(),
        );

        let view = read_bucket_capacity(
            &index,
            &FixedClock::new(start()),
            TTL,
            &["photos".to_owned(), "backups".to_owned()],
        );

        assert!(!view.measured);
        assert_eq!(
            view.scanned_at, None,
            "a partly unmeasured view has no honest timestamp"
        );
    }

    #[test]
    fn a_views_scan_time_is_that_of_its_oldest_part() {
        let index = FakeCapacityIndex::default()
            .with_measured(CapacityScope::bucket("photos"), 1, 1, start())
            .with_measured(
                CapacityScope::bucket("backups"),
                1,
                1,
                start() + Duration::from_secs(60),
            );

        let view = read_bucket_capacity(
            &index,
            &FixedClock::new(start() + Duration::from_secs(60)),
            TTL,
            &["photos".to_owned(), "backups".to_owned()],
        );

        assert_eq!(view.scanned_at, Some(start()));
    }

    #[test]
    fn a_location_reports_its_children_largest_first() {
        let photos = CapacityScope::bucket("photos");
        let index = FakeCapacityIndex::default()
            .with_measured(photos.clone(), 101, 2, start())
            .with_child(&photos, "small/", 1, Some(start()))
            .with_child(&photos, "big/", 100, Some(start()));

        let view = read_location_capacity(&index, &FixedClock::new(start()), TTL, &photos);

        assert_eq!(names(&view), ["big/", "small/"]);
        assert_eq!(view.entries[0].scope.prefix_path(), "big/");
    }

    #[test]
    fn a_child_scope_is_built_from_the_parents_own_prefix() {
        let raw = CapacityScope::prefix("photos", "raw/");
        let index = FakeCapacityIndex::default()
            .with_measured(raw.clone(), 10, 1, start())
            .with_child(&raw, "2024/", 10, Some(start()));

        let view = read_location_capacity(&index, &FixedClock::new(start()), TTL, &raw);

        assert_eq!(view.entries[0].scope.prefix_path(), "raw/2024/");
        assert_eq!(view.entries[0].scope.bucket_name(), "photos");
    }

    #[test]
    fn a_child_rescanned_on_its_own_is_fresher_than_its_parent() {
        let photos = CapacityScope::bucket("photos");
        let stale_moment = start();
        let fresh_moment = start() + TTL + Duration::from_secs(1);
        let index = FakeCapacityIndex::default()
            .with_measured(photos.clone(), 101, 2, stale_moment)
            .with_child(&photos, "raw/", 100, Some(fresh_moment))
            .with_child(&photos, "thumbs/", 1, Some(stale_moment));

        let view = read_location_capacity(&index, &FixedClock::new(fresh_moment), TTL, &photos);

        let raw = view.entries.iter().find(|e| e.name == "raw/").unwrap();
        let thumbs = view.entries.iter().find(|e| e.name == "thumbs/").unwrap();
        assert!(!raw.stale);
        assert!(thumbs.stale);
        assert!(view.stale, "the parent itself was not re-walked");
    }

    #[test]
    fn a_child_that_only_inherited_a_total_is_reported_as_needing_a_scan() {
        let photos = CapacityScope::bucket("photos");
        let index = FakeCapacityIndex::default()
            .with_measured(photos.clone(), 100, 1, start())
            .with_child(&photos, "raw/", 100, None);

        let view = read_location_capacity(&index, &FixedClock::new(start()), TTL, &photos);

        assert_eq!(view.entries[0].scanned_at, None);
        assert!(view.entries[0].stale);
    }

    #[test]
    fn a_clock_that_moved_backwards_does_not_pin_a_figure_as_fresh() {
        let index = FakeCapacityIndex::default().with_measured(
            CapacityScope::bucket("photos"),
            1,
            1,
            start(),
        );
        let clock = FixedClock::new(start() - Duration::from_secs(3600));

        let view = read_bucket_capacity(&index, &clock, TTL, &["photos".to_owned()]);
        assert!(view.stale);
    }
}
