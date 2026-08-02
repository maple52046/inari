//! Composition root: wires the adapters to the use cases and serves them.

#![forbid(unsafe_code)]

use std::process::ExitCode;
use std::sync::Arc;

use inari_server::adapters::capacity::{
    CapacityScanner, CapacityServices, CapacitySweeper, MemoryCapacityIndex, ScanRequests,
};
use inari_server::adapters::http::{router, state::AppState};
use inari_server::adapters::s3::{HttpClients, S3StorageFactory};
use inari_server::adapters::session::SessionStore;
use inari_server::domain::ports::{CapacityIndex, Clock, ObjectStorageFactory};
use inari_server::infrastructure::assets::Spa;
use inari_server::infrastructure::clock::SystemClock;
use inari_server::infrastructure::config::{self, Config};
use inari_server::infrastructure::runtime;

fn main() -> ExitCode {
    runtime::init_tracing();
    config::load_dotenv();

    let config = match Config::from_env() {
        Ok(config) => Arc::new(config),
        Err(error) => {
            tracing::error!(%error, "configuration is unusable");
            return ExitCode::FAILURE;
        }
    };

    let async_runtime = match runtime::build(config.worker_threads) {
        Ok(async_runtime) => async_runtime,
        Err(error) => {
            tracing::error!(%error, "could not start the async runtime");
            return ExitCode::FAILURE;
        }
    };

    match async_runtime.block_on(serve(config)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(%error, "server stopped with an error");
            ExitCode::FAILURE
        }
    }
}

/// Binds the listener and serves until a shutdown signal arrives.
///
/// # Errors
///
/// Returns an error when the address cannot be bound or the server aborts.
async fn serve(config: Arc<Config>) -> std::io::Result<()> {
    let bind = config.bind;
    let base_path = config.base_path.clone();
    let shutdown_timeout = config.shutdown_timeout;

    let http_clients =
        HttpClients::new(config.extra_ca_certs.as_deref()).map_err(std::io::Error::other)?;
    let sessions = Arc::new(SessionStore::new(
        &config.session_secret,
        config.cookie_path(),
        config.session_cookie_secure,
    ));
    let storage_factory = Arc::new(S3StorageFactory::new(http_clients, config.s3_timeout));
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);

    let capacity = build_capacity(&config, storage_factory.as_ref(), &clock)?;
    if let Some(scanner) = capacity.scanner() {
        // The queue is drained by exactly one task, so the rate ceiling bounds
        // the whole process rather than one scan at a time.
        tokio::spawn(Arc::clone(scanner).run());
    }

    // A binary without a bundle still serves the API, which is what the Vite
    // dev server proxies to; only the document route reports it is unavailable.
    let spa = match Spa::new(&base_path) {
        Ok(spa) => Some(Arc::new(spa)),
        Err(error) => {
            tracing::warn!(%error, "serving the API only");
            None
        }
    };

    let app = router::build(AppState::new(
        config,
        sessions,
        storage_factory,
        capacity,
        clock,
        spa,
    ));

    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(
        %bind,
        base_path = if base_path.is_empty() { "/" } else { &base_path },
        "inari server listening"
    );

    let server = axum::serve(listener, app).with_graceful_shutdown(runtime::shutdown_signal());

    // A stuck request must not hold the process open past the stop timeout its
    // supervisor allows, or systemd and Kubernetes will escalate to SIGKILL and
    // the shutdown stops being graceful at all.
    tokio::select! {
        result = server => result,
        () = runtime::drain_deadline(shutdown_timeout) => {
            tracing::warn!(
                timeout_secs = shutdown_timeout.as_secs(),
                "requests still in flight at the shutdown deadline; exiting anyway"
            );
            Ok(())
        }
    }
}

/// Decides which capacity implementation this deployment gets.
///
/// The one place that reads the mode: everything downstream takes the port and
/// cannot tell whether an index is being maintained.
///
/// # Errors
///
/// Returns an error when the scanner's own storage client cannot be built,
/// which fails start-up rather than leaving an index that can never fill.
fn build_capacity(
    config: &Config,
    storage_factory: &dyn ObjectStorageFactory,
    clock: &Arc<dyn Clock>,
) -> std::io::Result<CapacityServices> {
    let (Some(settings), Some(connection)) =
        (config.capacity.settings(), config.scanner_connection())
    else {
        return Ok(CapacityServices::disabled());
    };

    // The queue is created first and handed to both: the index puts dirtied
    // locations on it and the scanner takes them off, so neither has to hold a
    // reference to the other.
    let requests = Arc::new(ScanRequests::default());
    let index = Arc::new(MemoryCapacityIndex::new(
        settings.limits,
        Arc::clone(clock),
        Arc::clone(&requests),
    ));
    let storage = storage_factory
        .create(&connection)
        .map_err(std::io::Error::other)?;
    let scanner = Arc::new(CapacityScanner::new(
        storage,
        Arc::clone(&index) as Arc<dyn CapacityIndex>,
        requests,
        settings.scan_rate,
    ));

    if settings.autoscan {
        // The sweeper only puts work on the queue; the scanner's own task is
        // what drains it. Keeping them apart is what stops a long pass from
        // blocking the interactive refreshes sharing the same rate budget.
        tokio::spawn(
            CapacitySweeper::new(
                Arc::clone(&scanner),
                Arc::clone(&index),
                settings.coverage.clone(),
                settings.autoscan_interval,
            )
            .run(),
        );
    }

    tracing::info!(
        ttl_secs = settings.ttl.as_secs(),
        scan_rate = settings.scan_rate.get(),
        max_depth = settings.limits.max_depth,
        max_nodes = settings.limits.max_nodes,
        autoscan = settings.autoscan,
        autoscan_interval_secs = settings.autoscan_interval.as_secs(),
        verify_prefix_access = settings.verify_prefix_access,
        "shared capacity index enabled"
    );
    Ok(CapacityServices::enabled(
        index as Arc<dyn CapacityIndex>,
        scanner,
    ))
}
