//! The data model of the shared capacity index.
//!
//! The index is a prefix tree: every node holds the aggregate size and object
//! count of everything beneath it, so a rollup for any location is one lookup
//! rather than a query-time aggregation, and a change under a node reaches the
//! whole ancestor chain in a walk proportional to the depth.
//!
//! Nodes represent *prefixes only*. Individual objects are never nodes, which
//! is what keeps the tree's size proportional to the number of distinct folders
//! rather than to the number of stored objects.

use std::collections::BTreeMap;
use std::time::SystemTime;

use super::models::usage_scope_label;

/// Delimiter S3 keys use to emulate folders.
const DELIMITER: char = '/';

/// Normalises an operator- or client-supplied prefix into the index's form.
///
/// A folder path denotes the same location whether or not the caller typed the
/// trailing delimiter, so both spellings must resolve to one node.
fn normalise_prefix(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with(DELIMITER) {
        trimmed.to_owned()
    } else {
        format!("{trimmed}{DELIMITER}")
    }
}

/// A location the index can measure: a bucket, optionally narrowed to a prefix.
///
/// The prefix is empty for a whole bucket and otherwise always carries a
/// trailing delimiter, which is the invariant that lets a scope be turned into
/// a path of segments without re-parsing.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CapacityScope {
    bucket: String,
    prefix: String,
}

impl CapacityScope {
    /// Names a whole bucket.
    #[must_use]
    pub fn bucket(name: impl Into<String>) -> Self {
        Self {
            bucket: name.into(),
            prefix: String::new(),
        }
    }

    /// Names a location within a bucket, normalising the prefix.
    #[must_use]
    pub fn prefix(bucket: impl Into<String>, prefix: &str) -> Self {
        Self {
            bucket: bucket.into(),
            prefix: normalise_prefix(prefix),
        }
    }

    /// Returns the bucket this scope lives in.
    #[must_use]
    pub fn bucket_name(&self) -> &str {
        &self.bucket
    }

    /// Returns the prefix, empty for a whole bucket.
    #[must_use]
    pub fn prefix_path(&self) -> &str {
        &self.prefix
    }

    /// Whether this scope is the bucket itself rather than a location inside it.
    #[must_use]
    pub fn is_bucket_root(&self) -> bool {
        self.prefix.is_empty()
    }

    /// Returns the prefix's segments, without their delimiters.
    #[must_use]
    pub fn segments(&self) -> Vec<&str> {
        if self.prefix.is_empty() {
            return Vec::new();
        }
        self.prefix
            .trim_end_matches(DELIMITER)
            .split(DELIMITER)
            .collect()
    }

    /// Returns how deep this scope sits below its bucket.
    #[must_use]
    pub fn depth(&self) -> usize {
        self.segments().len()
    }

    /// Returns the location one level up, or [`None`] at the bucket root.
    #[must_use]
    pub fn parent(&self) -> Option<Self> {
        if self.is_bucket_root() {
            return None;
        }
        let mut segments = self.segments();
        segments.pop();
        if segments.is_empty() {
            return Some(Self::bucket(self.bucket.clone()));
        }
        Some(Self {
            bucket: self.bucket.clone(),
            prefix: format!("{}{DELIMITER}", segments.join("/")),
        })
    }

    /// Returns the human-readable label the UI shows for this location.
    #[must_use]
    pub fn label(&self) -> String {
        usage_scope_label(&self.bucket, Some(&self.prefix))
    }
}

/// Caps keeping the tree's size independent of how the stored keys are shaped.
///
/// Keys sharded like `ab/cd/ef/<uuid>` drive the number of distinct prefixes
/// towards the number of objects, so without a ceiling the tree's memory would
/// follow the object count rather than the folder count the design assumes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapacityLimits {
    /// Prefix depth past which a location is measured but not broken down.
    pub max_depth: usize,
    /// Total nodes the tree may hold before it sheds its deepest level.
    pub max_nodes: usize,
}

/// One location's aggregate within the tree.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct Node {
    total_size: u64,
    object_count: u64,
    /// When this subtree was last walked in full; absent while unmeasured.
    scanned_at: Option<SystemTime>,
    /// Whether [`Node::children`] lists every sub-prefix this location has.
    subdivided: bool,
    /// Sub-prefixes, keyed by segment without its delimiter.
    children: BTreeMap<String, Node>,
}

impl Node {
    fn count_nodes(&self) -> usize {
        1 + self.children.values().map(Node::count_nodes).sum::<usize>()
    }

    /// Stamps this node and everything under it as measured at `now`.
    fn stamp(&mut self, now: SystemTime) {
        self.scanned_at = Some(now);
        for child in self.children.values_mut() {
            child.stamp(now);
        }
    }

    /// Drops every descendant deeper than `remaining` levels below this node.
    ///
    /// Totals are untouched, because each node already holds its own subtree's
    /// aggregate: collapsing costs the breakdown, never the sum.
    fn collapse_below(&mut self, remaining: usize) {
        if remaining == 0 {
            if !self.children.is_empty() {
                self.children.clear();
                self.subdivided = false;
            }
            return;
        }
        for child in self.children.values_mut() {
            child.collapse_below(remaining - 1);
        }
    }
}

/// An aggregated walk of one subtree, ready to be applied to a [`CapacityTree`].
///
/// Built incrementally so a scan holds only the prefix aggregates rather than
/// the keys it walked.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapacityMeasurement {
    scope: CapacityScope,
    root: Node,
    /// Absolute prefix depth past which no child node is recorded.
    depth_budget: usize,
    /// Nodes this measurement may create before it stops subdividing.
    node_budget: usize,
    node_count: usize,
}

impl CapacityMeasurement {
    /// Starts an empty measurement of `scope` under the given ceilings.
    #[must_use]
    pub fn new(scope: CapacityScope, limits: CapacityLimits) -> Self {
        Self {
            scope,
            root: Node {
                subdivided: true,
                ..Node::default()
            },
            depth_budget: limits.max_depth,
            node_budget: limits.max_nodes,
            node_count: 1,
        }
    }

    /// Returns the location being measured.
    #[must_use]
    pub fn scope(&self) -> &CapacityScope {
        &self.scope
    }

    /// Returns the size accumulated so far.
    #[must_use]
    pub fn total_size(&self) -> u64 {
        self.root.total_size
    }

    /// Returns the object count accumulated so far.
    #[must_use]
    pub fn object_count(&self) -> u64 {
        self.root.object_count
    }

    /// Folds one object into the measurement.
    ///
    /// Keys outside the measured scope are ignored rather than misattributed,
    /// which keeps a backend that over-returns from corrupting the totals.
    pub fn record(&mut self, key: &str, size: u64) {
        let Some(relative) = key.strip_prefix(self.scope.prefix_path()) else {
            return;
        };

        self.root.total_size = self.root.total_size.saturating_add(size);
        self.root.object_count = self.root.object_count.saturating_add(1);

        // The last component names the object itself, or is empty for a folder
        // marker; either way it is not a prefix and gets no node of its own.
        let mut components: Vec<&str> = relative.split(DELIMITER).collect();
        components.pop();

        let mut absolute_depth = self.scope.depth();
        let mut node = &mut self.root;
        for component in components {
            absolute_depth += 1;
            if absolute_depth > self.depth_budget {
                node.subdivided = false;
                return;
            }
            if !node.children.contains_key(component) {
                if self.node_count >= self.node_budget {
                    node.subdivided = false;
                    return;
                }
                self.node_count += 1;
                node.children.insert(
                    component.to_owned(),
                    Node {
                        subdivided: true,
                        ..Node::default()
                    },
                );
            }
            node = node
                .children
                .get_mut(component)
                .expect("the child was just ensured to exist");
            node.total_size = node.total_size.saturating_add(size);
            node.object_count = node.object_count.saturating_add(1);
        }
    }
}

/// What a read of one location reports.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapacitySnapshot {
    /// The location described.
    pub scope: CapacityScope,
    /// Combined size beneath the location.
    pub total_size: u64,
    /// Objects beneath the location.
    pub object_count: u64,
    /// When this subtree was last walked in full.
    ///
    /// Absent means never measured. A location can carry a non-zero total while
    /// unmeasured, because a scan of something below it propagates upwards; the
    /// figure is then a lower bound and must not be presented as a measurement.
    pub scanned_at: Option<SystemTime>,
    /// Whether [`CapacitySnapshot::children`] lists every sub-prefix.
    pub subdivided: bool,
    /// Sub-prefixes, largest first.
    pub children: Vec<CapacityChild>,
}

impl CapacitySnapshot {
    /// Whether this location has ever been walked in full.
    #[must_use]
    pub const fn is_measured(&self) -> bool {
        self.scanned_at.is_some()
    }

    /// Builds the snapshot of a location the tree has never heard of.
    #[must_use]
    pub fn unmeasured(scope: CapacityScope) -> Self {
        Self {
            scope,
            total_size: 0,
            object_count: 0,
            scanned_at: None,
            subdivided: false,
            children: Vec::new(),
        }
    }
}

/// One sub-prefix of a snapshot's location.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapacityChild {
    /// Name relative to the parent, carrying its trailing delimiter.
    pub name: String,
    /// Combined size beneath the child.
    pub total_size: u64,
    /// Objects beneath the child.
    pub object_count: u64,
    /// When this child's own subtree was last walked in full.
    ///
    /// Carried per child rather than inherited from the parent because a child
    /// rescanned on its own is fresher than the parent that still holds the
    /// older walk's timestamp.
    pub scanned_at: Option<SystemTime>,
}

/// What the index currently costs, for an operator tuning its ceilings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapacityIndexStats {
    /// Nodes currently held.
    pub node_count: usize,
    /// Buckets currently represented.
    pub bucket_count: usize,
    /// Depth new measurements are allowed to reach.
    pub effective_depth: usize,
    /// Whether the node budget has forced the depth below its configured value.
    pub depth_reduced: bool,
}

/// The prefix tree itself: pure state, with no clock, lock, or I/O of its own.
#[derive(Debug, Clone)]
pub struct CapacityTree {
    /// Unnamed root whose children are buckets.
    root: Node,
    limits: CapacityLimits,
    effective_depth: usize,
    node_count: usize,
}

impl CapacityTree {
    /// Builds an empty tree under the given ceilings.
    #[must_use]
    pub fn new(limits: CapacityLimits) -> Self {
        Self {
            root: Node::default(),
            limits,
            effective_depth: limits.max_depth,
            node_count: 0,
        }
    }

    /// Returns the ceilings a new measurement must respect.
    ///
    /// The depth is the tree's current effective one rather than the configured
    /// maximum, so a tree that has already shed a level does not immediately
    /// regrow it on the next scan.
    #[must_use]
    pub const fn measurement_limits(&self) -> CapacityLimits {
        CapacityLimits {
            max_depth: self.effective_depth,
            max_nodes: self.limits.max_nodes,
        }
    }

    /// Returns what the tree currently costs.
    #[must_use]
    pub fn stats(&self) -> CapacityIndexStats {
        CapacityIndexStats {
            node_count: self.node_count,
            bucket_count: self.root.children.len(),
            effective_depth: self.effective_depth,
            depth_reduced: self.effective_depth < self.limits.max_depth,
        }
    }

    /// Returns the buckets the tree knows about.
    #[must_use]
    pub fn bucket_names(&self) -> Vec<String> {
        self.root.children.keys().cloned().collect()
    }

    /// Reports the aggregate at one location.
    #[must_use]
    pub fn read(&self, scope: &CapacityScope) -> CapacitySnapshot {
        let Some(node) = self.find(scope) else {
            return CapacitySnapshot::unmeasured(scope.clone());
        };

        let mut children: Vec<CapacityChild> = node
            .children
            .iter()
            .map(|(name, child)| CapacityChild {
                name: format!("{name}{DELIMITER}"),
                total_size: child.total_size,
                object_count: child.object_count,
                scanned_at: child.scanned_at,
            })
            .collect();
        children.sort_by(|left, right| {
            right
                .total_size
                .cmp(&left.total_size)
                .then_with(|| left.name.cmp(&right.name))
        });

        CapacitySnapshot {
            scope: scope.clone(),
            total_size: node.total_size,
            object_count: node.object_count,
            scanned_at: node.scanned_at,
            subdivided: node.subdivided,
            children,
        }
    }

    /// Replaces one subtree with a completed measurement.
    ///
    /// Ancestor totals are corrected by the difference, but their scan times are
    /// deliberately left alone: only this subtree was walked, and advancing the
    /// ancestors would make the whole tree look freshly measured and suppress
    /// the refreshes staleness exists to trigger.
    pub fn apply(&mut self, measurement: CapacityMeasurement, now: SystemTime) {
        let CapacityMeasurement {
            scope, mut root, ..
        } = measurement;
        root.stamp(now);

        let new_size = root.total_size;
        let new_count = root.object_count;
        let path = Self::path_of(&scope);

        let (old_size, old_count) = Self::install(&mut self.root, &path, root);
        Self::adjust_ancestors(
            &mut self.root,
            &path,
            i128::from(new_size) - i128::from(old_size),
            i128::from(new_count) - i128::from(old_count),
        );

        self.node_count = self.root.count_nodes() - 1;
        self.enforce_node_budget();
    }

    /// Puts `replacement` at `path`, creating missing ancestors on the way.
    ///
    /// Returns the totals that were there before, which is what the ancestor
    /// correction is computed from.
    fn install(root: &mut Node, path: &[String], replacement: Node) -> (u64, u64) {
        let mut node = root;
        for segment in path {
            node = node.children.entry(segment.clone()).or_default();
        }
        let previous = (node.total_size, node.object_count);
        *node = replacement;
        previous
    }

    /// Applies a signed correction to every strict ancestor of `path`.
    ///
    /// # Panics
    ///
    /// Panics if an ancestor is missing, which cannot happen because
    /// [`CapacityTree::install`] creates the whole path first.
    fn adjust_ancestors(root: &mut Node, path: &[String], size_delta: i128, count_delta: i128) {
        let mut node = root;
        for segment in &path[..path.len() - 1] {
            adjust(node, size_delta, count_delta);
            node = node
                .children
                .get_mut(segment)
                .expect("every ancestor exists once the path has been installed");
        }
        adjust(node, size_delta, count_delta);
    }

    /// Sheds the deepest level until the tree fits its node budget.
    ///
    /// The effective depth is lowered with it rather than only the nodes being
    /// removed, so the next scan does not immediately rebuild what was just
    /// dropped and leave the tree oscillating around the ceiling.
    fn enforce_node_budget(&mut self) {
        while self.node_count > self.limits.max_nodes && self.effective_depth > 0 {
            self.effective_depth -= 1;
            // Bucket nodes sit one level below the unnamed root, so a prefix
            // depth of N is N + 1 levels down from it.
            self.root.collapse_below(self.effective_depth + 1);
            self.node_count = self.root.count_nodes() - 1;
        }
    }

    /// Removes a bucket the backend no longer reports.
    pub fn forget_bucket(&mut self, bucket: &str) {
        if self.root.children.remove(bucket).is_some() {
            self.node_count = self.root.count_nodes() - 1;
        }
    }

    fn path_of(scope: &CapacityScope) -> Vec<String> {
        let mut path = vec![scope.bucket_name().to_owned()];
        path.extend(scope.segments().into_iter().map(str::to_owned));
        path
    }

    fn find(&self, scope: &CapacityScope) -> Option<&Node> {
        let mut node = &self.root;
        for segment in Self::path_of(scope) {
            node = node.children.get(&segment)?;
        }
        Some(node)
    }
}

/// Corrects one node's totals by a signed difference.
fn adjust(node: &mut Node, size_delta: i128, count_delta: i128) {
    node.total_size = apply_delta(node.total_size, size_delta);
    node.object_count = apply_delta(node.object_count, count_delta);
}

/// Applies a signed correction to an unsigned total without wrapping.
///
/// A negative result means the tree and the backend had drifted apart; clamping
/// at zero keeps a stale ancestor from underflowing into an absurd figure while
/// the next scan of that ancestor restores the truth.
fn apply_delta(value: u64, delta: i128) -> u64 {
    let corrected = i128::from(value) + delta;
    u64::try_from(corrected.max(0)).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, UNIX_EPOCH};

    const LIMITS: CapacityLimits = CapacityLimits {
        max_depth: 6,
        max_nodes: 1000,
    };

    fn now() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(1_700_000_000)
    }

    fn later() -> SystemTime {
        now() + Duration::from_secs(600)
    }

    fn measure(scope: CapacityScope, keys: &[(&str, u64)]) -> CapacityMeasurement {
        measure_within(scope, keys, LIMITS)
    }

    fn measure_within(
        scope: CapacityScope,
        keys: &[(&str, u64)],
        limits: CapacityLimits,
    ) -> CapacityMeasurement {
        let mut measurement = CapacityMeasurement::new(scope, limits);
        for (key, size) in keys {
            measurement.record(key, *size);
        }
        measurement
    }

    #[test]
    fn a_prefix_is_stored_under_one_spelling() {
        assert_eq!(
            CapacityScope::prefix("photos", "2024"),
            CapacityScope::prefix("photos", "2024/")
        );
        assert!(CapacityScope::prefix("photos", "  ").is_bucket_root());
    }

    #[test]
    fn a_scope_walks_up_to_its_bucket() {
        let deep = CapacityScope::prefix("photos", "raw/2024/03/");
        assert_eq!(deep.depth(), 3);

        let parent = deep.parent().unwrap();
        assert_eq!(parent.prefix_path(), "raw/2024/");

        let grandparent = parent.parent().unwrap();
        assert_eq!(grandparent.prefix_path(), "raw/");

        let bucket = grandparent.parent().unwrap();
        assert!(bucket.is_bucket_root());
        assert_eq!(bucket.parent(), None);
    }

    #[test]
    fn every_level_holds_the_total_of_everything_below_it() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(
                CapacityScope::bucket("photos"),
                &[
                    ("raw/2024/a.jpg", 100),
                    ("raw/2024/b.jpg", 200),
                    ("raw/2025/c.jpg", 300),
                    ("thumbs/d.jpg", 50),
                    ("loose.txt", 7),
                ],
            ),
            now(),
        );

        let bucket = tree.read(&CapacityScope::bucket("photos"));
        assert_eq!(bucket.total_size, 657);
        assert_eq!(bucket.object_count, 5);

        let raw = tree.read(&CapacityScope::prefix("photos", "raw/"));
        assert_eq!(raw.total_size, 600);
        assert_eq!(raw.object_count, 3);

        let year = tree.read(&CapacityScope::prefix("photos", "raw/2024/"));
        assert_eq!(year.total_size, 300);
        assert_eq!(year.object_count, 2);
    }

    #[test]
    fn an_object_gets_no_node_of_its_own() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(
                CapacityScope::bucket("photos"),
                &[("raw/a.jpg", 1), ("raw/b.jpg", 1), ("raw/c.jpg", 1)],
            ),
            now(),
        );

        // The bucket and `raw/`, and nothing per object.
        assert_eq!(tree.stats().node_count, 2);
    }

    #[test]
    fn children_are_reported_largest_first_with_their_delimiter() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(
                CapacityScope::bucket("photos"),
                &[("small/a", 1), ("big/b", 100)],
            ),
            now(),
        );

        let names: Vec<_> = tree
            .read(&CapacityScope::bucket("photos"))
            .children
            .into_iter()
            .map(|child| child.name)
            .collect();
        assert_eq!(names, ["big/", "small/"]);
    }

    #[test]
    fn a_folder_marker_counts_towards_the_folder_it_names() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(CapacityScope::bucket("photos"), &[("raw/", 0)]),
            now(),
        );

        let raw = tree.read(&CapacityScope::prefix("photos", "raw/"));
        assert_eq!(raw.object_count, 1);
    }

    #[test]
    fn a_key_outside_the_measured_scope_is_ignored() {
        let measurement = measure(
            CapacityScope::prefix("photos", "raw/"),
            &[("raw/a.jpg", 10), ("thumbs/b.jpg", 999)],
        );
        assert_eq!(measurement.total_size(), 10);
    }

    #[test]
    fn rescanning_a_branch_corrects_its_ancestors() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(
                CapacityScope::bucket("photos"),
                &[("raw/a.jpg", 100), ("thumbs/b.jpg", 50)],
            ),
            now(),
        );

        tree.apply(
            measure(
                CapacityScope::prefix("photos", "raw/"),
                &[("raw/a.jpg", 10)],
            ),
            later(),
        );

        assert_eq!(
            tree.read(&CapacityScope::bucket("photos")).total_size,
            60,
            "the bucket must absorb the branch's shrinkage"
        );
        assert_eq!(
            tree.read(&CapacityScope::prefix("photos", "thumbs/"))
                .total_size,
            50,
            "a sibling must be left alone"
        );
    }

    #[test]
    fn rescanning_a_branch_does_not_refresh_its_ancestors_scan_time() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(CapacityScope::bucket("photos"), &[("raw/a.jpg", 100)]),
            now(),
        );
        tree.apply(
            measure(
                CapacityScope::prefix("photos", "raw/"),
                &[("raw/a.jpg", 10)],
            ),
            later(),
        );

        assert_eq!(
            tree.read(&CapacityScope::bucket("photos")).scanned_at,
            Some(now()),
            "only the walked subtree may advance its scan time"
        );
        assert_eq!(
            tree.read(&CapacityScope::prefix("photos", "raw/"))
                .scanned_at,
            Some(later())
        );
    }

    #[test]
    fn an_emptied_branch_takes_its_bytes_off_the_bucket() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(
                CapacityScope::bucket("photos"),
                &[("raw/a.jpg", 100), ("thumbs/b.jpg", 50)],
            ),
            now(),
        );
        tree.apply(
            measure(CapacityScope::prefix("photos", "raw/"), &[]),
            later(),
        );

        assert_eq!(tree.read(&CapacityScope::bucket("photos")).total_size, 50);
    }

    #[test]
    fn an_unvisited_location_is_reported_as_never_measured() {
        let tree = CapacityTree::new(LIMITS);
        let snapshot = tree.read(&CapacityScope::bucket("photos"));

        assert!(!snapshot.is_measured());
        assert_eq!(snapshot.total_size, 0);
    }

    #[test]
    fn an_ancestor_created_by_a_deep_scan_stays_unmeasured() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(
                CapacityScope::prefix("photos", "raw/2024/"),
                &[("raw/2024/a.jpg", 100)],
            ),
            now(),
        );

        let bucket = tree.read(&CapacityScope::bucket("photos"));
        assert!(
            !bucket.is_measured(),
            "a total propagated up is a lower bound, not a measurement"
        );
        assert_eq!(bucket.total_size, 100);
    }

    #[test]
    fn depth_beyond_the_ceiling_is_counted_but_not_broken_down() {
        let limits = CapacityLimits {
            max_depth: 2,
            max_nodes: 1000,
        };
        let mut tree = CapacityTree::new(limits);
        tree.apply(
            measure_within(
                CapacityScope::bucket("photos"),
                &[("a/b/c/d.jpg", 100)],
                limits,
            ),
            now(),
        );

        assert_eq!(tree.read(&CapacityScope::bucket("photos")).total_size, 100);
        assert_eq!(
            tree.read(&CapacityScope::prefix("photos", "a/b/"))
                .total_size,
            100,
            "the deepest recorded level still holds everything below it"
        );

        let capped = tree.read(&CapacityScope::prefix("photos", "a/b/"));
        assert!(!capped.subdivided);
        assert!(capped.children.is_empty());
        assert!(
            !tree
                .read(&CapacityScope::prefix("photos", "a/b/c/"))
                .is_measured()
        );
    }

    #[test]
    fn one_scan_stops_creating_nodes_at_its_budget_without_losing_bytes() {
        let limits = CapacityLimits {
            max_depth: 4,
            max_nodes: 3,
        };
        let mut tree = CapacityTree::new(limits);
        tree.apply(
            measure_within(
                CapacityScope::bucket("photos"),
                &[
                    ("a/1/x.jpg", 10),
                    ("b/1/x.jpg", 20),
                    ("c/1/x.jpg", 30),
                    ("d/1/x.jpg", 40),
                ],
                limits,
            ),
            now(),
        );

        assert_eq!(
            tree.read(&CapacityScope::bucket("photos")).total_size,
            100,
            "every byte is counted even once the tree stops subdividing"
        );
        assert!(tree.stats().node_count <= limits.max_nodes);
        assert!(
            !tree.read(&CapacityScope::bucket("photos")).subdivided,
            "a location whose children were cut short must say so"
        );
    }

    #[test]
    fn accumulating_past_the_node_budget_sheds_the_deepest_level() {
        let limits = CapacityLimits {
            max_depth: 3,
            max_nodes: 4,
        };
        let mut tree = CapacityTree::new(limits);
        for bucket in ["one", "two"] {
            let scope = CapacityScope::bucket(bucket);
            let measurement =
                measure_within(scope, &[("a/b/x.jpg", 10)], tree.measurement_limits());
            tree.apply(measurement, now());
        }

        assert!(tree.stats().node_count <= limits.max_nodes);
        assert!(tree.stats().depth_reduced);
        assert_eq!(
            tree.read(&CapacityScope::bucket("one")).total_size,
            10,
            "shedding a level must not shed any bytes"
        );
        assert_eq!(
            tree.read(&CapacityScope::prefix("one", "a/")).total_size,
            10
        );
        assert!(
            !tree
                .read(&CapacityScope::prefix("one", "a/b/"))
                .is_measured(),
            "the shed level is gone rather than left holding a stale figure"
        );
    }

    #[test]
    fn a_shed_level_is_not_immediately_regrown() {
        let limits = CapacityLimits {
            max_depth: 3,
            max_nodes: 4,
        };
        let mut tree = CapacityTree::new(limits);
        for bucket in ["one", "two"] {
            let scope = CapacityScope::bucket(bucket);
            let measurement = measure_within(scope, &[("a/b/x", 1)], tree.measurement_limits());
            tree.apply(measurement, now());
        }

        let reduced = tree.stats().effective_depth;
        assert!(reduced < limits.max_depth);
        assert_eq!(
            tree.measurement_limits().max_depth,
            reduced,
            "the next scan must respect the depth the budget forced, or the tree oscillates"
        );
    }

    #[test]
    fn a_forgotten_bucket_leaves_nothing_behind() {
        let mut tree = CapacityTree::new(LIMITS);
        tree.apply(
            measure(CapacityScope::bucket("photos"), &[("a/b.jpg", 1)]),
            now(),
        );
        tree.forget_bucket("photos");

        assert_eq!(tree.stats().node_count, 0);
        assert!(!tree.read(&CapacityScope::bucket("photos")).is_measured());
    }
}
