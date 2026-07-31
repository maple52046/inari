//! Conversions from SDK shapes to domain models.

use aws_sdk_s3::types::{Bucket, CommonPrefix as SdkCommonPrefix, Object};
use aws_smithy_types::DateTime as SmithyDateTime;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::models::{BucketSummary, CommonPrefix, ObjectSummary};

/// Returns the basename of a key or prefix relative to the listed prefix.
///
/// Falls back to the whole key when trimming would leave nothing, so a row can
/// never render blank.
fn basename(key: &str, prefix: &str, delimiter: &str) -> String {
    let without_prefix = key.strip_prefix(prefix).unwrap_or(key);
    let trimmed = if delimiter.is_empty() {
        without_prefix
    } else {
        without_prefix
            .strip_suffix(delimiter)
            .unwrap_or(without_prefix)
    };
    if trimmed.is_empty() {
        key.to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Converts an SDK timestamp into a [`SystemTime`].
///
/// Timestamps before the epoch are dropped rather than clamped: a backend
/// reporting one is malfunctioning, and a wrong date reads as real data.
pub fn to_system_time(value: Option<&SmithyDateTime>) -> Option<SystemTime> {
    let seconds = value?.secs();
    if seconds < 0 {
        return None;
    }
    let nanos = value?.subsec_nanos();
    Some(UNIX_EPOCH + Duration::new(seconds.unsigned_abs(), nanos))
}

/// Converts an SDK bucket.
pub fn map_bucket(bucket: &Bucket) -> BucketSummary {
    BucketSummary {
        name: bucket.name().unwrap_or_default().to_owned(),
        created_at: to_system_time(bucket.creation_date()),
    }
}

/// Converts an SDK object within the listed prefix.
pub fn map_object(object: &Object, prefix: &str, delimiter: &str) -> ObjectSummary {
    let key = object.key().unwrap_or_default().to_owned();
    ObjectSummary {
        name: basename(&key, prefix, delimiter),
        size: object.size().unwrap_or_default().max(0).unsigned_abs(),
        last_modified: to_system_time(object.last_modified()),
        storage_class: object
            .storage_class()
            .map(|class| class.as_str().to_owned()),
        etag: object.e_tag().map(str::to_owned),
        key,
    }
}

/// Converts an SDK common prefix within the listed prefix.
pub fn map_prefix(common_prefix: &SdkCommonPrefix, prefix: &str, delimiter: &str) -> CommonPrefix {
    let value = common_prefix.prefix().unwrap_or_default().to_owned();
    CommonPrefix {
        name: basename(&value, prefix, delimiter),
        prefix: value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basename_strips_the_listed_prefix() {
        assert_eq!(basename("photos/2024/a.jpg", "photos/2024/", "/"), "a.jpg");
        assert_eq!(basename("a.jpg", "", "/"), "a.jpg");
    }

    #[test]
    fn basename_strips_a_folders_trailing_delimiter() {
        assert_eq!(basename("photos/2024/", "photos/", "/"), "2024");
    }

    #[test]
    fn basename_falls_back_to_the_key_when_nothing_would_remain() {
        assert_eq!(basename("photos/", "photos/", "/"), "photos/");
    }

    #[test]
    fn basename_keeps_the_full_key_for_a_flat_listing() {
        assert_eq!(basename("photos/2024/a.jpg", "", ""), "photos/2024/a.jpg");
    }

    #[test]
    fn basename_survives_a_unicode_key() {
        assert_eq!(basename("圖片/貓.jpg", "圖片/", "/"), "貓.jpg");
    }
}
