use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use platform_admin_backend::{
    auth::{AccountSeed, PgAuthStore, TenantSeed},
    bootstrap::{app_state::AppState, config::AppConfig, router::build_router},
};
use serde_json::{Value, json};
use std::{
    env,
    sync::{Mutex, MutexGuard, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tower::ServiceExt;

fn live_postgres_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn acquire_live_postgres_guard() -> MutexGuard<'static, ()> {
    live_postgres_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn live_database_url() -> String {
    env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured")
}

fn live_unique(prefix: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_millis();
    format!("{prefix}-{millis}")
}

fn ensure_live_platform_schema(database_url: &str) {
    PgAuthStore::new(database_url)
        .ensure_schema()
        .expect("auth schema should be created");
}

struct AdminHarness {
    app: axum::Router,
    tenant_code: Option<String>,
    username: String,
    password: String,
}

impl AdminHarness {
    async fn seeded_super_admin() -> Self {
        let database_url = live_database_url();
        let username = live_unique("super-admin");
        let password = "Secret123!".to_string();
        let seed_url = database_url.clone();
        let seed_username = username.clone();
        let seed_password = password.clone();
        tokio::task::spawn_blocking(move || {
            let _guard = acquire_live_postgres_guard();
            ensure_live_platform_schema(&seed_url);
            PgAuthStore::new(&seed_url)
                .upsert_account_fixture(
                    None,
                    &AccountSeed {
                        scope_type: "platform".to_string(),
                        username: seed_username,
                        display_name: "Platform Root".to_string(),
                        password: seed_password,
                        role_code: "super_admin".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed super admin");
        })
        .await
        .expect("seed join");

        let mut config = AppConfig::for_tests();
        config.database_url = database_url.clone();
        let state = AppState::with_pool(config).await.expect("pool");

        Self {
            app: build_router(state),
            tenant_code: None,
            username,
            password,
        }
    }

    async fn seeded_tenant_admin() -> Self {
        let database_url = live_database_url();
        let tenant_code = live_unique("tenant");
        let username = live_unique("tenant-admin");
        let password = "Secret123!".to_string();
        let seed_url = database_url.clone();
        let seed_tenant_code = tenant_code.clone();
        let seed_username = username.clone();
        let seed_password = password.clone();
        tokio::task::spawn_blocking(move || {
            let _guard = acquire_live_postgres_guard();
            ensure_live_platform_schema(&seed_url);
            PgAuthStore::new(&seed_url)
                .upsert_account_fixture(
                    Some(&TenantSeed {
                        code: seed_tenant_code.clone(),
                        name: format!("Tenant {seed_tenant_code}"),
                        is_active: true,
                    }),
                    &AccountSeed {
                        scope_type: "tenant".to_string(),
                        username: seed_username,
                        display_name: "Tenant Admin".to_string(),
                        password: seed_password,
                        role_code: "tenant_admin".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed tenant admin");
        })
        .await
        .expect("seed join");

        let mut config = AppConfig::for_tests();
        config.database_url = database_url.clone();
        let state = AppState::with_pool(config).await.expect("pool");

        Self {
            app: build_router(state),
            tenant_code: Some(tenant_code),
            username,
            password,
        }
    }

    async fn login(&self) -> String {
        let response = self
            .app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "tenantCode": self.tenant_code.clone().unwrap_or_default(),
                            "username": self.username,
                            "password": self.password,
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: Value = serde_json::from_slice(&body).unwrap();
        json["accessToken"].as_str().unwrap().to_string()
    }

    async fn post_with_bearer(
        &self,
        uri: &str,
        token: &str,
        payload: Value,
    ) -> axum::response::Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn super_admin_can_create_tenant_over_http() {
    let harness = AdminHarness::seeded_super_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenants",
            &access_token,
            json!({
                "code": live_unique("acme"),
                "name": "Acme"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_cannot_create_tenant_admin_over_http() {
    let harness = AdminHarness::seeded_tenant_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenant/accounts",
            &access_token,
            json!({
                "username": live_unique("next-admin"),
                "displayName": "Next Admin",
                "password": "Secret123!",
                "roleCode": "tenant_admin"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
