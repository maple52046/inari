//! Liveness and readiness probes.
//!
//! Both are mounted at the root rather than under `BASE_PATH`, so an orchestrator
//! probing the container does not have to know the mount prefix.

use axum::Json;
use axum::routing::get;
use axum::{Router, http::StatusCode};
use serde::Serialize;

/// Probe response body.
#[derive(Debug, Serialize)]
struct Health {
    status: &'static str,
}

/// Builds the probe routes.
pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
}

/// Reports that the process is alive.
///
/// Deliberately does no I/O: a liveness probe that talks to S3 would restart a
/// healthy dashboard whenever the storage backend hiccups.
async fn healthz() -> (StatusCode, Json<Health>) {
    (StatusCode::OK, Json(Health { status: "ok" }))
}

/// Reports that the process can serve traffic.
///
/// Configuration and session key material are validated during start-up, so
/// reaching this handler is itself the proof of readiness. It stays free of
/// bucket listings, which would turn every probe into a paid API call.
async fn readyz() -> (StatusCode, Json<Health>) {
    (StatusCode::OK, Json(Health { status: "ready" }))
}
