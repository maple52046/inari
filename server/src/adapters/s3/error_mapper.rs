//! Normalises SDK failures into the domain's [`StorageError`] taxonomy.
//!
//! Classification reads error codes and the source chain. The underlying
//! message is used to classify and is recorded as a diagnostic detail, but it
//! never becomes the message shown to a user.

use aws_sdk_s3::error::{ProvideErrorMetadata, SdkError};

use crate::domain::errors::{StorageError, StorageErrorKind};

/// Substrings that identify a certificate problem in a transport error.
///
/// Matched against the whole source chain because rustls reports the reason
/// several layers below the SDK's own error.
const TLS_MARKERS: [&str; 6] = [
    "certificate",
    "self-signed",
    "self signed",
    "unknownissuer",
    "certnotvalid",
    "badcertificate",
];

/// Maps an SDK failure onto the domain taxonomy.
///
/// `fallback` is used when nothing in the error identifies a specific cause,
/// letting each call site say what a generic failure means for its operation.
pub fn map_sdk_error<E, R>(error: &SdkError<E, R>, fallback: StorageErrorKind) -> StorageError
where
    E: ProvideErrorMetadata + std::error::Error + 'static,
    R: std::fmt::Debug + 'static,
{
    let detail = describe(error);

    if let SdkError::ServiceError(service) = error
        && let Some(kind) = classify_service_code(service.err().code().unwrap_or_default())
    {
        return finish(kind, detail);
    }

    match error {
        SdkError::TimeoutError(_) => return finish(StorageErrorKind::EndpointUnreachable, detail),
        SdkError::DispatchFailure(_) => {
            let lowered = detail.to_ascii_lowercase();
            let kind = if TLS_MARKERS.iter().any(|marker| lowered.contains(marker)) {
                StorageErrorKind::TlsError
            } else {
                StorageErrorKind::EndpointUnreachable
            };
            return finish(kind, detail);
        }
        SdkError::ConstructionFailure(_)
        | SdkError::ResponseError(_)
        | SdkError::ServiceError(_) => {}
        _ => {}
    }

    finish(fallback, detail)
}

/// Maps an S3 error code onto the domain taxonomy.
///
/// Codes are carried over from the TypeScript mapper so a backend reply is
/// classified the same way it was before the rewrite.
fn classify_service_code(code: &str) -> Option<StorageErrorKind> {
    match code {
        "InvalidAccessKeyId"
        | "SignatureDoesNotMatch"
        | "InvalidToken"
        | "CredentialsProviderError"
        | "InvalidClientTokenId"
        | "UnrecognizedClientException" => Some(StorageErrorKind::InvalidCredential),
        "AccessDenied" | "AllAccessDisabled" | "AccessDeniedException" | "Forbidden" => {
            Some(StorageErrorKind::AccessDenied)
        }
        "NoSuchBucket" | "NoSuchKey" | "NotFound" | "NoSuchUpload" => {
            Some(StorageErrorKind::NotFound)
        }
        _ => None,
    }
}

/// Builds a diagnostic string from the error and its source chain.
///
/// Only SDK-supplied text is included. Credentials are never part of these
/// fields, so the result is safe to log, though not to show a user.
fn describe<E, R>(error: &SdkError<E, R>) -> String
where
    E: ProvideErrorMetadata + std::error::Error + 'static,
    R: std::fmt::Debug + 'static,
{
    let mut parts = Vec::new();

    if let SdkError::ServiceError(service) = error {
        let metadata = service.err();
        if let Some(code) = metadata.code() {
            parts.push(code.to_owned());
        }
        if let Some(message) = metadata.message() {
            parts.push(message.to_owned());
        }
    }

    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(error);
    while let Some(current) = source {
        let rendered = current.to_string();
        if !rendered.is_empty() && !parts.contains(&rendered) {
            parts.push(rendered);
        }
        source = current.source();
    }

    parts.join("; ")
}

/// Assembles the final error, dropping an empty detail.
fn finish(kind: StorageErrorKind, detail: String) -> StorageError {
    let error = StorageError::new(kind);
    if detail.is_empty() {
        error
    } else {
        error.with_detail(detail)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_codes_are_recognised() {
        for code in [
            "InvalidAccessKeyId",
            "SignatureDoesNotMatch",
            "InvalidToken",
            "CredentialsProviderError",
        ] {
            assert_eq!(
                classify_service_code(code),
                Some(StorageErrorKind::InvalidCredential),
                "{code} should read as a credential failure"
            );
        }
    }

    #[test]
    fn absence_and_denial_are_distinguished() {
        assert_eq!(
            classify_service_code("NoSuchBucket"),
            Some(StorageErrorKind::NotFound)
        );
        assert_eq!(
            classify_service_code("AccessDenied"),
            Some(StorageErrorKind::AccessDenied)
        );
    }

    #[test]
    fn unknown_codes_fall_through_to_the_caller_fallback() {
        assert_eq!(classify_service_code("SlowDown"), None);
        assert_eq!(classify_service_code(""), None);
    }

    #[test]
    fn tls_markers_cover_the_rustls_wording() {
        let chain = "dispatch failure; invalid peer certificate: UnknownIssuer";
        let lowered = chain.to_ascii_lowercase();
        assert!(TLS_MARKERS.iter().any(|marker| lowered.contains(marker)));
    }
}
