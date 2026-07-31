//! Moving objects by composing a copy and a delete.

use std::collections::HashSet;

use crate::domain::errors::StorageError;
use crate::domain::models::{KeyFailure, MoveResult, MovedObject};
use crate::domain::ports::{CopyObjectInput, ObjectStorage};

const SAME_LOCATION: &str = "Source and destination are the same";
const EMPTY_DESTINATION: &str = "Destination key is empty";
const FOLDER_DESTINATION: &str = "Destination must be an object key, not a folder";
const DESTINATION_TAKEN: &str = "An object already exists at the destination";
const SOURCE_REMAINS: &str = "Copied to the destination, but the original could not be removed";

/// One object to relocate, with the key it should end up under.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoveEntry {
    /// Current key.
    pub key: String,
    /// Key the object should end up at.
    pub destination_key: String,
}

/// Identifies the objects to move and where they are going.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoveObjectsInput {
    /// Bucket the objects are read from.
    pub source_bucket: String,
    /// Bucket the objects are written to.
    pub destination_bucket: String,
    /// The objects to relocate.
    pub entries: Vec<MoveEntry>,
}

/// Moves objects by copying each one and then deleting the sources that landed.
///
/// Object storage has no move operation, so this composes one. The invariant
/// that makes it safe: **a source is deleted only after its own copy is known to
/// have succeeded**, so a failed copy can never destroy the only remaining
/// version.
///
/// Nothing is overwritten. A destination that already holds an object is
/// reported as a failure instead, which also rules out the case where the
/// destination resolves to the source itself and the delete would erase it.
///
/// The operation is not atomic: callers must handle a result where only some
/// entries moved, including entries whose copy landed but whose source survived.
///
/// # Errors
///
/// Returns a [`StorageError`] only when the batch delete of already-copied
/// sources fails outright. Per-entry problems are reported in
/// [`MoveResult::failed`].
pub async fn move_objects(
    storage: &dyn ObjectStorage,
    input: &MoveObjectsInput,
) -> Result<MoveResult, StorageError> {
    let mut failed: Vec<KeyFailure> = Vec::new();
    let mut copied: Vec<MoveEntry> = Vec::new();

    // Sequential rather than concurrent: each entry probes the destination
    // before writing it, and only that ordering lets an earlier copy be seen by
    // a later probe, so two entries aimed at one destination cannot both
    // proceed.
    for entry in &input.entries {
        let destination_key = entry.destination_key.trim();

        if destination_key.is_empty() {
            failed.push(failure(&entry.key, EMPTY_DESTINATION));
            continue;
        }
        if destination_key.ends_with('/') {
            failed.push(failure(&entry.key, FOLDER_DESTINATION));
            continue;
        }
        if input.source_bucket == input.destination_bucket && destination_key == entry.key {
            failed.push(failure(&entry.key, SAME_LOCATION));
            continue;
        }

        match storage
            .object_exists(&input.destination_bucket, destination_key)
            .await
        {
            Ok(true) => {
                failed.push(failure(&entry.key, DESTINATION_TAKEN));
                continue;
            }
            Ok(false) => {}
            Err(error) => {
                failed.push(failure(&entry.key, error.message()));
                continue;
            }
        }

        match storage
            .copy_object(&CopyObjectInput {
                source_bucket: input.source_bucket.clone(),
                source_key: entry.key.clone(),
                destination_bucket: input.destination_bucket.clone(),
                destination_key: destination_key.to_owned(),
            })
            .await
        {
            Ok(()) => copied.push(MoveEntry {
                key: entry.key.clone(),
                destination_key: destination_key.to_owned(),
            }),
            Err(error) => failed.push(failure(&entry.key, error.message())),
        }
    }

    if copied.is_empty() {
        return Ok(MoveResult {
            moved: Vec::new(),
            failed,
        });
    }

    let source_keys: Vec<String> = copied.iter().map(|entry| entry.key.clone()).collect();
    let deletion = storage
        .delete_objects(&input.source_bucket, &source_keys)
        .await?;
    let removed: HashSet<&str> = deletion.deleted.iter().map(String::as_str).collect();

    let mut moved = Vec::new();
    for entry in copied {
        if removed.contains(entry.key.as_str()) {
            moved.push(MovedObject {
                key: entry.key,
                destination_key: entry.destination_key,
            });
        } else {
            // The object now exists in both places. That has to be reported,
            // because it is the one outcome the user has to clean up by hand.
            failed.push(failure(&entry.key, SOURCE_REMAINS));
        }
    }

    Ok(MoveResult { moved, failed })
}

fn failure(key: &str, message: &str) -> KeyFailure {
    KeyFailure {
        key: key.to_owned(),
        message: message.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::FakeStorage;

    fn input(entries: Vec<(&str, &str)>) -> MoveObjectsInput {
        MoveObjectsInput {
            source_bucket: "photos".to_owned(),
            destination_bucket: "photos".to_owned(),
            entries: entries
                .into_iter()
                .map(|(key, destination)| MoveEntry {
                    key: key.to_owned(),
                    destination_key: destination.to_owned(),
                })
                .collect(),
        }
    }

    #[tokio::test]
    async fn a_move_copies_then_deletes_the_source() {
        let storage = FakeStorage::default();
        let result = move_objects(&storage, &input(vec![("a.jpg", "b.jpg")]))
            .await
            .unwrap();

        assert_eq!(result.moved.len(), 1);
        assert_eq!(result.moved[0].destination_key, "b.jpg");
        assert!(result.failed.is_empty());

        let calls = storage.calls.lock().unwrap().clone();
        assert_eq!(
            calls,
            ["copy photos/a.jpg -> photos/b.jpg", "delete photos a.jpg"],
            "the source must only be deleted after its copy succeeds"
        );
    }

    #[tokio::test]
    async fn an_occupied_destination_is_refused_without_copying() {
        let storage = FakeStorage::default().with_existing_keys(["b.jpg"]);
        let result = move_objects(&storage, &input(vec![("a.jpg", "b.jpg")]))
            .await
            .unwrap();

        assert!(result.moved.is_empty());
        assert_eq!(result.failed[0].message, DESTINATION_TAKEN);
        assert!(
            storage.calls.lock().unwrap().is_empty(),
            "nothing may be written or deleted when the destination is taken"
        );
    }

    #[tokio::test]
    async fn moving_onto_itself_is_refused() {
        let storage = FakeStorage::default();
        let result = move_objects(&storage, &input(vec![("a.jpg", "a.jpg")]))
            .await
            .unwrap();

        assert_eq!(result.failed[0].message, SAME_LOCATION);
        assert!(storage.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_folder_destination_is_refused() {
        let storage = FakeStorage::default();
        let result = move_objects(&storage, &input(vec![("a.jpg", "archive/")]))
            .await
            .unwrap();
        assert_eq!(result.failed[0].message, FOLDER_DESTINATION);
    }

    #[tokio::test]
    async fn a_blank_destination_is_refused() {
        let storage = FakeStorage::default();
        let result = move_objects(&storage, &input(vec![("a.jpg", "   ")]))
            .await
            .unwrap();
        assert_eq!(result.failed[0].message, EMPTY_DESTINATION);
    }

    #[tokio::test]
    async fn a_valid_entry_still_moves_when_another_is_refused() {
        let storage = FakeStorage::default();
        let result = move_objects(&storage, &input(vec![("a.jpg", ""), ("b.jpg", "c.jpg")]))
            .await
            .unwrap();

        assert_eq!(result.moved.len(), 1);
        assert_eq!(result.moved[0].key, "b.jpg");
        assert_eq!(result.failed.len(), 1);
    }

    #[tokio::test]
    async fn the_same_key_in_another_bucket_is_a_real_move() {
        let storage = FakeStorage::default();
        let result = move_objects(
            &storage,
            &MoveObjectsInput {
                destination_bucket: "archive".to_owned(),
                ..input(vec![("a.jpg", "a.jpg")])
            },
        )
        .await
        .unwrap();

        assert_eq!(result.moved.len(), 1);
    }
}
