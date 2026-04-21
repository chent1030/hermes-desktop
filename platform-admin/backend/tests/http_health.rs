use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use platform_admin_backend::bootstrap::{
    app_state::AppState, config::AppConfig, router::build_router,
};
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn health_and_readiness_routes_return_json() {
    let state = AppState::for_tests(AppConfig::for_tests());
    let app = build_router(state);

    let health = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);

    let health_body = to_bytes(health.into_body(), usize::MAX).await.unwrap();
    let health_json: Value = serde_json::from_slice(&health_body).unwrap();
    assert_eq!(health_json["status"], "ok");

    let ready = app
        .oneshot(
            Request::builder()
                .uri("/api/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);

    let ready_body = to_bytes(ready.into_body(), usize::MAX).await.unwrap();
    let ready_json: Value = serde_json::from_slice(&ready_body).unwrap();
    assert_eq!(ready_json["status"], "ok");
}

#[tokio::test]
async fn readiness_route_checks_database_connectivity() {
    let mut config = AppConfig::for_tests();
    config.database_url = std::env::var("ADMIN_DATABASE_URL").unwrap_or_else(|_| {
        "postgres://postgres:postgres@localhost:5432/manager_admin".to_string()
    });
    let state = AppState::with_pool(config).await.expect("test pool");
    let app = build_router(state);

    let ready = app
        .oneshot(
            Request::builder()
                .uri("/api/ready")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);
}

#[tokio::test]
async fn cors_preflight_is_supported_for_admin_routes() {
    let state = AppState::for_tests(AppConfig::for_tests());
    let app = build_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("OPTIONS")
                .uri("/api/admin/me")
                .header("origin", "http://127.0.0.1:4173")
                .header("access-control-request-method", "GET")
                .header("access-control-request-headers", "authorization")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .unwrap(),
        "*"
    );
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-headers")
            .unwrap(),
        "content-type,authorization"
    );
}
