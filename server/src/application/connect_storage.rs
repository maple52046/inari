//! Establishing and validating a connection.

use crate::domain::errors::StorageError;
use crate::domain::models::S3Connection;
use crate::domain::ports::ObjectStorageFactory;

/// Validates a candidate connection against the backend.
///
/// Callers persist the connection only after this succeeds, so a stored session
/// always represents credentials that worked at least once.
///
/// # Errors
///
/// Returns a [`StorageError`] when the backend rejects the connection or cannot
/// be reached.
pub async fn test_storage_connection(
    factory: &dyn ObjectStorageFactory,
    connection: &S3Connection,
) -> Result<(), StorageError> {
    factory.create(connection)?.test_connection().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::test_double::{FakeStorage, FakeStorageFactory};
    use crate::domain::errors::StorageErrorKind;

    fn connection() -> S3Connection {
        S3Connection {
            endpoint: "https://minio.example.com".to_owned(),
            access_key_id: "AKIAEXAMPLE".to_owned(),
            secret_access_key: "secret".to_owned(),
            region: "us-east-1".to_owned(),
            force_path_style: true,
            skip_tls_verification: false,
        }
    }

    #[tokio::test]
    async fn working_credentials_are_accepted() {
        let factory = FakeStorageFactory::new(FakeStorage::default());
        assert!(
            test_storage_connection(&factory, &connection())
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn a_rejected_connection_surfaces_its_kind() {
        let storage =
            FakeStorage::default().failing(StorageError::new(StorageErrorKind::InvalidCredential));
        let factory = FakeStorageFactory::new(storage);

        let error = test_storage_connection(&factory, &connection())
            .await
            .expect_err("invalid credentials must not be reported as a success");
        assert_eq!(error.kind(), StorageErrorKind::InvalidCredential);
    }
}
