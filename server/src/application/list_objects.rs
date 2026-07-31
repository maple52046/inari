//! Listing one page of a bucket or prefix.

use crate::domain::errors::StorageError;
use crate::domain::models::ObjectListPage;
use crate::domain::ports::{ListObjectsInput, ObjectStorage};

/// Keys requested per page when browsing.
///
/// Carried over unchanged from the TypeScript implementation so pagination
/// behaves identically for a user who has learned how far one "Load more" goes.
pub const DEFAULT_PAGE_SIZE: i32 = 200;

/// Delimiter that groups keys into folders.
pub const DEFAULT_DELIMITER: &str = "/";

/// Lists one page of objects and folders.
///
/// # Errors
///
/// Returns a [`StorageError`] when the page cannot be fetched, including a
/// continuation token the backend rejects.
pub async fn list_objects(
    storage: &dyn ObjectStorage,
    bucket: &str,
    prefix: &str,
    continuation_token: Option<String>,
) -> Result<ObjectListPage, StorageError> {
    storage
        .list_objects(&ListObjectsInput {
            bucket: bucket.to_owned(),
            prefix: prefix.to_owned(),
            delimiter: DEFAULT_DELIMITER.to_owned(),
            continuation_token,
            max_keys: Some(DEFAULT_PAGE_SIZE),
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeStorage, object, page};

    #[tokio::test]
    async fn the_first_page_is_requested_without_a_token() {
        let storage = FakeStorage::default().with_page(
            None,
            page(
                "photos",
                "",
                vec![object("a.jpg", 10)],
                Vec::new(),
                Some("next"),
            ),
        );

        let result = list_objects(&storage, "photos", "", None).await.unwrap();
        assert_eq!(result.objects.len(), 1);
        assert_eq!(result.continuation_token.as_deref(), Some("next"));
        assert!(result.is_truncated);
    }

    #[tokio::test]
    async fn a_token_selects_the_following_page() {
        let storage = FakeStorage::default()
            .with_page(
                None,
                page("photos", "", vec![object("a.jpg", 1)], vec![], Some("t2")),
            )
            .with_page(
                Some("t2"),
                page("photos", "", vec![object("b.jpg", 2)], vec![], None),
            );

        let second = list_objects(&storage, "photos", "", Some("t2".to_owned()))
            .await
            .unwrap();
        assert_eq!(second.objects[0].key, "b.jpg");
        assert!(second.continuation_token.is_none());
    }
}
