//! Connecting, testing a candidate connection, and disconnecting.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::adapters::http::dto::{ConnectionRequest, SessionDto, mask_key_id};
use crate::adapters::http::errors::ApiError;
use crate::adapters::http::extract::read_session;
use crate::adapters::http::state::AppState;
use crate::adapters::session::ConnectionSession;
use crate::application::connect_storage::test_storage_connection;

/// Builds the session routes.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/session", get(current).post(connect).delete(disconnect))
        .route("/session/test", axum::routing::post(test))
}

/// Reports whether a usable connection is stored.
///
/// Answers `200` either way rather than `401` when absent: this is the route
/// guard's first call on every page load, and a failure status would make an
/// ordinary logged-out visit look like an error in the browser console.
async fn current(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionDto>, ApiError> {
    let default_endpoint = state.config().default_endpoint.clone();
    // A cookie that cannot be opened, which is what a rotated secret looks
    // like, is treated as "not connected" so the user is simply asked to
    // reconnect instead of meeting an error page.
    let session = read_session(&headers, &state).unwrap_or(None);

    Ok(Json(match session {
        Some(session) => SessionDto {
            connected: true,
            endpoint: Some(session.connection.endpoint),
            region: Some(session.connection.region),
            force_path_style: Some(session.connection.force_path_style),
            skip_tls_verification: Some(session.connection.skip_tls_verification),
            access_key_id_masked: Some(mask_key_id(&session.connection.access_key_id)),
            created_at: session.created_at.format(&Rfc3339).ok(),
            last_used_at: session.last_used_at.format(&Rfc3339).ok(),
            default_endpoint,
        },
        None => SessionDto {
            connected: false,
            endpoint: None,
            region: None,
            force_path_style: None,
            skip_tls_verification: None,
            access_key_id_masked: None,
            created_at: None,
            last_used_at: None,
            default_endpoint,
        },
    }))
}

/// Validates a candidate connection and stores it in the sealed cookie.
///
/// The connection is only persisted after the backend accepts it, so a stored
/// session always represents credentials that worked at least once.
async fn connect(
    State(state): State<AppState>,
    Json(request): Json<ConnectionRequest>,
) -> Result<Response, ApiError> {
    let connection = request.validate().map_err(ApiError::Validation)?;
    test_storage_connection(state.storage_factory(), &connection).await?;

    let now = OffsetDateTime::now_utc();
    let cookie = state
        .sessions()
        .write(&ConnectionSession {
            connection,
            created_at: now,
            last_used_at: now,
        })
        .map_err(|error| ApiError::internal(error.to_string()))?;

    let mut response = (StatusCode::NO_CONTENT, ()).into_response();
    insert_cookie(&mut response, &cookie)?;
    Ok(response)
}

/// Validates a candidate connection without storing it.
async fn test(
    State(state): State<AppState>,
    Json(request): Json<ConnectionRequest>,
) -> Result<StatusCode, ApiError> {
    let connection = request.validate().map_err(ApiError::Validation)?;
    test_storage_connection(state.storage_factory(), &connection).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Drops the stored connection.
async fn disconnect(State(state): State<AppState>) -> Result<Response, ApiError> {
    let mut response = (StatusCode::NO_CONTENT, ()).into_response();
    insert_cookie(&mut response, &state.sessions().clear())?;
    Ok(response)
}

/// Attaches a `Set-Cookie` header, and forbids caching the response that
/// carries it.
fn insert_cookie(response: &mut Response, cookie: &str) -> Result<(), ApiError> {
    let value = cookie
        .parse()
        .map_err(|_| ApiError::internal("the session cookie is not a valid header value"))?;
    response.headers_mut().insert(header::SET_COOKIE, value);
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    Ok(())
}
