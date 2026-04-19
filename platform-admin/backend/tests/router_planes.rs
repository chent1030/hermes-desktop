use axum::http::StatusCode;

use crate::iam_auth_flow::TestHarness;

mod iam_auth_flow;

#[tokio::test]
async fn router_nests_admin_and_desktop_planes_under_distinct_prefixes() {
    let harness = TestHarness::seeded_admin().await;

    assert_eq!(
        harness.get("/api/admin/me").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness.get("/api/desktop/bootstrap").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness.get("/api/unknown-plane/ping").await.status(),
        StatusCode::NOT_FOUND
    );
}
