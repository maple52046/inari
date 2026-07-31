//! HTTP clients the S3 SDK issues its requests through.
//!
//! The SDK's bundled TLS layer can be pointed at a trust store but cannot be
//! told to skip verification, which the connection form has always offered for
//! self-hosted backends with self-signed certificates. Supplying our own client
//! is the only way to keep that feature, so both TLS modes are built here and
//! differ solely in their rustls configuration.
//!
//! Exactly two clients exist for the whole process. Credentials vary per
//! session but connection pooling does not, so sessions share these pools and a
//! per-request SDK client costs almost nothing to build.

use std::fmt;
use std::path::Path;
use std::sync::Arc;

use aws_smithy_runtime_api::client::http::{
    HttpClient, HttpConnector, HttpConnectorFuture, HttpConnectorSettings, SharedHttpClient,
    SharedHttpConnector,
};
use aws_smithy_runtime_api::client::orchestrator::HttpRequest;
use aws_smithy_runtime_api::client::result::ConnectorError;
use aws_smithy_runtime_api::client::runtime_components::RuntimeComponents;
use aws_smithy_types::body::SdkBody;
use hyper_util::client::legacy::Client as HyperClient;
use hyper_util::rt::TokioExecutor;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::{ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};
use rustls_pki_types::{CertificateDer, ServerName, UnixTime};

/// Whether a client verifies the certificate the backend presents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TlsMode {
    /// Verify against the system trust store.
    ///
    /// Native roots rather than a bundled root set, so an operator-mounted CA
    /// keeps working exactly as it did under `NODE_OPTIONS=--use-system-ca`.
    Verify,
    /// Accept any certificate.
    Insecure,
}

/// The process-wide pair of HTTP clients, one per [`TlsMode`].
#[derive(Debug, Clone)]
pub struct HttpClients {
    verifying: SharedHttpClient,
    insecure: SharedHttpClient,
}

impl HttpClients {
    /// Builds both clients.
    ///
    /// `extra_ca` names a PEM file trusted *in addition to* the platform store,
    /// mirroring what `NODE_EXTRA_CA_CERTS` did for the Node implementation. It
    /// has to add rather than replace: a deployment that trusts an internal CA
    /// still needs the public roots for everything else.
    ///
    /// # Errors
    ///
    /// Returns an error when the platform trust store cannot be loaded, or when
    /// `extra_ca` is set but unreadable or not a certificate. A misconfigured
    /// CA fails start-up rather than surfacing later as a confusing TLS error
    /// on every request.
    pub fn new(extra_ca: Option<&Path>) -> Result<Self, HttpClientBuildError> {
        // rustls refuses to build a config until one provider is chosen for the
        // process; doing it here keeps the choice next to the configs that need
        // it. A provider installed by something else is equally fine.
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

        Ok(Self {
            verifying: SharedHttpClient::new(SmithyHyperClient::verifying(extra_ca)?),
            insecure: SharedHttpClient::new(SmithyHyperClient::insecure()),
        })
    }

    /// Returns the client for `mode`.
    #[must_use]
    pub fn get(&self, mode: TlsMode) -> SharedHttpClient {
        match mode {
            TlsMode::Verify => self.verifying.clone(),
            TlsMode::Insecure => self.insecure.clone(),
        }
    }
}

/// Why the HTTP clients could not be constructed.
#[derive(Debug, thiserror::Error)]
pub enum HttpClientBuildError {
    /// The platform trust store could not be read or held nothing usable.
    #[error("could not load the system certificate trust store: {0}")]
    TrustStore(String),
    /// `INARI_EXTRA_CA_CERTS` was set but unusable.
    #[error("could not load the extra CA certificate: {0}")]
    ExtraCa(String),
}

/// A hyper client wearing the SDK's [`HttpClient`] interface.
pub struct SmithyHyperClient {
    connector: SharedHttpConnector,
    mode: TlsMode,
}

impl SmithyHyperClient {
    /// Builds the client that verifies certificates.
    fn verifying(extra_ca: Option<&Path>) -> Result<Self, HttpClientBuildError> {
        // ALPN is left unset throughout: `enable_all_versions` negotiates it,
        // and hyper-rustls panics if the config already carries a list.
        let config = ClientConfig::builder()
            .with_root_certificates(trust_store(extra_ca)?)
            .with_no_client_auth();
        Ok(Self::from_config(config, TlsMode::Verify))
    }

    /// Builds the client that accepts any certificate.
    fn insecure() -> Self {
        let config = ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(AcceptAnyCertificate))
            .with_no_client_auth();
        Self::from_config(config, TlsMode::Insecure)
    }

    fn from_config(config: ClientConfig, mode: TlsMode) -> Self {
        let connector = hyper_rustls::HttpsConnectorBuilder::new()
            .with_tls_config(config)
            .https_or_http()
            .enable_all_versions()
            .build();
        let client = HyperClient::builder(TokioExecutor::new()).build(connector);
        Self {
            connector: SharedHttpConnector::new(HyperConnector { client }),
            mode,
        }
    }
}

/// Assembles the roots used to verify backend certificates.
///
/// The platform store comes first so a CA installed with
/// `update-ca-certificates` works with no further configuration, matching what
/// the Node implementation got from `--use-system-ca`.
fn trust_store(extra_ca: Option<&Path>) -> Result<RootCertStore, HttpClientBuildError> {
    let mut roots = RootCertStore::empty();

    let native = rustls_native_certs::load_native_certs();
    for certificate in native.certs {
        // A platform store routinely holds a certificate rustls will not parse;
        // that is not a reason to refuse to start.
        let _ = roots.add(certificate);
    }
    if roots.is_empty() {
        return Err(HttpClientBuildError::TrustStore(
            native.errors.first().map_or_else(
                || "the platform store is empty".to_owned(),
                ToString::to_string,
            ),
        ));
    }

    if let Some(path) = extra_ca {
        let pem = std::fs::read(path).map_err(|error| {
            HttpClientBuildError::ExtraCa(format!("{}: {error}", path.display()))
        })?;
        let mut added = 0_usize;
        for certificate in rustls_pemfile::certs(&mut pem.as_slice()) {
            let certificate = certificate.map_err(|error| {
                HttpClientBuildError::ExtraCa(format!("{}: {error}", path.display()))
            })?;
            roots.add(certificate).map_err(|error| {
                HttpClientBuildError::ExtraCa(format!("{}: {error}", path.display()))
            })?;
            added += 1;
        }
        if added == 0 {
            return Err(HttpClientBuildError::ExtraCa(format!(
                "{}: holds no certificate",
                path.display()
            )));
        }
        tracing::info!(path = %path.display(), added, "trusting an additional CA");
    }

    Ok(roots)
}

impl fmt::Debug for SmithyHyperClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SmithyHyperClient")
            .field("mode", &self.mode)
            .finish()
    }
}

impl HttpClient for SmithyHyperClient {
    fn http_connector(
        &self,
        _settings: &HttpConnectorSettings,
        _components: &RuntimeComponents,
    ) -> SharedHttpConnector {
        self.connector.clone()
    }
}

/// Bridges the SDK's request and response types onto hyper.
#[derive(Clone)]
struct HyperConnector<C> {
    client: HyperClient<C, SdkBody>,
}

impl<C> fmt::Debug for HyperConnector<C> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("HyperConnector").finish()
    }
}

impl<C> HttpConnector for HyperConnector<C>
where
    C: Clone
        + Send
        + Sync
        + 'static
        + tower::Service<http::Uri>
        + hyper_util::client::legacy::connect::Connect,
{
    fn call(&self, request: HttpRequest) -> HttpConnectorFuture {
        let client = self.client.clone();
        HttpConnectorFuture::new(async move {
            let request = request
                .try_into_http1x()
                .map_err(|error| ConnectorError::user(error.into()))?;

            let response = client
                .request(request)
                .await
                .map_err(|error| ConnectorError::io(error.into()))?;

            let (parts, body) = response.into_parts();
            let response = http::Response::from_parts(parts, SdkBody::from_body_1_x(body));
            response
                .try_into()
                .map_err(|error: aws_smithy_runtime_api::http::HttpError| {
                    ConnectorError::other(error.into(), None)
                })
        })
    }
}

/// A verifier that accepts every certificate.
///
/// Risk: this disables the guarantee that the endpoint is who it claims to be,
/// so a network attacker can read and rewrite the traffic, credentials
/// included. It exists only because the connection form offers
/// `skipTlsVerification` for self-hosted backends, and it must never become the
/// default for a connection that did not ask for it.
#[derive(Debug)]
struct AcceptAnyCertificate;

impl ServerCertVerifier for AcceptAnyCertificate {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::aws_lc_rs::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn native_root_count() -> usize {
        trust_store(None)
            .expect("the platform trust store must be readable")
            .len()
    }

    #[test]
    fn an_extra_ca_is_added_to_the_platform_roots_rather_than_replacing_them() {
        // The regression this guards: mounting an internal CA over the system
        // bundle would leave a deployment unable to reach any public endpoint.
        let baseline = native_root_count();
        assert!(baseline > 0, "the platform store should hold roots");

        let pem = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/test-ca.pem");
        let combined = trust_store(Some(Path::new(pem)))
            .expect("a valid PEM must load")
            .len();

        assert_eq!(combined, baseline + 1);
    }

    #[test]
    fn a_missing_extra_ca_fails_start_up() {
        let error = trust_store(Some(Path::new("/nonexistent/ca.pem")))
            .expect_err("an unreadable CA must not be ignored");
        assert!(matches!(error, HttpClientBuildError::ExtraCa(_)));
    }

    #[test]
    fn a_file_holding_no_certificate_fails_start_up() {
        let path = std::env::temp_dir().join("inari-empty-ca.pem");
        std::fs::write(&path, b"not a certificate\n").expect("the temp dir must be writable");

        let error = trust_store(Some(&path)).expect_err("a PEM-less file must be rejected");
        assert!(matches!(error, HttpClientBuildError::ExtraCa(_)));

        let _ = std::fs::remove_file(&path);
    }
}
