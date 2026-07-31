//! Rejects cross-site mutating requests.
//!
//! `SameSite=Lax` on the session cookie already stops a cross-site form post
//! from carrying credentials. This is defence in depth for the case where that
//! attribute is weakened or a browser does not honour it, and it replaces the
//! `SERVER_ACTIONS_ALLOWED_ORIGINS` allowlist the Next.js version relied on.

use axum::body::Body;
use axum::extract::Request;
use axum::http::{Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

/// Origin permitted in addition to the request's own host.
///
/// Only ever set in development, where the SPA is served by the Vite dev server
/// on a different port than the API.
#[derive(Debug, Clone, Default)]
pub struct AllowedOrigin(pub Option<String>);

/// Blocks a mutating request whose `Origin` is neither our own host nor the
/// configured development origin.
///
/// A request without an `Origin` header is allowed: non-browser clients omit
/// it, and browsers always send it on the cross-site requests this guards
/// against.
pub async fn enforce(
    axum::extract::State(allowed): axum::extract::State<AllowedOrigin>,
    request: Request,
    next: Next,
) -> Response {
    if is_safe(request.method()) {
        return next.run(request).await;
    }

    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());

    let Some(origin) = origin else {
        return next.run(request).await;
    };

    if matches_self(origin, &request) || allowed.0.as_deref() == Some(origin) {
        return next.run(request).await;
    }

    tracing::warn!(origin, "rejected a cross-origin mutating request");
    (
        StatusCode::FORBIDDEN,
        Body::from(r#"{"code":"cross_origin","message":"Request origin is not allowed"}"#),
    )
        .into_response()
}

/// Whether the method only reads.
fn is_safe(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

/// Whether the origin's authority is the one the request was addressed to.
fn matches_self(origin: &str, request: &Request) -> bool {
    let Some(host) = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    origin
        .split_once("://")
        .is_some_and(|(_, authority)| authority == host)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_methods_are_never_blocked() {
        assert!(is_safe(&Method::GET));
        assert!(is_safe(&Method::HEAD));
        assert!(is_safe(&Method::OPTIONS));
        assert!(!is_safe(&Method::POST));
        assert!(!is_safe(&Method::DELETE));
    }

    fn request_to(host: &str) -> Request {
        Request::builder()
            .method(Method::POST)
            .header(header::HOST, host)
            .body(Body::empty())
            .expect("a POST with a host header is a valid request")
    }

    #[test]
    fn an_origin_matching_the_host_is_accepted() {
        let request = request_to("inari.example.com");
        assert!(matches_self("https://inari.example.com", &request));
        assert!(matches_self("http://inari.example.com", &request));
    }

    #[test]
    fn a_different_origin_is_rejected() {
        let request = request_to("inari.example.com");
        assert!(!matches_self("https://evil.example.com", &request));
    }

    #[test]
    fn a_port_difference_counts_as_a_different_origin() {
        let request = request_to("inari.example.com:3000");
        assert!(!matches_self("https://inari.example.com", &request));
        assert!(matches_self("https://inari.example.com:3000", &request));
    }
}
