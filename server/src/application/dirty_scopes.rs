//! Turning the outcome of a mutation into the locations that must be re-measured.
//!
//! Pure functions over a result. No delta arithmetic is attempted: a batch
//! delete reports which keys went, not how large they were, so subtracting
//! would mean trusting a size the caller supplied. Re-walking the smallest
//! location that contains the change is exact, and usually cheap.

use std::collections::BTreeMap;

use crate::domain::capacity::CapacityScope;
use crate::domain::models::{DeleteResult, MoveResult};
use crate::domain::object_path::common_folder_prefix;

use super::delete_cleanup::CleanupBucketDeleteResult;
use super::move_objects::MoveObjectsInput;

/// Returns the one location covering everything a delete removed.
///
/// Empty when nothing was actually removed, so a delete that failed outright
/// does not cost a scan.
#[must_use]
pub fn scopes_for_delete(bucket: &str, result: &DeleteResult) -> Vec<CapacityScope> {
    if result.deleted.is_empty() {
        return Vec::new();
    }
    vec![CapacityScope::prefix(
        bucket.to_owned(),
        &common_folder_prefix(result.deleted.iter().map(String::as_str)),
    )]
}

/// Returns the locations a move changed, on both sides.
///
/// The source is narrowed to the objects that actually left it. The destination
/// is taken from every requested destination rather than only the successful
/// ones, because a move can fail after its copy has landed: covering the whole
/// request keeps that case measured, at the cost of occasionally re-walking a
/// slightly wider location than strictly necessary.
#[must_use]
pub fn scopes_for_move(input: &MoveObjectsInput, result: &MoveResult) -> Vec<CapacityScope> {
    let mut scopes = Vec::new();

    if !result.moved.is_empty() {
        scopes.push(CapacityScope::prefix(
            input.source_bucket.clone(),
            &common_folder_prefix(result.moved.iter().map(|moved| moved.key.as_str())),
        ));
    }
    if !input.entries.is_empty() {
        scopes.push(CapacityScope::prefix(
            input.destination_bucket.clone(),
            &common_folder_prefix(
                input
                    .entries
                    .iter()
                    .map(|entry| entry.destination_key.as_str()),
            ),
        ));
    }

    scopes.sort();
    scopes.dedup();
    scopes
}

/// Returns one location per bucket a cleanup deletion touched.
#[must_use]
pub fn scopes_for_cleanup(results: &[CleanupBucketDeleteResult]) -> Vec<CapacityScope> {
    let mut by_bucket: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for result in results {
        for key in &result.deleted {
            by_bucket
                .entry(result.bucket.as_str())
                .or_default()
                .push(key.as_str());
        }
    }

    by_bucket
        .into_iter()
        .map(|(bucket, keys)| CapacityScope::prefix(bucket.to_owned(), &common_folder_prefix(keys)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::move_objects::MoveEntry;
    use crate::domain::models::{KeyFailure, MovedObject};

    fn deleted(keys: &[&str]) -> DeleteResult {
        DeleteResult {
            deleted: keys.iter().map(|key| (*key).to_owned()).collect(),
            failed: Vec::new(),
        }
    }

    fn entry(key: &str, destination: &str) -> MoveEntry {
        MoveEntry {
            key: key.to_owned(),
            destination_key: destination.to_owned(),
        }
    }

    fn moved(key: &str, destination: &str) -> MovedObject {
        MovedObject {
            key: key.to_owned(),
            destination_key: destination.to_owned(),
        }
    }

    #[test]
    fn a_delete_within_one_folder_only_dirties_that_folder() {
        let scopes = scopes_for_delete("photos", &deleted(&["raw/2024/a.jpg", "raw/2024/b.jpg"]));

        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].bucket_name(), "photos");
        assert_eq!(scopes[0].prefix_path(), "raw/2024/");
    }

    #[test]
    fn a_delete_spanning_folders_dirties_their_common_parent() {
        let scopes = scopes_for_delete("photos", &deleted(&["raw/a.jpg", "thumbs/b.jpg"]));
        assert!(scopes[0].is_bucket_root());
    }

    #[test]
    fn a_delete_that_removed_nothing_costs_no_scan() {
        let refused = DeleteResult {
            deleted: Vec::new(),
            failed: vec![KeyFailure {
                key: "a.jpg".to_owned(),
                message: "denied".to_owned(),
            }],
        };
        assert!(scopes_for_delete("photos", &refused).is_empty());
    }

    #[test]
    fn a_move_dirties_both_ends() {
        let input = MoveObjectsInput {
            source_bucket: "photos".to_owned(),
            destination_bucket: "archive".to_owned(),
            entries: vec![entry("raw/a.jpg", "old/a.jpg")],
        };
        let result = MoveResult {
            moved: vec![moved("raw/a.jpg", "old/a.jpg")],
            failed: Vec::new(),
        };

        let scopes = scopes_for_move(&input, &result);
        let described: Vec<_> = scopes.iter().map(CapacityScope::label).collect();
        assert_eq!(described, ["archive/old/", "photos/raw/"]);
    }

    #[test]
    fn a_move_within_one_bucket_dirties_both_locations_separately() {
        let input = MoveObjectsInput {
            source_bucket: "photos".to_owned(),
            destination_bucket: "photos".to_owned(),
            entries: vec![entry("raw/a.jpg", "sorted/a.jpg")],
        };
        let result = MoveResult {
            moved: vec![moved("raw/a.jpg", "sorted/a.jpg")],
            failed: Vec::new(),
        };

        let described: Vec<_> = scopes_for_move(&input, &result)
            .iter()
            .map(CapacityScope::label)
            .collect();
        assert_eq!(described, ["photos/raw/", "photos/sorted/"]);
    }

    #[test]
    fn a_move_whose_copy_landed_but_whose_source_survived_still_dirties_the_destination() {
        // The destination grew even though the move is reported as failed, so
        // leaving it unmeasured would understate it until the next sweep.
        let input = MoveObjectsInput {
            source_bucket: "photos".to_owned(),
            destination_bucket: "archive".to_owned(),
            entries: vec![entry("raw/a.jpg", "old/a.jpg")],
        };
        let result = MoveResult {
            moved: Vec::new(),
            failed: vec![KeyFailure {
                key: "raw/a.jpg".to_owned(),
                message: "Copied to the destination, but the original could not be removed"
                    .to_owned(),
            }],
        };

        let described: Vec<_> = scopes_for_move(&input, &result)
            .iter()
            .map(CapacityScope::label)
            .collect();
        assert_eq!(described, ["archive/old/"]);
    }

    #[test]
    fn identical_source_and_destination_locations_are_only_scanned_once() {
        let input = MoveObjectsInput {
            source_bucket: "photos".to_owned(),
            destination_bucket: "photos".to_owned(),
            entries: vec![entry("raw/a.jpg", "raw/b.jpg")],
        };
        let result = MoveResult {
            moved: vec![moved("raw/a.jpg", "raw/b.jpg")],
            failed: Vec::new(),
        };

        assert_eq!(scopes_for_move(&input, &result).len(), 1);
    }

    #[test]
    fn a_cleanup_yields_one_location_per_bucket() {
        let results = vec![
            CleanupBucketDeleteResult {
                bucket: "photos".to_owned(),
                deleted: vec!["raw/a.jpg".to_owned(), "raw/b.jpg".to_owned()],
                failed: Vec::new(),
            },
            CleanupBucketDeleteResult {
                bucket: "backups".to_owned(),
                deleted: vec!["2024/db.sql".to_owned()],
                failed: Vec::new(),
            },
        ];

        let described: Vec<_> = scopes_for_cleanup(&results)
            .iter()
            .map(CapacityScope::label)
            .collect();
        assert_eq!(described, ["backups/2024/", "photos/raw/"]);
    }

    #[test]
    fn a_cleanup_that_removed_nothing_costs_no_scan() {
        let results = vec![CleanupBucketDeleteResult {
            bucket: "photos".to_owned(),
            deleted: Vec::new(),
            failed: Vec::new(),
        }];
        assert!(scopes_for_cleanup(&results).is_empty());
    }
}
