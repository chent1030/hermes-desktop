use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use platform_admin_backend::bootstrap::{
    app_state::AppState,
    config::AppConfig,
    router::build_router,
};
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn health_and_readiness_routes_return_json() {
    let state = AppState::for_tests(AppConfig::for_tests());
    let app = build_router(state);

    let health = app
        .clone()
        .oneshot(Request::builder().uri("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);

    let health_body = to_bytes(health.into_body(), usize::MAX).await.unwrap();
    let health_json: Value = serde_json::from_slice(&health_body).unwrap();
    assert_eq!(health_json["status"], "ok");

    let ready = app
        .oneshot(Request::builder().uri("/api/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);

    let ready_body = to_bytes(ready.into_body(), usize::MAX).await.unwrap();
    let ready_json: Value = serde_json::from_slice(&ready_body).unwrap();
    assert_eq!(ready_json["status"], "ok");
}
