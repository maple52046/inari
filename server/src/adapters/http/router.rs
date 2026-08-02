//! Router assembly and the middleware stack shared by every route.

use axum::Router;
use axum::http::{HeaderValue, header};
use axum::routing::get;
use tower::ServiceBuilder;
use tower_http::ServiceBuilderExt;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use super::handlers::{buckets, capacity, cleanup, health, objects, session, spa};
use super::origin_guard::{self, AllowedOrigin};
use super::state::AppState;

/// Builds the application router.
///
/// Probes stay at the root while everything else is mounted under
/// [`Config::base_path`](crate::infrastructure::config::Config::base_path), so a
/// deployment behind a path prefix does not have to rewrite its health checks.
pub fn build(state: AppState) -> Router {
    let base_path = state.config().base_path.clone();
    let body_limit = state.config().request_body_limit;
    let allowed_origin = AllowedOrigin(state.config().dev_origin.clone());

    let api = Router::new()
        .merge(session::routes())
        .merge(buckets::routes())
        .merge(objects::routes())
        .merge(cleanup::routes())
        .merge(capacity::routes())
        .layer(axum::middleware::from_fn_with_state(
            allowed_origin,
            origin_guard::enforce,
        ));

    // Anything that is not the API is either a bundled asset or a client route,
    // and the SPA handler tells those apart.
    let inner = Router::new()
        .nest("/api", api)
        .route("/", get(spa::serve))
        .fallback(get(spa::serve));

    let mounted = if base_path.is_empty() {
        inner
    } else {
        Router::new()
            .nest(&base_path, inner)
            // `nest` routes the mount point and everything below it, but not
            // its trailing-slash form -- which is exactly the canonical URL the
            // injected `<base href>` points at, so it is routed by hand.
            .route(&format!("{base_path}/"), get(spa::serve))
    };

    // A Content-Security-Policy is deliberately not set here: it has to differ
    // between the embedded bundle and the Vite dev server, so it is attached
    // where the SPA is served rather than globally.
    mounted.merge(health::routes()).with_state(state).layer(
        ServiceBuilder::new()
            .set_x_request_id(tower_http::request_id::MakeRequestUuid)
            .layer(TraceLayer::new_for_http())
            .propagate_x_request_id()
            .layer(RequestBodyLimitLayer::new(body_limit))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::REFERRER_POLICY,
                HeaderValue::from_static("same-origin"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            )),
    )
}
