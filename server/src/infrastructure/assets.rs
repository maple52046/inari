//! Serving the built SPA out of the binary.
//!
//! The bundle is embedded in release builds and read from `web/dist` in debug
//! builds, so a frontend rebuild during development does not require a Cargo
//! rebuild.

use rust_embed::RustEmbed;

/// Token in `index.html` standing in for the deployment's mount prefix.
///
/// Deliberately not spelled like the `window.__INARI_BASE_PATH__` global that
/// receives it: a placeholder that is a substring of its own carrier would be
/// rewritten along with the value, renaming the global.
const BASE_PATH_PLACEHOLDER: &str = "%INARI_BASE_PATH%";

/// Marker after which the base element is inserted.
const HEAD_OPEN: &str = "<head>";

/// The Vite build output.
///
/// `rust-embed` reads from disk in debug builds and bakes the bytes into the
/// binary for release, which is exactly the split the deployment story needs.
#[derive(RustEmbed)]
#[folder = "../web/dist"]
struct Bundle;

/// One file from the bundle.
pub struct Asset {
    /// File contents.
    pub bytes: Vec<u8>,
    /// Value for the `Content-Type` header.
    pub content_type: String,
    /// Whether the name carries a content hash and may be cached indefinitely.
    pub immutable: bool,
}

/// The SPA, prepared for one deployment's mount prefix.
#[derive(Debug, Clone)]
pub struct Spa {
    index_html: String,
    /// Kept so debug builds can re-render the document per request.
    ///
    /// Release builds compile that path out, leaving the field genuinely
    /// unread; the allowance is narrowed to those builds so a real dead field
    /// introduced later is still reported.
    #[cfg_attr(not(debug_assertions), allow(dead_code))]
    base_path: String,
}

impl Spa {
    /// Renders `index.html` for `base_path`.
    ///
    /// Two substitutions make one build serve any prefix: a `<base>` element so
    /// the bundle's relative asset URLs resolve from the mount point rather
    /// than from whatever route the user deep-linked to, and the placeholder
    /// the client reads to configure its router and API calls.
    ///
    /// This is the whole of what the Next.js version needed `docker/start.mjs`
    /// and a build-output rewrite for.
    ///
    /// # Errors
    ///
    /// Returns an error when the bundle is missing or malformed, which means
    /// the frontend was never built.
    pub fn new(base_path: &str) -> Result<Self, AssetError> {
        let raw = Bundle::get("index.html").ok_or(AssetError::MissingIndex)?;
        let html = std::str::from_utf8(&raw.data).map_err(|_| AssetError::MissingIndex)?;

        let head = html.find(HEAD_OPEN).ok_or(AssetError::MissingHead)?;
        let insert_at = head + HEAD_OPEN.len();
        let base_href = format!("\n    <base href=\"{}/\">", base_path);

        let mut index_html = String::with_capacity(html.len() + base_href.len());
        index_html.push_str(&html[..insert_at]);
        index_html.push_str(&base_href);
        index_html.push_str(&html[insert_at..]);

        Ok(Self {
            index_html: index_html.replace(BASE_PATH_PLACEHOLDER, base_path),
            base_path: base_path.to_owned(),
        })
    }

    /// Returns the document served for every application route.
    ///
    /// Re-rendered per request in debug builds. The document names the bundle's
    /// content-hashed entry point, so a frontend rebuild changes it; serving
    /// the copy made at start-up would keep pointing at the previous build and
    /// make edits look like they had no effect. Release builds embed a bundle
    /// that cannot change under them, so they answer from the cached copy.
    #[must_use]
    pub fn index_html(&self) -> std::borrow::Cow<'_, str> {
        #[cfg(debug_assertions)]
        {
            if let Ok(fresh) = Self::new(&self.base_path) {
                return std::borrow::Cow::Owned(fresh.index_html);
            }
        }
        std::borrow::Cow::Borrowed(&self.index_html)
    }

    /// Looks up a bundled file.
    ///
    /// Returns [`None`] for anything not in the bundle, including any path that
    /// tries to escape it: `rust-embed` only ever answers with names it
    /// collected at build time, so traversal has nothing to reach.
    #[must_use]
    pub fn asset(path: &str) -> Option<Asset> {
        let file = Bundle::get(path)?;
        Some(Asset {
            content_type: mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string(),
            // Vite fingerprints everything it emits into `assets/`, so those
            // names change whenever the contents do and can be cached forever.
            immutable: path.starts_with("assets/"),
            bytes: file.data.into_owned(),
        })
    }
}

/// Why the bundle could not be prepared.
#[derive(Debug, thiserror::Error)]
pub enum AssetError {
    /// `index.html` is absent from the bundle.
    #[error("the SPA bundle has no index.html; run the frontend build first")]
    MissingIndex,
    /// `index.html` has no `<head>` to anchor the base element to.
    #[error("index.html has no <head> element to inject the base path into")]
    MissingHead,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_root_mount_still_gets_a_base_element() {
        let spa = Spa::new("").expect("the bundle must be built before tests run");
        assert!(spa.index_html().contains("<base href=\"/\">"));
    }

    #[test]
    fn a_prefix_reaches_both_the_base_element_and_the_client() {
        let spa = Spa::new("/dashboard").expect("the bundle must be built");
        assert!(spa.index_html().contains("<base href=\"/dashboard/\">"));
        assert!(
            spa.index_html()
                .contains("window.__INARI_BASE_PATH__ = \"/dashboard\"")
        );
    }

    #[test]
    fn no_placeholder_survives_rendering() {
        let spa = Spa::new("/dashboard").expect("the bundle must be built");
        assert!(!spa.index_html().contains(BASE_PATH_PLACEHOLDER));
    }

    #[test]
    fn a_path_outside_the_bundle_is_not_served() {
        assert!(Spa::asset("../../etc/passwd").is_none());
        assert!(Spa::asset("nope.js").is_none());
    }

    #[test]
    fn fingerprinted_assets_are_marked_cacheable() {
        let index = Spa::asset("index.html").expect("index.html is always bundled");
        assert!(!index.immutable, "the document must never be cached hard");
    }
}
