//! Wire shapes for the shared capacity index.
//!
//! The response carries the freshness judgement rather than the raw timestamps
//! alone, so the browser never decides for itself whether a figure is current.
//! It also anticipates being pushed rather than polled: `scanning` and the
//! progress it implies are part of the payload either way, so switching the
//! transport later changes how it arrives and nothing else.

use serde::Serialize;
use std::time::SystemTime;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use ts_rs::TS;

use crate::application::read_capacity::{CapacityEntry, CapacityView};
use crate::domain::capacity::CapacityScope;

use super::dto::BINDINGS;

/// Renders a timestamp as RFC 3339, dropping one that cannot be represented.
fn to_rfc3339(value: Option<SystemTime>) -> Option<String> {
    let value = value?;
    OffsetDateTime::from(value).format(&Rfc3339).ok()
}

/// One row of a capacity view: a bucket, or a sub-prefix of one location.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CapacityEntryDto {
    /// Name to show: the bucket, or the child prefix with its delimiter.
    pub name: String,
    /// Bucket this row lives in.
    pub bucket: String,
    /// Prefix within the bucket; empty when the row is a whole bucket.
    pub prefix: String,
    /// Combined size beneath the row.
    #[ts(type = "number")]
    pub total_size: u64,
    /// Objects beneath the row.
    #[ts(type = "number")]
    pub object_count: u64,
    /// Whether this row has ever been walked in full.
    ///
    /// A row can be unmeasured while carrying a non-zero size, because a scan
    /// below it propagates upwards. The figure is then a lower bound, so the UI
    /// must not present it as a measurement.
    pub measured: bool,
    /// When the row was last walked in full, as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scanned_at: Option<String>,
    /// Whether the row's figures should be refreshed; always true if unmeasured.
    pub stale: bool,
}

impl From<CapacityEntry> for CapacityEntryDto {
    fn from(entry: CapacityEntry) -> Self {
        Self {
            name: entry.name,
            bucket: entry.scope.bucket_name().to_owned(),
            prefix: entry.scope.prefix_path().to_owned(),
            total_size: entry.total_size,
            object_count: entry.object_count,
            measured: entry.scanned_at.is_some(),
            scanned_at: to_rfc3339(entry.scanned_at),
            stale: entry.stale,
        }
    }
}

/// What the index reports for one location, or for every visible bucket.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CapacityViewDto {
    /// Whether this deployment maintains a shared index at all.
    ///
    /// The client branches on this rather than on its own copy of the
    /// configuration, and falls back to its per-tab cache when it is false.
    pub enabled: bool,
    /// Human label of the location described; empty across all buckets.
    pub scope: String,
    /// Combined size across the view.
    #[ts(type = "number")]
    pub total_size: u64,
    /// Objects across the view.
    #[ts(type = "number")]
    pub object_count: u64,
    /// Whether every part of the view has been walked at least once.
    pub measured: bool,
    /// When the view was last measured in full, as RFC 3339.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scanned_at: Option<String>,
    /// Whether the figures should be refreshed; always true while unmeasured.
    pub stale: bool,
    /// Whether [`CapacityViewDto::entries`] lists every sub-prefix.
    ///
    /// False means the location was measured but the node ceiling stopped it
    /// being broken down further: the total is exact, the breakdown is absent.
    pub subdivided: bool,
    /// Whether a scan covering this view is queued or running.
    pub scanning: bool,
    /// The rows making up the view, largest first.
    pub entries: Vec<CapacityEntryDto>,
}

impl CapacityViewDto {
    /// Builds the response a deployment without an index answers with.
    #[must_use]
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            scope: String::new(),
            total_size: 0,
            object_count: 0,
            measured: false,
            scanned_at: None,
            stale: false,
            subdivided: false,
            scanning: false,
            entries: Vec::new(),
        }
    }

    /// Builds the response from a view the application produced.
    #[must_use]
    pub fn from_view(view: CapacityView, scanning: bool) -> Self {
        Self {
            enabled: true,
            scope: view
                .scope
                .as_ref()
                .map(CapacityScope::label)
                .unwrap_or_default(),
            total_size: view.total_size,
            object_count: view.object_count,
            measured: view.measured,
            scanned_at: to_rfc3339(view.scanned_at),
            stale: view.stale,
            subdivided: view.subdivided,
            scanning,
            entries: view.entries.into_iter().map(Into::into).collect(),
        }
    }
}
