//! The shared capacity index's read and refresh endpoints.

use axum::extract::{Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::adapters::capacity::CapacityScanner;
use crate::adapters::http::dto::BINDINGS;
use crate::adapters::http::dto_capacity::CapacityViewDto;
use crate::adapters::http::errors::ApiError;
use crate::adapters::http::extract::ActiveSession;
use crate::adapters::http::state::AppState;
use crate::application::read_capacity::{
    CapacityView, read_bucket_capacity, read_location_capacity,
};
use crate::application::scan_queue::ScanPriority;
use crate::domain::capacity::CapacityScope;

/// Builds the capacity routes.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/capacity", get(view))
        .route("/capacity/scan", post(refresh))
}

/// Which location to report on; absent means every visible bucket.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapacityQuery {
    #[serde(default)]
    bucket: Option<String>,
    #[serde(default)]
    prefix: Option<String>,
}

/// Reports what the index holds, filtered to what the caller can see.
///
/// The visible buckets are read with the caller's own credentials rather than
/// taken from the request or from the index, which is what stops a shared index
/// built by a read-all scanner key from reporting a bucket the caller has no
/// access to. Filtering in the component instead would be no boundary at all:
/// the browser can call this endpoint directly.
///
/// A stale location is served from the index immediately and queued for a
/// refresh behind the response. The read never waits for a scan, which is what
/// keeps a short freshness threshold from turning every page load into a walk
/// of the backend.
async fn view(
    session: ActiveSession,
    State(state): State<AppState>,
    Query(query): Query<CapacityQuery>,
) -> Result<Json<CapacityViewDto>, ApiError> {
    let index = state.capacity_index();
    let Some(settings) = state.config().capacity.settings() else {
        return Ok(Json(CapacityViewDto::disabled()));
    };

    let (view, scope) = match query.bucket.filter(|name| !name.is_empty()) {
        Some(bucket) => {
            session.require_bucket(&bucket).await?;
            let scope = CapacityScope::prefix(bucket, query.prefix.as_deref().unwrap_or_default());
            if settings.verify_prefix_access && !scope.is_bucket_root() {
                session.require_prefix(&scope).await?;
            }
            let view = read_location_capacity(index, state.clock(), settings.ttl, &scope);
            (view, Some(scope))
        }
        None => {
            let visible = session.visible_buckets().await?;
            let view = read_bucket_capacity(index, state.clock(), settings.ttl, &visible);
            (view, None)
        }
    };

    let scanning = match state.capacity_scanner() {
        Some(scanner) => {
            request_refresh_of_stale(scanner, &view, scope.as_ref());
            is_scanning(scanner, &view, scope.as_ref())
        }
        None => false,
    };

    Ok(Json(CapacityViewDto::from_view(view, scanning)))
}

/// Queues a refresh for whatever in the view has aged past the threshold.
///
/// A location view queues only the location itself: walking it measures every
/// child, so queueing the children as well would ask for the same keys twice.
fn request_refresh_of_stale(
    scanner: &CapacityScanner,
    view: &CapacityView,
    scope: Option<&CapacityScope>,
) {
    match scope {
        Some(scope) => {
            if view.stale {
                scanner.request(scope.clone(), ScanPriority::for_scope(scope));
            }
        }
        None => {
            for entry in view.entries.iter().filter(|entry| entry.stale) {
                scanner.request(entry.scope.clone(), ScanPriority::for_scope(&entry.scope));
            }
        }
    }
}

/// Whether anything the view covers is queued or being scanned.
fn is_scanning(
    scanner: &CapacityScanner,
    view: &CapacityView,
    scope: Option<&CapacityScope>,
) -> bool {
    match scope {
        Some(scope) => scanner.is_scanning(scope),
        None => view
            .entries
            .iter()
            .any(|entry| scanner.is_scanning(&entry.scope)),
    }
}

/// What a manual refresh should cover; absent means every visible bucket.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CapacityScanRequest {
    /// Restrict to one bucket; omit to refresh everything the caller can see.
    #[serde(default)]
    #[ts(optional)]
    pub bucket: Option<String>,
    /// Restrict to a prefix within that bucket.
    #[serde(default)]
    #[ts(optional)]
    pub prefix: Option<String>,
}

/// How much work a manual refresh asked for.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = BINDINGS)]
pub struct CapacityScanAcceptedDto {
    /// Locations now queued or already being scanned.
    #[ts(type = "number")]
    pub queued: usize,
}

/// Queues a refresh and returns at once.
///
/// Returning before the walk finishes is what keeps the button usable on a
/// backend of unknown size: the client watches the figures change rather than
/// holding a request open for however long the scan takes.
async fn refresh(
    session: ActiveSession,
    State(state): State<AppState>,
    Json(request): Json<CapacityScanRequest>,
) -> Result<Json<CapacityScanAcceptedDto>, ApiError> {
    let (Some(scanner), Some(settings)) =
        (state.capacity_scanner(), state.config().capacity.settings())
    else {
        return Err(ApiError::bad_request(
            "This deployment does not maintain a shared usage index",
        ));
    };

    let scopes = match request.bucket.filter(|name| !name.is_empty()) {
        Some(bucket) => {
            session.require_bucket(&bucket).await?;
            let scope =
                CapacityScope::prefix(bucket, request.prefix.as_deref().unwrap_or_default());
            if settings.verify_prefix_access && !scope.is_bucket_root() {
                session.require_prefix(&scope).await?;
            }
            vec![scope]
        }
        None => session
            .visible_buckets()
            .await?
            .into_iter()
            .map(CapacityScope::bucket)
            .collect(),
    };

    let queued = scopes.len();
    for scope in scopes {
        let priority = ScanPriority::for_scope(&scope);
        scanner.request(scope, priority);
    }
    Ok(Json(CapacityScanAcceptedDto { queued }))
}
