//! Shared state handed to every HTTP handler.

use std::sync::Arc;

use crate::adapters::session::SessionStore;
use crate::domain::ports::ObjectStorageFactory;
use crate::infrastructure::assets::Spa;
use crate::infrastructure::config::Config;

/// Long-lived, shareable dependencies for the HTTP layer.
///
/// Only values that outlive a request belong here. Request-scoped data, object
/// bodies, and unbounded collections must not be parked on the state. In
/// particular there is no per-session storage client cache: clients are built
/// per request so no credential material is retained between them.
#[derive(Clone)]
pub struct AppState {
    config: Arc<Config>,
    sessions: Arc<SessionStore>,
    storage_factory: Arc<dyn ObjectStorageFactory>,
    /// The built SPA, absent when the frontend was not bundled into this build.
    spa: Option<Arc<Spa>>,
}

impl AppState {
    /// Wires the state from its dependencies.
    #[must_use]
    pub fn new(
        config: Arc<Config>,
        sessions: Arc<SessionStore>,
        storage_factory: Arc<dyn ObjectStorageFactory>,
        spa: Option<Arc<Spa>>,
    ) -> Self {
        Self {
            config,
            sessions,
            storage_factory,
            spa,
        }
    }

    /// Returns the built SPA, when one was bundled.
    #[must_use]
    pub fn spa(&self) -> Option<&Spa> {
        self.spa.as_deref()
    }

    /// Returns the process configuration.
    #[must_use]
    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Returns the session cookie store.
    #[must_use]
    pub fn sessions(&self) -> &SessionStore {
        &self.sessions
    }

    /// Returns the factory that builds a storage port per connection.
    #[must_use]
    pub fn storage_factory(&self) -> &dyn ObjectStorageFactory {
        self.storage_factory.as_ref()
    }
}
