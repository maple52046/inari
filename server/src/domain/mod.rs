//! Domain layer: framework-free types and the port traits defined over them.
//!
//! Nothing here may depend on an async runtime, an HTTP framework, or a storage
//! SDK. Data crossing a boundary is expressed with these types, never with
//! driver-shaped values.

pub mod capacity;
pub mod cleanup;
pub mod errors;
pub mod models;
pub mod object_path;
pub mod ports;
