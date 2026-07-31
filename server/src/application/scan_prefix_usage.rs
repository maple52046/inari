//! Breaking one location down by what it directly contains.

use std::collections::HashMap;

use super::scan_usage::SCAN_PAGE_SIZE;
use crate::domain::errors::StorageError;
use crate::domain::models::usage_scope_label;
use crate::domain::object_path::child_of_prefix;
use crate::domain::ports::{ListObjectsInput, ObjectStorage};

/// Largest number of distinct children a breakdown will hold.
///
/// Memory here follows the location's fan-out rather than its object count, so
/// a prefix with an enormous number of direct children is the one shape that
/// could grow without bound. The TypeScript original had no such cap.
pub const MAX_ENTRIES: usize = 10_000;

/// Usage of one immediate child of a scanned location.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrefixUsageEntry {
    /// Name relative to the scanned prefix; folders keep their delimiter.
    pub name: String,
    /// Whether this aggregates a sub-tree rather than one object.
    pub is_prefix: bool,
    /// Combined size in bytes.
    pub total_size: u64,
    /// Objects counted.
    pub object_count: u64,
}

/// Breakdown of a single location by what it directly contains.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrefixUsage {
    /// Human label for the location.
    pub scope: String,
    /// Direct children, largest first.
    pub entries: Vec<PrefixUsageEntry>,
    /// Combined size of everything beneath the location.
    pub total_size: u64,
    /// Objects beneath the location.
    pub object_count: u64,
    /// Whether [`MAX_ENTRIES`] stopped new children from being recorded.
    pub truncated: bool,
}

/// Measures what a location contains, one entry per immediate child.
///
/// Uses a single flat listing and attributes each key to its top-level child,
/// so the whole breakdown costs exactly one walk of the sub-tree. Listing each
/// child separately would read the same objects again per level.
///
/// A folder marker, an object whose key is the prefix itself, belongs to no
/// child and is skipped, though its bytes still count towards the total.
///
/// # Errors
///
/// Returns a [`StorageError`] when any page of the walk fails.
pub async fn scan_prefix_usage(
    storage: &dyn ObjectStorage,
    bucket: &str,
    prefix: &str,
) -> Result<PrefixUsage, StorageError> {
    let mut by_name: HashMap<String, PrefixUsageEntry> = HashMap::new();
    let mut continuation_token = None;
    let mut total_size = 0_u64;
    let mut object_count = 0_u64;
    let mut truncated = false;

    loop {
        let page = storage
            .list_objects(&ListObjectsInput {
                bucket: bucket.to_owned(),
                prefix: prefix.to_owned(),
                delimiter: String::new(),
                continuation_token,
                max_keys: Some(SCAN_PAGE_SIZE),
            })
            .await?;

        for object in &page.objects {
            total_size = total_size.saturating_add(object.size);
            object_count += 1;

            let Some(child) = child_of_prefix(&object.key, prefix) else {
                continue;
            };

            if let Some(entry) = by_name.get_mut(&child.name) {
                entry.total_size = entry.total_size.saturating_add(object.size);
                entry.object_count += 1;
            } else if by_name.len() < MAX_ENTRIES {
                by_name.insert(
                    child.name.clone(),
                    PrefixUsageEntry {
                        name: child.name,
                        is_prefix: child.is_prefix,
                        total_size: object.size,
                        object_count: 1,
                    },
                );
            } else {
                truncated = true;
            }
        }

        continuation_token = page.continuation_token;
        if continuation_token.is_none() {
            break;
        }
    }

    let mut entries: Vec<_> = by_name.into_values().collect();
    entries.sort_by(|left, right| {
        right
            .total_size
            .cmp(&left.total_size)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(PrefixUsage {
        scope: usage_scope_label(bucket, Some(prefix)),
        entries,
        total_size,
        object_count,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeStorage, object, page};

    #[tokio::test]
    async fn keys_fold_into_their_top_level_child() {
        let storage = FakeStorage::default().with_page(
            None,
            page(
                "photos",
                "",
                vec![
                    object("2024/a.jpg", 100),
                    object("2024/b.jpg", 200),
                    object("2023/c.jpg", 50),
                    object("loose.txt", 10),
                ],
                Vec::new(),
                None,
            ),
        );

        let usage = scan_prefix_usage(&storage, "photos", "").await.unwrap();
        assert_eq!(usage.total_size, 360);
        assert_eq!(usage.object_count, 4);

        // Largest first, so the busiest folder leads.
        assert_eq!(usage.entries[0].name, "2024/");
        assert_eq!(usage.entries[0].total_size, 300);
        assert_eq!(usage.entries[0].object_count, 2);
        assert!(usage.entries[0].is_prefix);

        assert_eq!(usage.entries[1].name, "2023/");
        assert_eq!(usage.entries[2].name, "loose.txt");
        assert!(!usage.entries[2].is_prefix);
    }

    #[tokio::test]
    async fn a_folder_marker_counts_towards_the_total_but_no_child() {
        let storage = FakeStorage::default().with_page(
            None,
            page(
                "photos",
                "2024/",
                vec![object("2024/", 0), object("2024/a.jpg", 100)],
                Vec::new(),
                None,
            ),
        );

        let usage = scan_prefix_usage(&storage, "photos", "2024/")
            .await
            .unwrap();
        assert_eq!(usage.object_count, 2);
        assert_eq!(usage.entries.len(), 1);
        assert_eq!(usage.entries[0].name, "a.jpg");
    }

    #[tokio::test]
    async fn equal_sizes_are_ordered_by_name() {
        let storage = FakeStorage::default().with_page(
            None,
            page(
                "photos",
                "",
                vec![object("zebra.txt", 10), object("apple.txt", 10)],
                Vec::new(),
                None,
            ),
        );

        let usage = scan_prefix_usage(&storage, "photos", "").await.unwrap();
        assert_eq!(usage.entries[0].name, "apple.txt");
        assert_eq!(usage.entries[1].name, "zebra.txt");
    }

    #[tokio::test]
    async fn the_scope_label_includes_the_prefix() {
        let storage = FakeStorage::default()
            .with_page(None, page("photos", "2024/", Vec::new(), Vec::new(), None));

        let usage = scan_prefix_usage(&storage, "photos", "2024/")
            .await
            .unwrap();
        assert_eq!(usage.scope, "photos/2024/");
    }
}
