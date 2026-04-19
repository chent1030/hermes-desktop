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
        harness
            .get("/api/admin/audit/events?tenantId=1&limit=1")
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness
            .get("/api/admin/sessions?tenantId=1&limit=1")
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness
            .get("/api/admin/tenant/audit/events?limit=1")
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness
            .get("/api/admin/tenant/sessions?limit=1")
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness.get("/api/desktop/bootstrap").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness.get("/api/desktop/model-profiles").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness.get("/api/desktop/skills/catalog").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        harness.get("/api/unknown-plane/ping").await.status(),
        StatusCode::NOT_FOUND
    );
}
