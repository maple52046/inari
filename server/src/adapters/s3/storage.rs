//! The `aws-sdk-s3` implementation of [`ObjectStorage`].

use std::time::Duration;

use async_trait::async_trait;
use aws_sdk_s3::Client;
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart, Delete, ObjectIdentifier};

use super::error_mapper::map_sdk_error;
use super::mappers::{map_bucket, map_object, map_prefix};
use crate::domain::errors::{StorageError, StorageErrorKind};
use crate::domain::models::{BucketSummary, DeleteResult, KeyFailure, ObjectListPage};
use crate::domain::ports::{CopyObjectInput, ListObjectsInput, ObjectStorage};

/// Maximum keys accepted by a single `DeleteObjects` request.
const DELETE_BATCH_LIMIT: usize = 1000;

/// Largest source S3 accepts for a single-request copy; above this, multipart.
const SINGLE_COPY_LIMIT: u64 = 5 * 1024 * 1024 * 1024;

/// Range size per `UploadPartCopy`, comfortably above the 5 MiB part floor.
const COPY_PART_SIZE: u64 = 256 * 1024 * 1024;

/// Parts allowed in one multipart upload, which caps the usable part size.
const MAX_COPY_PARTS: u64 = 10_000;

/// Talks to an S3-compatible backend on behalf of one session.
#[derive(Debug, Clone)]
pub struct S3ObjectStorage {
    client: Client,
}

impl S3ObjectStorage {
    /// Wraps a configured SDK client.
    #[must_use]
    pub const fn new(client: Client) -> Self {
        Self { client }
    }

    /// Reads an object's metadata.
    async fn head_object(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<aws_sdk_s3::operation::head_object::HeadObjectOutput, StorageError> {
        self.client
            .head_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::CopyFailed))
    }

    /// Copies a source above [`SINGLE_COPY_LIMIT`] as a series of byte ranges.
    ///
    /// Side effect: any failure aborts the started upload, because an incomplete
    /// multipart upload is invisible to listings yet keeps accruing storage cost
    /// until a lifecycle rule reclaims it.
    async fn multipart_copy(
        &self,
        input: &CopyObjectInput,
        size: u64,
        content_type: Option<String>,
    ) -> Result<(), StorageError> {
        // Raised above the preferred size only when the object is large enough
        // that fixed-size parts would exceed the per-upload part limit.
        let part_size = COPY_PART_SIZE.max(size.div_ceil(MAX_COPY_PARTS));
        let copy_source = copy_source_of(&input.source_bucket, &input.source_key);

        let created = self
            .client
            .create_multipart_upload()
            .bucket(&input.destination_bucket)
            .key(&input.destination_key)
            .set_content_type(content_type)
            .send()
            .await
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::CopyFailed))?;

        let Some(upload_id) = created.upload_id().map(str::to_owned) else {
            return Err(StorageError::new(StorageErrorKind::CopyFailed)
                .with_detail("the backend accepted the multipart upload but returned no id"));
        };

        match self
            .copy_parts(input, size, part_size, &copy_source, &upload_id)
            .await
        {
            Ok(()) => Ok(()),
            Err(error) => {
                self.abort_upload(
                    &input.destination_bucket,
                    &input.destination_key,
                    &upload_id,
                )
                .await;
                Err(error)
            }
        }
    }

    /// Copies every byte range and completes the upload.
    async fn copy_parts(
        &self,
        input: &CopyObjectInput,
        size: u64,
        part_size: u64,
        copy_source: &str,
        upload_id: &str,
    ) -> Result<(), StorageError> {
        let mut parts: Vec<CompletedPart> = Vec::new();
        let mut start = 0_u64;
        while start < size {
            let end = (start + part_size).min(size) - 1;
            let part_number = i32::try_from(parts.len() + 1).map_err(|_| {
                StorageError::new(StorageErrorKind::CopyFailed)
                    .with_detail("object needs more parts than a multipart upload allows")
            })?;

            let part = self
                .client
                .upload_part_copy()
                .bucket(&input.destination_bucket)
                .key(&input.destination_key)
                .upload_id(upload_id)
                .part_number(part_number)
                .copy_source(copy_source)
                .copy_source_range(format!("bytes={start}-{end}"))
                .send()
                .await
                .map_err(|error| map_sdk_error(&error, StorageErrorKind::CopyFailed))?;

            parts.push(
                CompletedPart::builder()
                    .set_e_tag(
                        part.copy_part_result().and_then(|result| {
                            result.e_tag().map(std::string::ToString::to_string)
                        }),
                    )
                    .part_number(part_number)
                    .build(),
            );
            start += part_size;
        }

        self.client
            .complete_multipart_upload()
            .bucket(&input.destination_bucket)
            .key(&input.destination_key)
            .upload_id(upload_id)
            .multipart_upload(
                CompletedMultipartUpload::builder()
                    .set_parts(Some(parts))
                    .build(),
            )
            .send()
            .await
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::CopyFailed))?;
        Ok(())
    }

    /// Abandons a failed multipart upload, best effort.
    ///
    /// The caller must see the failure that caused the abort, so a failing abort
    /// is swallowed rather than replacing it; the leftover upload is then only
    /// reclaimable by a bucket lifecycle rule.
    async fn abort_upload(&self, bucket: &str, key: &str, upload_id: &str) {
        if let Err(error) = self
            .client
            .abort_multipart_upload()
            .bucket(bucket)
            .key(key)
            .upload_id(upload_id)
            .send()
            .await
        {
            tracing::warn!(
                bucket,
                %error,
                "could not abort a failed multipart copy; the upload will linger until a lifecycle rule reclaims it"
            );
        }
    }
}

#[async_trait]
impl ObjectStorage for S3ObjectStorage {
    async fn test_connection(&self) -> Result<(), StorageError> {
        self.client
            .list_buckets()
            .send()
            .await
            .map(|_| ())
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::InvalidCredential))
    }

    async fn list_buckets(&self) -> Result<Vec<BucketSummary>, StorageError> {
        let response = self
            .client
            .list_buckets()
            .send()
            .await
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::InvalidCredential))?;
        Ok(response.buckets().iter().map(map_bucket).collect())
    }

    async fn list_objects(&self, input: &ListObjectsInput) -> Result<ObjectListPage, StorageError> {
        let mut request = self.client.list_objects_v2().bucket(&input.bucket);
        if !input.prefix.is_empty() {
            request = request.prefix(&input.prefix);
        }
        // An empty delimiter means a flat recursive listing, which the usage and
        // cleanup scans rely on; the field is omitted rather than sent empty.
        if !input.delimiter.is_empty() {
            request = request.delimiter(&input.delimiter);
        }
        if let Some(token) = &input.continuation_token {
            request = request.continuation_token(token);
        }
        if let Some(max_keys) = input.max_keys {
            request = request.max_keys(max_keys);
        }

        let response = request
            .send()
            .await
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::PaginationFailed))?;

        let objects: Vec<_> = response
            .contents()
            .iter()
            .map(|object| map_object(object, &input.prefix, &input.delimiter))
            // The prefix placeholder object, the "folder" key itself, is noise.
            .filter(|object| object.key != input.prefix)
            .collect();

        Ok(ObjectListPage {
            bucket: input.bucket.clone(),
            prefix: input.prefix.clone(),
            delimiter: input.delimiter.clone(),
            prefixes: response
                .common_prefixes()
                .iter()
                .map(|common| map_prefix(common, &input.prefix, &input.delimiter))
                .collect(),
            is_truncated: response.is_truncated().unwrap_or(false),
            continuation_token: response.next_continuation_token().map(str::to_owned),
            key_count: response
                .key_count()
                .unwrap_or_else(|| i32::try_from(objects.len()).unwrap_or(i32::MAX)),
            objects,
        })
    }

    async fn delete_objects(
        &self,
        bucket: &str,
        keys: &[String],
    ) -> Result<DeleteResult, StorageError> {
        let mut result = DeleteResult::default();

        for batch in keys.chunks(DELETE_BATCH_LIMIT) {
            let identifiers: Result<Vec<_>, _> = batch
                .iter()
                .map(|key| ObjectIdentifier::builder().key(key).build())
                .collect();
            let identifiers = match identifiers {
                Ok(identifiers) => identifiers,
                Err(error) => {
                    record_batch_failure(&mut result, batch, &error.to_string());
                    continue;
                }
            };

            let delete = match Delete::builder()
                .set_objects(Some(identifiers))
                .quiet(false)
                .build()
            {
                Ok(delete) => delete,
                Err(error) => {
                    record_batch_failure(&mut result, batch, &error.to_string());
                    continue;
                }
            };

            match self
                .client
                .delete_objects()
                .bucket(bucket)
                .delete(delete)
                .send()
                .await
            {
                Ok(response) => {
                    for deleted in response.deleted() {
                        if let Some(key) = deleted.key() {
                            result.deleted.push(key.to_owned());
                        }
                    }
                    for failure in response.errors() {
                        result.failed.push(KeyFailure {
                            key: failure.key().unwrap_or_default().to_owned(),
                            message: failure.code().unwrap_or("Delete failed").to_owned(),
                        });
                    }
                }
                Err(error) => {
                    let normalized = map_sdk_error(&error, StorageErrorKind::DeleteFailed);
                    record_batch_failure(&mut result, batch, normalized.kind().code());
                }
            }
        }

        Ok(result)
    }

    async fn object_exists(&self, bucket: &str, key: &str) -> Result<bool, StorageError> {
        match self
            .client
            .head_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(error) => {
                let normalized = map_sdk_error(&error, StorageErrorKind::Unknown);
                if normalized.kind() == StorageErrorKind::NotFound {
                    Ok(false)
                } else {
                    Err(normalized)
                }
            }
        }
    }

    async fn copy_object(&self, input: &CopyObjectInput) -> Result<(), StorageError> {
        // The source is inspected first because the copy strategy depends on its
        // size, and because a multipart copy has to restate metadata that the
        // single-request copy would have carried over on its own.
        let source = self
            .head_object(&input.source_bucket, &input.source_key)
            .await?;
        let size = source.content_length().unwrap_or_default().max(0);
        let size = size.unsigned_abs();

        if size > SINGLE_COPY_LIMIT {
            return self
                .multipart_copy(input, size, source.content_type().map(str::to_owned))
                .await;
        }

        self.client
            .copy_object()
            .bucket(&input.destination_bucket)
            .key(&input.destination_key)
            .copy_source(copy_source_of(&input.source_bucket, &input.source_key))
            .send()
            .await
            .map(|_| ())
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::CopyFailed))
    }

    async fn download_url(
        &self,
        bucket: &str,
        key: &str,
        expires_in: u64,
    ) -> Result<String, StorageError> {
        let config =
            PresigningConfig::expires_in(Duration::from_secs(expires_in)).map_err(|error| {
                StorageError::new(StorageErrorKind::Unknown).with_detail(error.to_string())
            })?;

        let request = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key)
            .presigned(config)
            .await
            .map_err(|error| map_sdk_error(&error, StorageErrorKind::Unknown))?;

        Ok(request.uri().to_owned())
    }
}

/// Marks every key in a batch as failed with the same reason.
fn record_batch_failure(result: &mut DeleteResult, batch: &[String], message: &str) {
    for key in batch {
        result.failed.push(KeyFailure {
            key: key.clone(),
            message: message.to_owned(),
        });
    }
}

/// Builds the `x-amz-copy-source` value identifying a copy's source object.
///
/// S3 requires this value URL-encoded and the SDK does not encode it, so a key
/// holding a space or any non-ASCII character is rejected with
/// `SignatureDoesNotMatch` unless it is escaped here. Separators stay literal
/// and only the segments are escaped, matching the `bucket/key` form S3
/// documents.
fn copy_source_of(bucket: &str, key: &str) -> String {
    let escaped_key = key
        .split('/')
        .map(percent_encode)
        .collect::<Vec<_>>()
        .join("/");
    format!("{}/{}", percent_encode(bucket), escaped_key)
}

/// Percent-encodes everything JavaScript's `encodeURIComponent` would.
///
/// Hand-rolled to keep the copy-source escaping byte-for-byte identical to the
/// TypeScript implementation, which a general-purpose URL encoder would not
/// guarantee for the unreserved set.
fn percent_encode(value: &str) -> String {
    const UNRESERVED: &[u8] = b"-_.!~*'()";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || UNRESERVED.contains(byte) {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_source_keeps_separators_literal() {
        assert_eq!(
            copy_source_of("photos", "2024/summer/a.jpg"),
            "photos/2024/summer/a.jpg"
        );
    }

    #[test]
    fn copy_source_escapes_spaces_and_unicode() {
        assert_eq!(
            copy_source_of("my bucket", "holiday photos/貓.jpg"),
            "my%20bucket/holiday%20photos/%E8%B2%93.jpg"
        );
    }

    #[test]
    fn copy_source_escapes_a_literal_percent() {
        assert_eq!(copy_source_of("b", "100%.txt"), "b/100%25.txt");
    }

    #[test]
    fn percent_encoding_matches_encode_uri_component() {
        assert_eq!(percent_encode("a-b_c.d!e~f*g'h(i)"), "a-b_c.d!e~f*g'h(i)");
        assert_eq!(percent_encode("a+b&c=d"), "a%2Bb%26c%3Dd");
        assert_eq!(percent_encode("a/b"), "a%2Fb");
    }

    #[test]
    fn part_size_grows_only_for_objects_that_would_exceed_the_part_limit() {
        let modest = 10 * 1024 * 1024 * 1024_u64;
        assert_eq!(
            COPY_PART_SIZE.max(modest.div_ceil(MAX_COPY_PARTS)),
            COPY_PART_SIZE
        );

        let enormous = 5 * 1024 * 1024 * 1024 * 1024_u64;
        assert!(COPY_PART_SIZE.max(enormous.div_ceil(MAX_COPY_PARTS)) > COPY_PART_SIZE);
    }
}
