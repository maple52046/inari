//! Inari server: a JSON API over S3-compatible storage plus the embedded SPA.
//!
//! Every S3 operation runs here rather than in the browser; credentials live
//! only in a sealed session cookie and never reach client JavaScript.
//!
//! The layering follows the project's architecture standard, inner to outer:
//! [`domain`] owns the types and the port traits, [`application`] orchestrates
//! them, [`adapters`] translates to the outside world, and [`infrastructure`]
//! holds the concrete drivers. The binary's `main` is the composition root and
//! the only place that decides which adapter implements which port.

#![forbid(unsafe_code)]

pub mod adapters;
pub mod application;
pub mod domain;
pub mod infrastructure;
