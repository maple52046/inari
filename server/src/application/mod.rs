//! Use cases: application policy orchestrating the domain over its ports.
//!
//! Depends only on [`crate::domain`], never on a concrete adapter.

pub mod connect_storage;
pub mod delete_cleanup;
pub mod delete_objects;
pub mod dirty_scopes;
pub mod get_download_url;
pub mod list_buckets;
pub mod list_objects;
pub mod move_objects;
pub mod read_capacity;
pub mod scan_capacity;
pub mod scan_cleanup;
pub mod scan_prefix_usage;
pub mod scan_queue;
pub mod scan_usage;

#[cfg(test)]
pub mod test_double;
