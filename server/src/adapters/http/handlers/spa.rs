//! Serving the single-page application.

use axum::extract::State;
use axum::http::{HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

use crate::adapters::http::state::AppState;
use crate::infrastructure::assets::Spa;

/// How long a fingerprinted asset may be cached.
const IMMUTABLE_CACHE: &str = "public, max-age=31536000, immutable";

/// Serves a bundled asset, falling back to the application document.
///
/// The fallback is what makes client-side routing survive a refresh or a shared
/// link: `/buckets/photos` is a route the browser knows and the server does
/// not, so anything unrecognised gets the document and lets the router decide.
pub async fn serve(State(state): State<AppState>, uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');

    if !path.is_empty()
        && let Some(asset) = Spa::asset(path)
    {
        let cache = if asset.immutable {
            IMMUTABLE_CACHE
        } else {
            "no-cache"
        };
        return (
            [
                (header::CONTENT_TYPE, asset.content_type.as_str()),
                (header::CACHE_CONTROL, cache),
            ],
            asset.bytes,
        )
            .into_response();
    }

    index(&state)
}

/// Serves the application document.
fn index(state: &AppState) -> Response {
    let Some(spa) = state.spa() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "The web bundle was not built into this binary.",
        )
            .into_response();
    };

    (
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            ),
            // The document names the current asset hashes, so caching it would
            // pin a browser to a previous release's JavaScript.
            (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        ],
        spa.index_html().into_owned(),
    )
        .into_response()
}
