use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use platform_admin_backend::bootstrap::{
    app_state::AppState, config::AppConfig, router::build_router,
};
use serde_json::json;
use tower::ServiceExt;

async fn get(uri: &str) -> axum::response::Response {
    build_router(AppState::for_tests(AppConfig::for_tests()))
        .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn post_json(uri: &str, payload: serde_json::Value) -> axum::response::Response {
    build_router(AppState::for_tests(AppConfig::for_tests()))
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

#[tokio::test]
async fn router_nests_admin_and_desktop_planes_under_distinct_prefixes() {
    assert_eq!(
        get("/api/admin/me").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/admin/audit/events?tenantId=1&limit=1")
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/admin/sessions?tenantId=1&limit=1").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/admin/tenant/audit/events?limit=1").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/admin/tenant/sessions?limit=1").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/desktop/bootstrap").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/desktop/model-profiles").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/desktop/skills/catalog").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/audit/health").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        post_json("/api/audit/events:batch", json!({ "events": [] }))
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get("/api/unknown-plane/ping").await.status(),
        StatusCode::NOT_FOUND
    );
}
