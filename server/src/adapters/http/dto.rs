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

use crate::infrastructure::config::ConnectionDefaults;

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
    /// The storage target the connection form starts from, or is pinned to.
    pub connection: ConnectionDefaultsDto,
    /// Whether this deployment maintains a shared capacity index.
    ///
    /// Carried on the session because the client already fetches it on every
    /// page load, so a deployment with the index off pays no extra request to
    /// discover that its per-tab cache is still the only source of figures.
    pub capacity_index: bool,
}

/// What the connection form should offer, and whether it may be changed.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct ConnectionDefaultsDto {
    /// Base URL of the endpoint.
    pub endpoint: String,
    /// Signing region.
    pub region: String,
    /// Path-style addressing.
    pub force_path_style: bool,
    /// Whether TLS certificate verification is skipped.
    pub skip_tls_verification: bool,
    /// Whether the values above are the only ones accepted.
    ///
    /// The form collapses to credentials alone when this is set. That is
    /// presentation only: the server refuses a different target either way.
    pub locked: bool,
}

impl From<&ConnectionDefaults> for ConnectionDefaultsDto {
    fn from(defaults: &ConnectionDefaults) -> Self {
        Self {
            endpoint: defaults.endpoint.clone(),
            region: defaults.region.clone(),
            force_path_style: defaults.force_path_style,
            skip_tls_verification: defaults.skip_tls_verification,
            locked: defaults.locked,
        }
    }
}

/// A candidate connection submitted by the connection form.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct ConnectionRequest {
    /// Base URL of the endpoint.
    ///
    /// Optional because a deployment that pins the endpoint hides the field, so
    /// the form submits nothing for it. Absent still fails validation when the
    /// endpoint is not pinned.
    #[serde(default)]
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

/// Rejects a submitted value that contradicts a pinned one.
///
/// Absent is the normal case once the form hides the field. An explicit value
/// that matches is accepted too, so a client that echoes back what it was told
/// still works.
fn pinned<T: PartialEq>(
    submitted: Option<T>,
    pinned: T,
    field: &str,
    errors: &mut Vec<(String, String)>,
) -> T {
    match submitted {
        Some(value) if value != pinned => {
            errors.push((
                field.to_owned(),
                "This deployment fixes the connection target, which cannot be changed".to_owned(),
            ));
            pinned
        }
        _ => pinned,
    }
}

impl ConnectionRequest {
    /// Validates the candidate and converts it into a domain connection.
    ///
    /// `locked_endpoint` pins the target when the deployment serves a single
    /// backend, so the user supplies only credentials.
    ///
    /// Enforced here rather than by hiding the form fields, because hidden
    /// fields stop nobody: without a server-side check the target is still
    /// whatever the request body says, and the service remains able to issue
    /// requests anywhere it can reach on the operator's behalf.
    ///
    /// # Errors
    ///
    /// Returns one message per offending field, keyed by the field name the form
    /// uses, so the existing form can render them where it always has.
    pub fn validate(
        self,
        defaults: &ConnectionDefaults,
    ) -> Result<S3Connection, Vec<(String, String)>> {
        let mut errors = Vec::new();

        let submitted_endpoint = self.endpoint.trim();
        let submitted_region = self
            .region
            .map(|region| region.trim().to_owned())
            .filter(|region| !region.is_empty());

        let (endpoint, region, force_path_style, skip_tls_verification) = if defaults.locked {
            (
                pinned(
                    Some(submitted_endpoint)
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned),
                    defaults.endpoint.clone(),
                    "endpoint",
                    &mut errors,
                ),
                pinned(
                    submitted_region,
                    defaults.region.clone(),
                    "region",
                    &mut errors,
                ),
                pinned(
                    self.force_path_style,
                    defaults.force_path_style,
                    "forcePathStyle",
                    &mut errors,
                ),
                pinned(
                    self.skip_tls_verification,
                    defaults.skip_tls_verification,
                    "skipTlsVerification",
                    &mut errors,
                ),
            )
        } else {
            if url::Url::parse(submitted_endpoint).is_err() {
                errors.push((
                    "endpoint".to_owned(),
                    "Enter a valid URL, e.g. https://host".to_owned(),
                ));
            }
            (
                submitted_endpoint.to_owned(),
                submitted_region.unwrap_or_else(|| defaults.region.clone()),
                self.force_path_style.unwrap_or(defaults.force_path_style),
                self.skip_tls_verification
                    .unwrap_or(defaults.skip_tls_verification),
            )
        };

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

        Ok(S3Connection {
            endpoint,
            access_key_id,
            secret_access_key: self.secret_access_key,
            region,
            force_path_style,
            skip_tls_verification,
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

    const LOCKED: &str = "https://minio.internal";

    fn flexible() -> ConnectionDefaults {
        ConnectionDefaults {
            endpoint: "https://s3.example.com".to_owned(),
            region: "us-east-1".to_owned(),
            force_path_style: true,
            skip_tls_verification: false,
            locked: false,
        }
    }

    fn pinned_to_minio() -> ConnectionDefaults {
        ConnectionDefaults {
            endpoint: LOCKED.to_owned(),
            region: "eu-west-2".to_owned(),
            force_path_style: true,
            skip_tls_verification: false,
            locked: true,
        }
    }

    #[test]
    fn a_locked_deployment_supplies_the_whole_target() {
        let connection = ConnectionRequest {
            endpoint: String::new(),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap();

        assert_eq!(connection.endpoint, LOCKED);
        assert_eq!(connection.region, "eu-west-2");
        assert!(connection.force_path_style);
        assert!(!connection.skip_tls_verification);
    }

    #[test]
    fn a_locked_deployment_refuses_a_substituted_region() {
        let errors = ConnectionRequest {
            endpoint: String::new(),
            region: Some("elsewhere".to_owned()),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap_err();
        assert_eq!(errors[0].0, "region");
    }

    #[test]
    fn a_locked_deployment_refuses_disabling_tls_verification() {
        // The operator decided verification is on. A crafted request must not
        // be able to turn it off for its own session.
        let errors = ConnectionRequest {
            endpoint: String::new(),
            skip_tls_verification: Some(true),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap_err();
        assert_eq!(errors[0].0, "skipTlsVerification");
    }

    #[test]
    fn a_locked_deployment_refuses_a_substituted_addressing_style() {
        let errors = ConnectionRequest {
            endpoint: String::new(),
            force_path_style: Some(false),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap_err();
        assert_eq!(errors[0].0, "forcePathStyle");
    }

    #[test]
    fn an_unlocked_deployment_takes_the_operator_values_as_mere_defaults() {
        let defaults = ConnectionDefaults {
            region: "ap-northeast-1".to_owned(),
            force_path_style: false,
            ..flexible()
        };

        let untouched = request().validate(&defaults).unwrap();
        assert_eq!(untouched.region, "ap-northeast-1");
        assert!(!untouched.force_path_style);

        let overridden = ConnectionRequest {
            region: Some("us-west-1".to_owned()),
            force_path_style: Some(true),
            ..request()
        }
        .validate(&defaults)
        .unwrap();
        assert_eq!(overridden.region, "us-west-1");
        assert!(overridden.force_path_style);
    }

    #[test]
    fn a_locked_deployment_ignores_an_omitted_endpoint() {
        let connection = ConnectionRequest {
            endpoint: String::new(),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap();
        assert_eq!(connection.endpoint, LOCKED);
    }

    #[test]
    fn a_locked_deployment_accepts_its_own_endpoint_echoed_back() {
        let connection = ConnectionRequest {
            endpoint: LOCKED.to_owned(),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap();
        assert_eq!(connection.endpoint, LOCKED);
    }

    #[test]
    fn a_locked_deployment_refuses_a_substituted_endpoint() {
        // The form hides the field, so this is what a crafted request looks
        // like. Rejecting it server-side is the whole point of the setting: a
        // hidden input would not stop anyone.
        let errors = ConnectionRequest {
            endpoint: "http://169.254.169.254/".to_owned(),
            ..request()
        }
        .validate(&pinned_to_minio())
        .unwrap_err();

        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].0, "endpoint");
    }

    #[test]
    fn an_unlocked_deployment_still_takes_any_valid_endpoint() {
        let connection = ConnectionRequest {
            endpoint: "https://other.example.com".to_owned(),
            ..request()
        }
        .validate(&flexible())
        .unwrap();
        assert_eq!(connection.endpoint, "https://other.example.com");
    }

    #[test]
    fn defaults_match_the_zod_schema() {
        let connection = request().validate(&flexible()).unwrap();
        assert_eq!(connection.region, "us-east-1");
        assert!(connection.force_path_style);
        assert!(!connection.skip_tls_verification);
    }

    #[test]
    fn endpoint_and_key_id_are_trimmed() {
        let connection = request().validate(&flexible()).unwrap();
        assert_eq!(connection.endpoint, "https://minio.example.com");
        assert_eq!(connection.access_key_id, "AKIAEXAMPLE");
    }

    #[test]
    fn a_secret_keeps_its_surrounding_whitespace() {
        let connection = ConnectionRequest {
            secret_access_key: "  padded  ".to_owned(),
            ..request()
        }
        .validate(&flexible())
        .unwrap();
        assert_eq!(connection.secret_access_key, "  padded  ");
    }

    #[test]
    fn a_malformed_endpoint_is_reported_against_its_field() {
        let errors = ConnectionRequest {
            endpoint: "not a url".to_owned(),
            ..request()
        }
        .validate(&flexible())
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
        .validate(&flexible())
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
        .validate(&flexible())
        .unwrap();
        assert_eq!(connection.region, "us-east-1");
    }
}
