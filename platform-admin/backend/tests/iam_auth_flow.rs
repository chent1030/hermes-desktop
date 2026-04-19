use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use platform_admin_backend::{
    auth::{AccountSeed, PgAuthStore},
    bootstrap::{app_state::AppState, config::AppConfig, router::build_router},
};
use serde_json::{Value, json};
use tower::ServiceExt;

pub struct TestHarness {
    pub app: axum::Router,
}

impl TestHarness {
    pub async fn seeded_admin() -> Self {
        let database_url = std::env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL");
        let seed_url = database_url.clone();
        tokio::task::spawn_blocking(move || {
            let store = PgAuthStore::new(seed_url);
            store.ensure_schema().expect("ensure auth schema");
            store
                .upsert_account_fixture(
                    None,
                    &AccountSeed {
                        scope_type: "platform".to_string(),
                        username: "root".to_string(),
                        display_name: "Platform Root".to_string(),
                        password: "Secret123!".to_string(),
                        role_code: "super_admin".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed admin account");
        })
        .await
        .expect("seed join");

        let mut config = AppConfig::for_tests();
        config.database_url = database_url;
        let state = AppState::with_pool(config).await.expect("pool");

        Self {
            app: build_router(state),
        }
    }

    pub async fn post_json(&self, uri: &str, payload: Value) -> axum::response::Response {
        self.app
            .clone()
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

    pub async fn get_with_bearer(&self, uri: &str, token: &str) -> axum::response::Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    pub async fn read_json(&self, response: axum::response::Response) -> Value {
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    pub async fn get(&self, uri: &str) -> axum::response::Response {
        self.app
            .clone()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn login_refresh_and_admin_me_flow_works_through_axum_router() {
    let harness = TestHarness::seeded_admin().await;

    let login = harness
        .post_json(
            "/api/auth/login",
            json!({
                "tenantCode": "",
                "username": "root",
                "password": "Secret123!"
            }),
        )
        .await;
    assert_eq!(login.status(), StatusCode::OK);

    let body = harness.read_json(login).await;
    let access_token = body["accessToken"].as_str().unwrap().to_string();
    let refresh_token = body["refreshToken"].as_str().unwrap().to_string();

    let me = harness
        .get_with_bearer("/api/admin/me", &access_token)
        .await;
    assert_eq!(me.status(), StatusCode::OK);

    let refresh = harness
        .post_json(
            "/api/auth/refresh",
            json!({
                "refreshToken": refresh_token
            }),
        )
        .await;
    assert_eq!(refresh.status(), StatusCode::OK);
}
