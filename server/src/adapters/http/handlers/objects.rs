//! Object listing, mutation, and download-URL endpoints.

use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::adapters::http::dto::{
    BINDINGS, DeleteResultDto, MoveResultDto, ObjectListPageDto, UsageScopeDto,
};
use crate::adapters::http::dto_cleanup::{BucketUsageDto, PrefixUsageDto};
use crate::adapters::http::errors::ApiError;
use crate::adapters::http::extract::ActiveSession;
use crate::adapters::http::state::AppState;
use crate::application::delete_objects::delete_objects;
use crate::application::get_download_url::get_download_url;
use crate::application::list_objects::list_objects;
use crate::application::move_objects::{MoveEntry, MoveObjectsInput, move_objects};
use crate::application::scan_prefix_usage::scan_prefix_usage;
use crate::application::scan_usage::scan_bucket_usage;

/// Builds the object routes.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/buckets/{bucket}/objects", get(list))
        .route("/buckets/{bucket}/objects/delete", post(delete))
        .route("/buckets/{bucket}/objects/presign", post(presign))
        .route("/buckets/{bucket}/usage", post(bucket_usage))
        .route("/buckets/{bucket}/prefix-usage", post(prefix_usage))
        // Not nested under a bucket, because a move can cross buckets and the
        // path would then name only half of the operation.
        .route("/objects/move", post(relocate))
}

/// Query parameters selecting which slice of a bucket to list.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    #[serde(default)]
    prefix: Option<String>,
    #[serde(default)]
    continuation_token: Option<String>,
}

/// Lists one page of a bucket or prefix.
async fn list(
    session: ActiveSession,
    Path(bucket): Path<String>,
    Query(query): Query<ListQuery>,
) -> Result<Json<ObjectListPageDto>, ApiError> {
    let page = list_objects(
        session.storage.as_ref(),
        &bucket,
        query.prefix.as_deref().unwrap_or_default(),
        query.continuation_token,
    )
    .await?;
    Ok(Json(page.into()))
}

/// Keys a delete request should remove.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct DeleteObjectsRequest {
    /// Full object keys.
    pub keys: Vec<String>,
}

/// Deletes the given keys from one bucket.
async fn delete(
    session: ActiveSession,
    State(state): State<AppState>,
    Path(bucket): Path<String>,
    Json(request): Json<DeleteObjectsRequest>,
) -> Result<Json<DeleteResultDto>, ApiError> {
    let result = delete_objects(
        session.storage.as_ref(),
        state.capacity_index(),
        &bucket,
        &request.keys,
    )
    .await?;
    Ok(Json(result.into()))
}

/// An object to sign a download URL for.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct PresignRequest {
    /// Full object key.
    pub key: String,
    /// Lifetime in seconds; the server clamps it.
    #[serde(default)]
    #[ts(optional, type = "number")]
    pub expires_in: Option<u64>,
}

/// A signed download URL.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct PresignedUrlDto {
    /// The signed URL.
    pub url: String,
}

/// Signs a time-limited download URL for one object.
async fn presign(
    session: ActiveSession,
    Path(bucket): Path<String>,
    Json(request): Json<PresignRequest>,
) -> Result<Json<PresignedUrlDto>, ApiError> {
    let url = get_download_url(
        session.storage.as_ref(),
        &bucket,
        &request.key,
        request.expires_in,
    )
    .await?;
    Ok(Json(PresignedUrlDto { url }))
}

/// Measures one whole bucket with the caller's own credentials.
///
/// One bucket per request, matching how the usage panel drives its progress
/// display: the client walks the bucket list and reports each result as it
/// lands, rather than waiting on a single long call.
///
/// This is the path a deployment without a shared index uses. With one, the
/// client asks the index to refresh instead, because a figure everyone reads
/// has to be measured by the scanner rather than by whichever session happened
/// to press the button and may see only part of the bucket.
async fn bucket_usage(
    session: ActiveSession,
    Path(bucket): Path<String>,
) -> Result<Json<BucketUsageDto>, ApiError> {
    let scope = scan_bucket_usage(session.storage.as_ref(), &bucket).await?;
    Ok(Json(BucketUsageDto {
        scope: UsageScopeDto::from(scope),
        scanned_at: time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .ok(),
    }))
}

/// Which location to break down.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrefixQuery {
    #[serde(default)]
    prefix: Option<String>,
}

/// Measures a location, one entry per immediate child.
async fn prefix_usage(
    session: ActiveSession,
    Path(bucket): Path<String>,
    Query(query): Query<PrefixQuery>,
) -> Result<Json<PrefixUsageDto>, ApiError> {
    let usage = scan_prefix_usage(
        session.storage.as_ref(),
        &bucket,
        query.prefix.as_deref().unwrap_or_default(),
    )
    .await?;
    Ok(Json(usage.into()))
}

/// One object to relocate.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct MoveEntryDto {
    /// Current key.
    pub key: String,
    /// Key the object should end up at.
    pub destination_key: String,
}

/// A batch move request.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct MoveObjectsRequest {
    /// Bucket the objects are read from.
    pub source_bucket: String,
    /// Bucket the objects are written to.
    pub destination_bucket: String,
    /// The objects to relocate.
    pub entries: Vec<MoveEntryDto>,
}

/// Moves objects, copying each one before deleting the source that landed.
async fn relocate(
    session: ActiveSession,
    State(state): State<AppState>,
    Json(request): Json<MoveObjectsRequest>,
) -> Result<Json<MoveResultDto>, ApiError> {
    let result = move_objects(
        session.storage.as_ref(),
        state.capacity_index(),
        &MoveObjectsInput {
            source_bucket: request.source_bucket,
            destination_bucket: request.destination_bucket,
            entries: request
                .entries
                .into_iter()
                .map(|entry| MoveEntry {
                    key: entry.key,
                    destination_key: entry.destination_key,
                })
                .collect(),
        },
    )
    .await?;
    Ok(Json(result.into()))
}
