//! The single error shape every API endpoint answers with.

use std::collections::BTreeMap;

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

use crate::domain::errors::{StorageError, StorageErrorKind};

/// A failure on its way back to a client.
#[derive(Debug)]
pub enum ApiError {
    /// A normalised storage failure.
    Storage(StorageError),
    /// No usable session accompanied a request that needs one.
    Unauthenticated,
    /// The request itself was malformed or failed validation.
    BadRequest(String),
    /// Submitted fields were rejected, one message per offending field.
    ///
    /// Carried separately from [`ApiError::BadRequest`] so the connection form
    /// can keep rendering each message against its own input.
    Validation(Vec<(String, String)>),
    /// A fault on our side, described only in the logs.
    Internal(String),
}

impl ApiError {
    /// Builds an [`ApiError::BadRequest`].
    #[must_use]
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
    }

    /// Builds an [`ApiError::Internal`].
    #[must_use]
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    /// Returns the stable wire code clients may branch on.
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::Storage(error) => error.kind().code(),
            Self::Unauthenticated => "unauthenticated",
            Self::BadRequest(_) => "bad_request",
            Self::Validation(_) => "validation_failed",
            Self::Internal(_) => "internal",
        }
    }

    /// Returns the HTTP status this failure maps to.
    #[must_use]
    pub fn status(&self) -> StatusCode {
        match self {
            Self::Storage(error) => match error.kind() {
                StorageErrorKind::InvalidCredential => StatusCode::UNAUTHORIZED,
                StorageErrorKind::AccessDenied => StatusCode::FORBIDDEN,
                StorageErrorKind::NotFound => StatusCode::NOT_FOUND,
                StorageErrorKind::EndpointUnreachable
                | StorageErrorKind::TlsError
                | StorageErrorKind::DeleteFailed
                | StorageErrorKind::CopyFailed
                | StorageErrorKind::PaginationFailed => StatusCode::BAD_GATEWAY,
                StorageErrorKind::Unknown => StatusCode::INTERNAL_SERVER_ERROR,
            },
            Self::Unauthenticated => StatusCode::UNAUTHORIZED,
            Self::BadRequest(_) | Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Returns the message safe to show a user.
    #[must_use]
    pub fn message(&self) -> &str {
        match self {
            Self::Storage(error) => error.message(),
            Self::Unauthenticated => "Your session has expired. Reconnect to continue.",
            Self::BadRequest(message) => message,
            Self::Validation(_) => "Check the highlighted fields and try again",
            // An internal fault's real description stays in the logs; the
            // client gets a constant so a stack trace, a filesystem path, or an
            // SDK debug dump can never leak through this branch.
            Self::Internal(_) => "An unexpected error occurred",
        }
    }
}

impl From<StorageError> for ApiError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error)
    }
}

/// The JSON body of every failed API response.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody<'a> {
    code: &'a str,
    message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    field_errors: Option<BTreeMap<&'a str, &'a str>>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();

        // Diagnosis happens through the logs rather than the response, which is
        // what lets the body stay free of anything sensitive.
        match &self {
            Self::Storage(error) => {
                tracing::warn!(
                    code = error.kind().code(),
                    detail = error.detail(),
                    "storage operation failed"
                );
            }
            Self::Internal(detail) => tracing::error!(detail, "unhandled internal failure"),
            Self::Unauthenticated | Self::BadRequest(_) | Self::Validation(_) => {}
        }

        let field_errors = match &self {
            Self::Validation(fields) => Some(
                fields
                    .iter()
                    .map(|(field, message)| (field.as_str(), message.as_str()))
                    .collect(),
            ),
            _ => None,
        };
        let body = ErrorBody {
            code: self.code(),
            message: self.message(),
            field_errors,
        };
        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_kinds_map_to_distinct_statuses() {
        let cases = [
            (
                StorageErrorKind::InvalidCredential,
                StatusCode::UNAUTHORIZED,
            ),
            (StorageErrorKind::AccessDenied, StatusCode::FORBIDDEN),
            (StorageErrorKind::NotFound, StatusCode::NOT_FOUND),
            (
                StorageErrorKind::EndpointUnreachable,
                StatusCode::BAD_GATEWAY,
            ),
            (StorageErrorKind::TlsError, StatusCode::BAD_GATEWAY),
            (StorageErrorKind::Unknown, StatusCode::INTERNAL_SERVER_ERROR),
        ];
        for (kind, status) in cases {
            let error = ApiError::from(StorageError::new(kind));
            assert_eq!(error.status(), status, "unexpected status for {kind}");
        }
    }

    #[test]
    fn internal_detail_never_reaches_the_message() {
        let error = ApiError::internal("/srv/inari/secret-path exploded");
        assert_eq!(error.message(), "An unexpected error occurred");
    }

    #[test]
    fn storage_detail_never_reaches_the_message() {
        let error = ApiError::from(
            StorageError::new(StorageErrorKind::AccessDenied).with_detail("AKIAEXAMPLE denied"),
        );
        assert!(!error.message().contains("AKIA"));
    }
}
