//! Domain error taxonomy for storage operations.
//!
//! The adapter layer normalises SDK and network failures into a
//! [`StorageError`] carrying one of these kinds. The API maps the kind to a
//! stable wire code and a safe message; raw SDK errors, stack traces, and
//! credentials must never reach a client.

use std::fmt;

/// Normalised category of a storage failure.
///
/// The serialised form is the stable wire contract shared with the frontend and
/// matches the `StorageErrorKind` string union the TypeScript client already
/// understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageErrorKind {
    /// Credentials were rejected, or they cannot see the target at all.
    InvalidCredential,
    /// The endpoint could not be reached.
    EndpointUnreachable,
    /// The TLS handshake failed.
    TlsError,
    /// The credentials are valid but lack permission for this operation.
    AccessDenied,
    /// The bucket or object does not exist.
    NotFound,
    /// A batch delete did not remove every requested key.
    DeleteFailed,
    /// A copy, and therefore any move built on it, did not complete.
    CopyFailed,
    /// A continuation token was rejected or a page could not be fetched.
    PaginationFailed,
    /// Anything the adapter could not classify.
    Unknown,
}

impl StorageErrorKind {
    /// Returns the stable wire code for this kind.
    #[must_use]
    pub const fn code(self) -> &'static str {
        match self {
            Self::InvalidCredential => "invalid_credential",
            Self::EndpointUnreachable => "endpoint_unreachable",
            Self::TlsError => "tls_error",
            Self::AccessDenied => "access_denied",
            Self::NotFound => "not_found",
            Self::DeleteFailed => "delete_failed",
            Self::CopyFailed => "copy_failed",
            Self::PaginationFailed => "pagination_failed",
            Self::Unknown => "unknown",
        }
    }

    /// Returns the user-facing message for this kind.
    ///
    /// The wording is carried over verbatim from the TypeScript implementation
    /// so the rewrite does not change a single message a user has seen.
    #[must_use]
    pub const fn message(self) -> &'static str {
        match self {
            Self::InvalidCredential => "Credential is invalid or access denied",
            Self::EndpointUnreachable => "Cannot connect to S3 endpoint",
            Self::TlsError => "TLS connection failed",
            Self::AccessDenied => "You do not have permission to access this bucket",
            Self::NotFound => "The requested bucket or object was not found",
            Self::DeleteFailed => "Some objects could not be deleted",
            Self::CopyFailed => "The object could not be copied",
            Self::PaginationFailed => "Failed to load next page",
            Self::Unknown => "An unexpected storage error occurred",
        }
    }
}

impl fmt::Display for StorageErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}

/// A normalised storage failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageError {
    kind: StorageErrorKind,
    message: String,
    detail: Option<String>,
}

impl StorageError {
    /// Builds an error carrying the default message for `kind`.
    #[must_use]
    pub fn new(kind: StorageErrorKind) -> Self {
        Self {
            kind,
            message: kind.message().to_owned(),
            detail: None,
        }
    }

    /// Attaches a non-sensitive underlying cause for diagnosis.
    ///
    /// The detail reaches logs always and clients only in development, so it
    /// must never carry credentials or a raw SDK debug dump.
    #[must_use]
    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    /// Returns the failure category.
    #[must_use]
    pub const fn kind(&self) -> StorageErrorKind {
        self.kind
    }

    /// Returns the user-facing message.
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }

    /// Returns the non-sensitive underlying cause, when one was recorded.
    #[must_use]
    pub fn detail(&self) -> Option<&str> {
        self.detail.as_deref()
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{}: {} ({detail})", self.kind, self.message),
            None => write!(f, "{}: {}", self.kind, self.message),
        }
    }
}

impl std::error::Error for StorageError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_message_follows_the_kind() {
        let error = StorageError::new(StorageErrorKind::NotFound);
        assert_eq!(
            error.message(),
            "The requested bucket or object was not found"
        );
        assert_eq!(error.kind().code(), "not_found");
    }

    #[test]
    fn detail_is_absent_unless_recorded() {
        let plain = StorageError::new(StorageErrorKind::Unknown);
        assert_eq!(plain.detail(), None);

        let annotated = plain.with_detail("NoSuchBucket");
        assert_eq!(annotated.detail(), Some("NoSuchBucket"));
    }

    #[test]
    fn wire_codes_match_the_typescript_union() {
        let pairs = [
            (StorageErrorKind::InvalidCredential, "invalid_credential"),
            (
                StorageErrorKind::EndpointUnreachable,
                "endpoint_unreachable",
            ),
            (StorageErrorKind::TlsError, "tls_error"),
            (StorageErrorKind::AccessDenied, "access_denied"),
            (StorageErrorKind::NotFound, "not_found"),
            (StorageErrorKind::DeleteFailed, "delete_failed"),
            (StorageErrorKind::CopyFailed, "copy_failed"),
            (StorageErrorKind::PaginationFailed, "pagination_failed"),
            (StorageErrorKind::Unknown, "unknown"),
        ];
        for (kind, code) in pairs {
            assert_eq!(kind.code(), code);
            assert_eq!(serde_json::to_string(&kind).unwrap(), format!("\"{code}\""));
        }
    }
}
