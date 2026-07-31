//! Tokio runtime construction, tracing setup, and the shutdown signal.

use std::io;
use std::num::NonZeroUsize;

use tokio::runtime::{Builder, Runtime};
use tokio::signal;
use tracing_subscriber::EnvFilter;

/// Builds the async runtime.
///
/// Defaults to the single-threaded runtime because the workload is almost
/// entirely network I/O on a VM whose CPU is shared with MinIO. `worker_threads`
/// exists so the choice can be revisited against a benchmark without a rebuild.
///
/// # Errors
///
/// Returns the underlying [`io::Error`] when the runtime cannot be created.
pub fn build(worker_threads: Option<NonZeroUsize>) -> io::Result<Runtime> {
    match worker_threads {
        Some(count) => Builder::new_multi_thread()
            .worker_threads(count.get())
            .enable_all()
            .build(),
        None => Builder::new_current_thread().enable_all().build(),
    }
}

/// Installs the tracing subscriber.
///
/// Honours `RUST_LOG`; the fallback keeps request logging on without pulling in
/// dependency chatter.
pub fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("inari_server=info,tower_http=info,axum::rejection=trace")
    });
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .init();
}

/// Resolves once the process is asked to stop.
///
/// Listens for `SIGINT` and, on Unix, `SIGTERM`, so both a terminal `Ctrl+C` and
/// a container or systemd stop reach the same graceful path.
///
/// # Panics
///
/// Panics if the signal handlers cannot be registered, which indicates the
/// process lacks the capability to run as a service at all.
pub async fn shutdown_signal() {
    let interrupt = async {
        signal::ctrl_c()
            .await
            .expect("the process must be able to install a SIGINT handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("the process must be able to install a SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = interrupt => tracing::info!("received SIGINT, shutting down"),
        () = terminate => tracing::info!("received SIGTERM, shutting down"),
    }
}

/// Resolves `timeout` after a stop is requested.
///
/// Bounds the graceful drain so a stalled request cannot hold the process past
/// what its supervisor tolerates before escalating to `SIGKILL`.
pub async fn drain_deadline(timeout: std::time::Duration) {
    shutdown_signal().await;
    tokio::time::sleep(timeout).await;
}
