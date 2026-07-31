//! Bucket-level endpoints.

use axum::routing::get;
use axum::{Json, Router};

use crate::adapters::http::dto::BucketSummaryDto;
use crate::adapters::http::errors::ApiError;
use crate::adapters::http::extract::ActiveSession;
use crate::adapters::http::state::AppState;
use crate::application::list_buckets::list_buckets;

/// Builds the bucket routes.
pub fn routes() -> Router<AppState> {
    Router::new().route("/buckets", get(list))
}

/// Lists every bucket the session's credentials can see.
async fn list(session: ActiveSession) -> Result<Json<Vec<BucketSummaryDto>>, ApiError> {
    let buckets = list_buckets(session.storage.as_ref()).await?;
    Ok(Json(buckets.into_iter().map(Into::into).collect()))
}
