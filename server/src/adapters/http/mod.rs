//! HTTP adapter: the JSON API, the embedded SPA, and everything Axum-shaped.

pub mod dto;
pub mod dto_cleanup;
pub mod errors;
pub mod extract;
pub mod handlers;
pub mod origin_guard;
pub mod router;
pub mod state;
