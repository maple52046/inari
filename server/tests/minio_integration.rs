//! End-to-end checks against a real S3-compatible backend.
//!
//! These exercise the SDK adapter, which unit tests deliberately cannot reach:
//! signing, pagination, Unicode keys, and the copy paths all depend on how a
//! backend actually behaves rather than on how a fake was scripted.
//!
//! Skipped unless `INARI_TEST_S3_ENDPOINT`, `INARI_TEST_S3_ACCESS_KEY`, and
//! `INARI_TEST_S3_SECRET_KEY` are set, so `cargo test` stays useful on a machine
//! with no MinIO. Start one with `just minio-up`.

use std::env;
use std::sync::Arc;
use std::time::Duration;

use inari_server::adapters::capacity::NoopCapacityIndex;
use inari_server::adapters::s3::{HttpClients, S3StorageFactory};
use inari_server::application::delete_objects::delete_objects;
use inari_server::application::list_buckets::list_buckets;
use inari_server::application::list_objects::list_objects;
use inari_server::application::move_objects::{MoveEntry, MoveObjectsInput, move_objects};
use inari_server::application::scan_cleanup::scan_cleanup;
use inari_server::application::scan_prefix_usage::scan_prefix_usage;
use inari_server::application::scan_usage::scan_bucket_usage;
use inari_server::domain::cleanup::{CleanupScanOptions, CleanupScope};
use inari_server::domain::models::S3Connection;
use inari_server::domain::ports::{ObjectStorage, ObjectStorageFactory};

/// A key exercising the escaping the copy source and the signer both need.
const UNICODE_KEY: &str = "2024/summer/貓 咪.jpg";

/// Builds a storage port, or returns `None` when the environment is not set.
fn storage() -> Option<Arc<dyn ObjectStorage>> {
    // Read from `.env` too, so the backend's address and throwaway credentials
    // live in a git-ignored file rather than on a command line.
    let _ = dotenvy::dotenv();

    let endpoint = env::var("INARI_TEST_S3_ENDPOINT").ok()?;
    let access_key_id = env::var("INARI_TEST_S3_ACCESS_KEY").ok()?;
    let secret_access_key = env::var("INARI_TEST_S3_SECRET_KEY").ok()?;

    let clients = HttpClients::new(None).expect("the platform trust store must be readable");
    let factory = S3StorageFactory::new(clients, Duration::from_secs(30));
    factory
        .create(&S3Connection {
            endpoint,
            access_key_id,
            secret_access_key,
            region: "us-east-1".to_owned(),
            force_path_style: true,
            skip_tls_verification: false,
        })
        .ok()
}

/// Names a bucket uniquely per test so runs cannot collide.
fn bucket_for(test: &str) -> String {
    format!("inari-it-{test}")
}

macro_rules! require_backend {
    () => {
        match storage() {
            Some(storage) => storage,
            None => {
                eprintln!("skipping: INARI_TEST_S3_* is not configured");
                return;
            }
        }
    };
}

#[tokio::test]
async fn buckets_are_listed() {
    let storage = require_backend!();
    let buckets = list_buckets(storage.as_ref())
        .await
        .expect("listing buckets must succeed against a reachable backend");
    assert!(
        buckets.iter().any(|bucket| bucket.name == "photos"),
        "the seeded 'photos' bucket should be visible"
    );
}

#[tokio::test]
async fn a_delimited_listing_separates_folders_from_objects() {
    let storage = require_backend!();
    let page = list_objects(storage.as_ref(), "photos", "", None)
        .await
        .expect("listing the bucket root must succeed");

    assert!(
        page.prefixes.iter().any(|prefix| prefix.name == "2024"),
        "the 2024 folder should appear as a common prefix, not an object"
    );
    assert!(
        page.objects.iter().all(|object| !object.key.ends_with('/')),
        "folder markers must not be listed as objects"
    );
}

#[tokio::test]
async fn a_unicode_key_survives_listing_and_signing() {
    let storage = require_backend!();

    let page = list_objects(storage.as_ref(), "photos", "2024/summer/", None)
        .await
        .expect("listing the summer folder must succeed");
    assert!(
        page.objects.iter().any(|object| object.key == UNICODE_KEY),
        "the Unicode key should round-trip through the listing unchanged"
    );

    let url = storage
        .download_url("photos", UNICODE_KEY, 300)
        .await
        .expect("signing a Unicode key must succeed");
    assert!(url.contains("X-Amz-Signature"), "the URL must be signed");
    assert!(
        !url.contains(' '),
        "the space in the key must be percent-encoded"
    );
}

#[tokio::test]
async fn a_usage_scan_counts_every_object() {
    let storage = require_backend!();
    let usage = scan_bucket_usage(storage.as_ref(), "photos")
        .await
        .expect("scanning a readable bucket must succeed");

    assert!(usage.object_count > 0, "the seeded bucket is not empty");
    assert!(usage.total_size > 0);
}

#[tokio::test]
async fn a_prefix_scan_attributes_keys_to_their_folder() {
    let storage = require_backend!();
    let usage = scan_prefix_usage(storage.as_ref(), "photos", "")
        .await
        .expect("measuring the bucket root must succeed");

    assert!(
        usage
            .entries
            .iter()
            .any(|entry| entry.name == "2024/" && entry.is_prefix),
        "keys under 2024/ should fold into a single folder entry"
    );
    assert!(!usage.truncated);
}

#[tokio::test]
async fn a_missing_bucket_reports_a_typed_failure() {
    let storage = require_backend!();
    let error = list_objects(storage.as_ref(), "inari-no-such-bucket", "", None)
        .await
        .expect_err("listing an absent bucket must fail");

    assert_eq!(
        error.kind().code(),
        "not_found",
        "an absent bucket must classify as not_found, not as a generic failure"
    );
}

#[tokio::test]
async fn pagination_covers_every_object_exactly_once() {
    let storage = require_backend!();
    let bucket = bucket_for("pagination");

    // Seeded by the test harness rather than the suite: creating hundreds of
    // objects here would make every run slow. Skipped when absent.
    let Ok(first) = list_objects(storage.as_ref(), &bucket, "", None).await else {
        eprintln!("skipping: {bucket} is not seeded");
        return;
    };

    let mut seen: Vec<String> = first.objects.iter().map(|o| o.key.clone()).collect();
    let mut token = first.continuation_token;
    let mut pages = 1;

    while let Some(next) = token {
        let page = list_objects(storage.as_ref(), &bucket, "", Some(next))
            .await
            .expect("following a continuation token must succeed");
        seen.extend(page.objects.iter().map(|o| o.key.clone()));
        token = page.continuation_token;
        pages += 1;
        assert!(pages < 100, "pagination should terminate");
    }

    let mut unique = seen.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(
        unique.len(),
        seen.len(),
        "pagination must not return a key twice"
    );
    assert!(pages > 1, "the seeded bucket should span several pages");
}

#[tokio::test]
async fn a_move_relocates_the_object_and_removes_the_source() {
    let storage = require_backend!();
    let bucket = bucket_for("move");

    let Ok(before) = list_objects(storage.as_ref(), &bucket, "", None).await else {
        eprintln!("skipping: {bucket} is not seeded");
        return;
    };
    let Some(source) = before.objects.first() else {
        eprintln!("skipping: {bucket} has nothing to move");
        return;
    };

    let destination = format!("moved/{}", source.name);
    let result = move_objects(
        storage.as_ref(),
        &NoopCapacityIndex,
        &MoveObjectsInput {
            source_bucket: bucket.clone(),
            destination_bucket: bucket.clone(),
            entries: vec![MoveEntry {
                key: source.key.clone(),
                destination_key: destination.clone(),
            }],
        },
    )
    .await
    .expect("a move within one bucket must succeed");

    assert_eq!(result.moved.len(), 1, "failures: {:?}", result.failed);
    assert!(
        storage
            .object_exists(&bucket, &destination)
            .await
            .expect("probing the destination must succeed")
    );
    assert!(
        !storage
            .object_exists(&bucket, &source.key)
            .await
            .expect("probing the source must succeed"),
        "the source must be gone once its copy landed"
    );

    delete_objects(
        storage.as_ref(),
        &NoopCapacityIndex,
        &bucket,
        &[destination],
    )
    .await
    .expect("cleaning up the moved object must succeed");
}

#[tokio::test]
async fn a_cleanup_scan_ranks_and_caps_candidates() {
    let storage = require_backend!();
    let plan = scan_cleanup(
        storage.as_ref(),
        &CleanupScope {
            bucket: Some("photos".to_owned()),
            prefix: None,
        },
        &CleanupScanOptions {
            min_size_bytes: None,
            older_than: None,
            max_results: 2,
        },
    )
    .await
    .expect("scanning a readable bucket must succeed");

    assert!(plan.candidates.len() <= 2, "the cap must be honoured");
    assert!(plan.summary.scanned_objects >= plan.candidates.len() as u64);

    for pair in plan.candidates.windows(2) {
        assert!(
            pair[0].last_modified <= pair[1].last_modified,
            "candidates must come back oldest first"
        );
    }
}
