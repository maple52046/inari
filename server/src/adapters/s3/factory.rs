//! Builds a storage port for a session's connection.

use std::sync::Arc;
use std::time::Duration;

use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region, timeout::TimeoutConfig};

use super::http_client::{HttpClients, TlsMode};
use super::storage::S3ObjectStorage;
use crate::domain::errors::StorageError;
use crate::domain::models::S3Connection;
use crate::domain::ports::{ObjectStorage, ObjectStorageFactory};

/// Identifies where the SDK got its credentials, for its own diagnostics.
const CREDENTIAL_SOURCE: &str = "inari-session";

/// Creates an SDK-backed [`ObjectStorage`] per connection.
///
/// Holds the two process-wide HTTP clients. Building a client per request is
/// deliberate: it keeps no credential material in a server-side map, and it is
/// nearly free because the connection pool lives in the shared HTTP client
/// rather than in the SDK client.
#[derive(Debug, Clone)]
pub struct S3StorageFactory {
    http_clients: HttpClients,
    timeout: Duration,
}

impl S3StorageFactory {
    /// Wires the factory to the shared HTTP clients.
    #[must_use]
    pub const fn new(http_clients: HttpClients, timeout: Duration) -> Self {
        Self {
            http_clients,
            timeout,
        }
    }
}

impl ObjectStorageFactory for S3StorageFactory {
    fn create(&self, connection: &S3Connection) -> Result<Arc<dyn ObjectStorage>, StorageError> {
        let tls_mode = if connection.skip_tls_verification {
            TlsMode::Insecure
        } else {
            TlsMode::Verify
        };

        let credentials = Credentials::new(
            connection.access_key_id.clone(),
            connection.secret_access_key.clone(),
            None,
            None,
            CREDENTIAL_SOURCE,
        );

        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .endpoint_url(&connection.endpoint)
            .region(Region::new(connection.region.clone()))
            .credentials_provider(credentials)
            .force_path_style(connection.force_path_style)
            .http_client(self.http_clients.get(tls_mode))
            .timeout_config(
                TimeoutConfig::builder()
                    .operation_attempt_timeout(self.timeout)
                    .build(),
            )
            .build();

        Ok(Arc::new(S3ObjectStorage::new(
            aws_sdk_s3::Client::from_conf(config),
        )))
    }
}
