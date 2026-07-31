//! Key and prefix arithmetic.
//!
//! S3 has no directories; keys only emulate them with `/`. These helpers hold
//! the one interpretation of that convention the whole application shares.

/// One immediate child of a prefix: either a sub-prefix or an object in it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrefixChild {
    /// Name relative to the prefix; sub-prefixes keep their trailing delimiter.
    pub name: String,
    /// Whether the child groups further keys rather than being a single object.
    pub is_prefix: bool,
}

/// Attributes an object key to the immediate child of `prefix` holding it.
///
/// This is what lets one flat listing produce a per-child breakdown: every key
/// is walked once and folded into its top-level child, so measuring what a
/// location contains costs no more than measuring the location's total.
///
/// Returns [`None`] when the key does not sit beneath the prefix, or is the
/// prefix's own folder marker and so belongs to no child.
#[must_use]
pub fn child_of_prefix(key: &str, prefix: &str) -> Option<PrefixChild> {
    let remainder = key.strip_prefix(prefix)?;
    if remainder.is_empty() {
        return None;
    }
    match remainder.find('/') {
        // The delimiter is kept so the name reads as a folder and matches the
        // prefixes the listing API reports.
        Some(boundary) => Some(PrefixChild {
            name: remainder[..=boundary].to_owned(),
            is_prefix: true,
        }),
        None => Some(PrefixChild {
            name: remainder.to_owned(),
            is_prefix: false,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_directly_in_the_prefix_is_an_object_child() {
        let child = child_of_prefix("photos/a.jpg", "photos/").unwrap();
        assert_eq!(child.name, "a.jpg");
        assert!(!child.is_prefix);
    }

    #[test]
    fn a_deeper_key_folds_into_its_top_level_folder() {
        let child = child_of_prefix("photos/2024/summer/a.jpg", "photos/").unwrap();
        assert_eq!(child.name, "2024/");
        assert!(child.is_prefix);
    }

    #[test]
    fn the_folder_marker_belongs_to_no_child() {
        assert_eq!(child_of_prefix("photos/", "photos/"), None);
    }

    #[test]
    fn a_key_outside_the_prefix_is_ignored() {
        assert_eq!(child_of_prefix("videos/a.mp4", "photos/"), None);
    }

    #[test]
    fn the_bucket_root_reads_every_key() {
        assert_eq!(child_of_prefix("a.jpg", "").unwrap().name, "a.jpg");
        assert_eq!(child_of_prefix("photos/a.jpg", "").unwrap().name, "photos/");
    }

    #[test]
    fn unicode_keys_split_on_the_delimiter_only() {
        let child = child_of_prefix("圖片/貓 咪.jpg", "圖片/").unwrap();
        assert_eq!(child.name, "貓 咪.jpg");
        assert!(!child.is_prefix);
    }
}
