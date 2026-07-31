//! The `aws-sdk-s3` adapter implementing the storage port.

mod error_mapper;
mod factory;
mod http_client;
mod mappers;
mod storage;

pub use factory::S3StorageFactory;
pub use http_client::HttpClients;
