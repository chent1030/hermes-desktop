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
async fn unknown_routes_return_structured_not_found_with_request_id() {
    let state = AppState::for_tests(AppConfig::for_tests());
    let app = build_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/does-not-exist")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let request_id = response
        .headers()
        .get("x-request-id")
        .expect("request id header")
        .to_str()
        .unwrap()
        .to_string();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "route_not_found");
    assert_eq!(json["requestId"], request_id);
}
