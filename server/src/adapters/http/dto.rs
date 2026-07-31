//! The wire shapes of the JSON API.
//!
//! These mirror the TypeScript interfaces the React components already consume,
//! so the frontend keeps its existing types. The mirror is generated rather than
//! hand-maintained: `cargo test export_bindings` writes `web/src/api/types.ts`.
//!
//! Timestamps travel as RFC 3339 strings because JSON has no date type. The API
//! client revives them into `Date` before any component sees them.

use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use ts_rs::TS;

use crate::domain::models::{
    BucketSummary, CommonPrefix, DeleteResult, KeyFailure, MoveResult, MovedObject, ObjectListPage,
    ObjectSummary, S3Connection, UsageScope,
};

/// Where the generated TypeScript mirror is written.
pub(crate) const BINDINGS: &str = "../../web/src/api/types.ts";

/// Renders a timestamp as RFC 3339, dropping one that cannot be represented.
fn to_rfc3339(value: Option<SystemTime>) -> Option<String> {
    let value = value?;
    OffsetDateTime::from(value).format(&Rfc3339).ok()
}

/// A bucket as shown in the bucket list.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct BucketSummaryDto {
    /// Bucket name.
    pub name: String,
    /// Creation time as RFC 3339, when the backend reports one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub created_at: Option<String>,
}

impl From<BucketSummary> for BucketSummaryDto {
    fn from(bucket: BucketSummary) -> Self {
        Self {
            name: bucket.name,
            created_at: to_rfc3339(bucket.created_at),
        }
    }
}

/// A single object row.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct ObjectSummaryDto {
    /// Full object key.
    pub key: String,
    /// Basename relative to the listed prefix.
    pub name: String,
    /// Size in bytes.
    ///
    /// Declared as a TypeScript `number` rather than the `bigint` ts-rs would
    /// infer: serde writes a plain JSON number, and the existing components do
    /// arithmetic on it. Exactness holds to 2^53 bytes, far beyond any object a
    /// backend can store.
    #[ts(type = "number")]
    pub size: u64,
    /// Last modification time as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_modified: Option<String>,
    /// Storage class, when reported.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub storage_class: Option<String>,
    /// Entity tag, when reported.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub etag: Option<String>,
}

impl From<ObjectSummary> for ObjectSummaryDto {
    fn from(object: ObjectSummary) -> Self {
        Self {
            key: object.key,
            name: object.name,
            size: object.size,
            last_modified: to_rfc3339(object.last_modified),
            storage_class: object.storage_class,
            etag: object.etag,
        }
    }
}

/// A folder row produced by the listing delimiter.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CommonPrefixDto {
    /// Full prefix, including its trailing delimiter.
    pub prefix: String,
    /// Basename relative to the listed prefix.
    pub name: String,
}

impl From<CommonPrefix> for CommonPrefixDto {
    fn from(prefix: CommonPrefix) -> Self {
        Self {
            prefix: prefix.prefix,
            name: prefix.name,
        }
    }
}

/// One page of a listing.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct ObjectListPageDto {
    /// Bucket that was listed.
    pub bucket: String,
    /// Prefix that was listed.
    pub prefix: String,
    /// Delimiter used.
    pub delimiter: String,
    /// Folder rows.
    pub prefixes: Vec<CommonPrefixDto>,
    /// Object rows.
    pub objects: Vec<ObjectSummaryDto>,
    /// Whether the backend has more to give.
    pub is_truncated: bool,
    /// Token for the next page.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub continuation_token: Option<String>,
    /// Keys the backend reported for this page.
    pub key_count: i32,
}

impl From<ObjectListPage> for ObjectListPageDto {
    fn from(page: ObjectListPage) -> Self {
        Self {
            bucket: page.bucket,
            prefix: page.prefix,
            delimiter: page.delimiter,
            prefixes: page.prefixes.into_iter().map(Into::into).collect(),
            objects: page.objects.into_iter().map(Into::into).collect(),
            is_truncated: page.is_truncated,
            continuation_token: page.continuation_token,
            key_count: page.key_count,
        }
    }
}

/// A key that could not be acted on.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct KeyFailureDto {
    /// The key that failed.
    pub key: String,
    /// Why it failed.
    pub message: String,
}

impl From<KeyFailure> for KeyFailureDto {
    fn from(failure: KeyFailure) -> Self {
        Self {
            key: failure.key,
            message: failure.message,
        }
    }
}

/// Outcome of a batch delete.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct DeleteResultDto {
    /// Keys the backend confirmed as removed.
    pub deleted: Vec<String>,
    /// Keys that survived.
    pub failed: Vec<KeyFailureDto>,
}

impl From<DeleteResult> for DeleteResultDto {
    fn from(result: DeleteResult) -> Self {
        Self {
            deleted: result.deleted,
            failed: result.failed.into_iter().map(Into::into).collect(),
        }
    }
}

/// An object that reached its destination.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct MovedObjectDto {
    /// Original key.
    pub key: String,
    /// Key it now lives at.
    pub destination_key: String,
}

impl From<MovedObject> for MovedObjectDto {
    fn from(moved: MovedObject) -> Self {
        Self {
            key: moved.key,
            destination_key: moved.destination_key,
        }
    }
}

/// Outcome of a batch move.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct MoveResultDto {
    /// Objects that were relocated.
    pub moved: Vec<MovedObjectDto>,
    /// Objects that stayed put.
    pub failed: Vec<KeyFailureDto>,
}

impl From<MoveResult> for MoveResultDto {
    fn from(result: MoveResult) -> Self {
        Self {
            moved: result.moved.into_iter().map(Into::into).collect(),
            failed: result.failed.into_iter().map(Into::into).collect(),
        }
    }
}

/// Measured usage for one scope.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct UsageScopeDto {
    /// What was measured.
    pub scope: String,
    /// Total size in bytes.
    #[ts(type = "number")]
    pub total_size: u64,
    /// Objects counted.
    #[ts(type = "number")]
    pub object_count: u64,
}

impl From<UsageScope> for UsageScopeDto {
    fn from(scope: UsageScope) -> Self {
        Self {
            scope: scope.scope,
            total_size: scope.total_size,
            object_count: scope.object_count,
        }
    }
}

/// The non-secret half of a session, safe to hand the browser.
///
/// The endpoint and addressing style are included because the client builds
/// direct download URLs from them, exactly as the Next.js page did. Neither key
/// is ever part of this shape.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct SessionDto {
    /// Whether a usable connection is stored.
    pub connected: bool,
    /// Endpoint of the active connection.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub endpoint: Option<String>,
    /// Region of the active connection.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub region: Option<String>,
    /// Whether the active connection uses path-style addressing.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub force_path_style: Option<bool>,
    /// Whether the active connection skips TLS verification.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub skip_tls_verification: Option<bool>,
    /// Access key identifier with all but its leading characters masked.
    ///
    /// Masked here rather than in the browser so the full identifier never
    /// leaves the server, even though it is the less sensitive half of the pair.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub access_key_id_masked: Option<String>,
    /// When the session was established, as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub created_at: Option<String>,
    /// When the session was last used, as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_used_at: Option<String>,
    /// Endpoint the connection form prefills.
    pub default_endpoint: String,
}

/// A candidate connection submitted by the connection form.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct ConnectionRequest {
    /// Base URL of the endpoint.
    pub endpoint: String,
    /// Access key identifier.
    pub access_key_id: String,
    /// Secret access key.
    pub secret_access_key: String,
    /// Signing region; defaults to `us-east-1` when omitted.
    #[serde(default)]
    #[ts(optional)]
    pub region: Option<String>,
    /// Path-style addressing; defaults to enabled.
    #[serde(default)]
    #[ts(optional)]
    pub force_path_style: Option<bool>,
    /// Skip TLS verification; defaults to disabled.
    #[serde(default)]
    #[ts(optional)]
    pub skip_tls_verification: Option<bool>,
}

/// Masks all but the leading characters of an access key identifier.
///
/// Mirrors the masking the settings page applied when it still rendered on the
/// server, so the displayed value is unchanged.
#[must_use]
pub fn mask_key_id(value: &str) -> String {
    let characters: Vec<char> = value.chars().collect();
    if characters.len() <= 4 {
        return "\u{2022}\u{2022}\u{2022}\u{2022}".to_owned();
    }
    let visible: String = characters[..4].iter().collect();
    let hidden = (characters.len() - 4).min(12);
    format!("{visible}{}", "\u{2022}".repeat(hidden))
}

/// Region assumed when the form leaves it blank, matching the Zod schema.
const DEFAULT_REGION: &str = "us-east-1";

impl ConnectionRequest {
    /// Validates the candidate and converts it into a domain connection.
    ///
    /// # Errors
    ///
    /// Returns one message per offending field, keyed by the field name the form
    /// uses, so the existing form can render them where it always has.
    pub fn validate(self) -> Result<S3Connection, Vec<(String, String)>> {
        let mut errors = Vec::new();

        let endpoint = self.endpoint.trim().to_owned();
        if url::Url::parse(&endpoint).is_err() {
            errors.push((
                "endpoint".to_owned(),
                "Enter a valid URL, e.g. https://host".to_owned(),
            ));
        }

        let access_key_id = self.access_key_id.trim().to_owned();
        if access_key_id.is_empty() {
            errors.push((
                "accessKeyId".to_owned(),
                "Access Key ID is required".to_owned(),
            ));
        }

        // Deliberately not trimmed: a secret may legitimately begin or end with
        // whitespace, and silently altering it would fail the signature with a
        // misleading "invalid credential".
        if self.secret_access_key.is_empty() {
            errors.push((
                "secretAccessKey".to_owned(),
                "Secret Access Key is required".to_owned(),
            ));
        }

        if !errors.is_empty() {
            return Err(errors);
        }

        let region = self
            .region
            .map(|region| region.trim().to_owned())
            .filter(|region| !region.is_empty())
            .unwrap_or_else(|| DEFAULT_REGION.to_owned());

        Ok(S3Connection {
            endpoint,
            access_key_id,
            secret_access_key: self.secret_access_key,
            region,
            force_path_style: self.force_path_style.unwrap_or(true),
            skip_tls_verification: self.skip_tls_verification.unwrap_or(false),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> ConnectionRequest {
        ConnectionRequest {
            endpoint: "  https://minio.example.com  ".to_owned(),
            access_key_id: "  AKIAEXAMPLE  ".to_owned(),
            secret_access_key: "secret".to_owned(),
            region: None,
            force_path_style: None,
            skip_tls_verification: None,
        }
    }

    #[test]
    fn defaults_match_the_zod_schema() {
        let connection = request().validate().unwrap();
        assert_eq!(connection.region, "us-east-1");
        assert!(connection.force_path_style);
        assert!(!connection.skip_tls_verification);
    }

    #[test]
    fn endpoint_and_key_id_are_trimmed() {
        let connection = request().validate().unwrap();
        assert_eq!(connection.endpoint, "https://minio.example.com");
        assert_eq!(connection.access_key_id, "AKIAEXAMPLE");
    }

    #[test]
    fn a_secret_keeps_its_surrounding_whitespace() {
        let connection = ConnectionRequest {
            secret_access_key: "  padded  ".to_owned(),
            ..request()
        }
        .validate()
        .unwrap();
        assert_eq!(connection.secret_access_key, "  padded  ");
    }

    #[test]
    fn a_malformed_endpoint_is_reported_against_its_field() {
        let errors = ConnectionRequest {
            endpoint: "not a url".to_owned(),
            ..request()
        }
        .validate()
        .unwrap_err();
        assert_eq!(errors[0].0, "endpoint");
    }

    #[test]
    fn every_missing_field_is_reported_at_once() {
        let errors = ConnectionRequest {
            endpoint: String::new(),
            access_key_id: "   ".to_owned(),
            secret_access_key: String::new(),
            ..request()
        }
        .validate()
        .unwrap_err();

        let fields: Vec<_> = errors.iter().map(|(field, _)| field.as_str()).collect();
        assert_eq!(fields, ["endpoint", "accessKeyId", "secretAccessKey"]);
    }

    #[test]
    fn a_short_key_is_masked_entirely() {
        assert_eq!(mask_key_id("ab"), "\u{2022}\u{2022}\u{2022}\u{2022}");
        assert_eq!(mask_key_id("abcd"), "\u{2022}\u{2022}\u{2022}\u{2022}");
    }

    #[test]
    fn a_long_key_keeps_only_its_first_four_characters() {
        let masked = mask_key_id("AKIAIOSFODNN7EXAMPLE");
        assert!(masked.starts_with("AKIA"));
        assert!(!masked.contains("EXAMPLE"));
        assert_eq!(masked.chars().filter(|c| *c == '\u{2022}').count(), 12);
    }

    #[test]
    fn a_blank_region_falls_back_to_the_default() {
        let connection = ConnectionRequest {
            region: Some("   ".to_owned()),
            ..request()
        }
        .validate()
        .unwrap();
        assert_eq!(connection.region, "us-east-1");
    }
}
