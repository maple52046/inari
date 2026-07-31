//! Request extractors.

use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, header};

use super::errors::ApiError;
use super::state::AppState;
use crate::adapters::session::ConnectionSession;
use crate::domain::ports::ObjectStorage;

/// A request carrying a usable session, with storage already bound to it.
///
/// Extracting this is what enforces authentication: a handler that names it
/// cannot run without a session, so the guard cannot be forgotten at a call
/// site the way an explicit check can.
pub struct ActiveSession {
    /// Storage bound to this session's credentials.
    pub storage: Arc<dyn ObjectStorage>,
}

impl FromRequestParts<AppState> for ActiveSession {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let session = read_session(&parts.headers, state)?.ok_or(ApiError::Unauthenticated)?;
        let storage = state.storage_factory().create(&session.connection)?;
        Ok(Self { storage })
    }
}

/// Reads the session cookie without requiring one to be present.
///
/// # Errors
///
/// Returns [`ApiError::Unauthenticated`] when a cookie is present but cannot be
/// opened, which is what a rotated `SESSION_SECRET` looks like.
pub fn read_session(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<Option<ConnectionSession>, ApiError> {
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok());

    state
        .sessions()
        .read(cookie)
        .map_err(|_| ApiError::Unauthenticated)
}
