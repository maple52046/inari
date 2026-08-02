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

/// Returns the deepest folder prefix that contains every one of `keys`.
///
/// This is what turns a batch of changed keys into one location to re-measure:
/// walking their common folder costs a fraction of walking the bucket, and it
/// is guaranteed to cover every one of them.
///
/// The result always ends at a delimiter, so a shared filename stem never makes
/// two unrelated folders look like one prefix. An empty result means the bucket
/// root, which is the whole bucket.
#[must_use]
pub fn common_folder_prefix<'a>(keys: impl IntoIterator<Item = &'a str>) -> String {
    let mut keys = keys.into_iter();
    let Some(first) = keys.next() else {
        return String::new();
    };

    let mut shared: Vec<char> = first.chars().collect();
    for key in keys {
        let matching = shared
            .iter()
            .zip(key.chars())
            .take_while(|(left, right)| **left == *right)
            .count();
        shared.truncate(matching);
        if shared.is_empty() {
            return String::new();
        }
    }

    // Cutting at the last delimiter is what keeps `a/foo.txt` and `a/fob.txt`
    // from yielding `a/fo`, which names no folder and would list nothing.
    match shared.iter().rposition(|character| *character == '/') {
        Some(boundary) => shared[..=boundary].iter().collect(),
        None => String::new(),
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

    #[test]
    fn keys_in_one_folder_share_that_folder() {
        assert_eq!(
            common_folder_prefix(["a/b/c.jpg", "a/b/d.jpg"]),
            "a/b/",
            "a batch confined to one folder must not cost a bucket walk"
        );
    }

    #[test]
    fn keys_in_sibling_folders_share_their_parent() {
        assert_eq!(common_folder_prefix(["a/b/c.jpg", "a/x/d.jpg"]), "a/");
    }

    #[test]
    fn keys_with_nothing_in_common_reach_the_bucket_root() {
        assert_eq!(common_folder_prefix(["photos/a.jpg", "videos/b.mp4"]), "");
        assert_eq!(common_folder_prefix(["a.jpg", "b.jpg"]), "");
    }

    #[test]
    fn a_lone_key_yields_the_folder_holding_it() {
        assert_eq!(common_folder_prefix(["a/b/c.jpg"]), "a/b/");
        assert_eq!(common_folder_prefix(["c.jpg"]), "");
    }

    #[test]
    fn a_shared_filename_stem_does_not_invent_a_folder() {
        // `a/fo` names nothing and would list no objects at all.
        assert_eq!(common_folder_prefix(["a/foo.txt", "a/fob.txt"]), "a/");
    }

    #[test]
    fn nothing_at_all_reaches_the_bucket_root() {
        assert_eq!(common_folder_prefix(std::iter::empty()), "");
    }

    #[test]
    fn a_multibyte_key_is_split_on_characters_rather_than_bytes() {
        assert_eq!(
            common_folder_prefix(["圖片/貓.jpg", "圖片/狗.jpg"]),
            "圖片/"
        );
    }
}
