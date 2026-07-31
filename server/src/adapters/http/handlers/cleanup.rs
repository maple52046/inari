//! Cleanup planner endpoints.

use axum::routing::post;
use axum::{Json, Router};

use crate::adapters::http::dto_cleanup::{
    CleanupBucketDeleteResultDto, CleanupDeleteTargetDto, CleanupPlanDto, CleanupScanRequest,
};
use crate::adapters::http::errors::ApiError;
use crate::adapters::http::extract::ActiveSession;
use crate::adapters::http::state::AppState;
use crate::application::delete_cleanup::delete_cleanup_candidates;
use crate::application::scan_cleanup::scan_cleanup;

/// Builds the cleanup routes.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/cleanup/scan", post(scan))
        .route("/cleanup/delete", post(delete))
}

/// Builds a ranked cleanup plan.
async fn scan(
    session: ActiveSession,
    Json(request): Json<CleanupScanRequest>,
) -> Result<Json<CleanupPlanDto>, ApiError> {
    let (scope, options) = request.split().map_err(ApiError::bad_request)?;
    let plan = scan_cleanup(session.storage.as_ref(), &scope, &options).await?;
    Ok(Json(plan.into()))
}

/// Deletes the selected candidates.
async fn delete(
    session: ActiveSession,
    Json(targets): Json<Vec<CleanupDeleteTargetDto>>,
) -> Result<Json<Vec<CleanupBucketDeleteResultDto>>, ApiError> {
    let targets: Vec<_> = targets.into_iter().map(Into::into).collect();
    let results = delete_cleanup_candidates(session.storage.as_ref(), &targets).await?;
    Ok(Json(results.into_iter().map(Into::into).collect()))
}
