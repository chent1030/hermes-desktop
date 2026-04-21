use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use platform_admin_backend::{
    auth::{AccountSeed, PgAuthStore, TenantSeed},
    bootstrap::{app_state::AppState, config::AppConfig, router::build_router},
};
use serde_json::{Value, json};
use sqlx::Row;
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
    async fn seeded_tenant_admin_with_user() -> (Self, i64) {
        let database_url = live_database_url();
        let tenant_code = live_unique("tenant");
        let admin_username = live_unique("tenant-admin");
        let user_username = live_unique("tenant-user");
        let password = "Secret123!".to_string();
        let seed_url = database_url.clone();
        let seed_tenant_code = tenant_code.clone();
        let seed_admin_username = admin_username.clone();
        let seed_user_username = user_username.clone();
        let seed_password = password.clone();
        tokio::task::spawn_blocking(move || {
            let _guard = acquire_live_postgres_guard();
            ensure_live_platform_schema(&seed_url);
            let store = PgAuthStore::new(&seed_url);
            store
                .upsert_account_fixture(
                    Some(&TenantSeed {
                        code: seed_tenant_code.clone(),
                        name: format!("Tenant {seed_tenant_code}"),
                        is_active: true,
                    }),
                    &AccountSeed {
                        scope_type: "tenant".to_string(),
                        username: seed_admin_username,
                        display_name: "Tenant Admin".to_string(),
                        password: seed_password.clone(),
                        role_code: "tenant_admin".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed tenant admin");
            store
                .upsert_account_fixture(
                    Some(&TenantSeed {
                        code: seed_tenant_code,
                        name: "Tenant User".to_string(),
                        is_active: true,
                    }),
                    &AccountSeed {
                        scope_type: "tenant".to_string(),
                        username: seed_user_username,
                        display_name: "Tenant User".to_string(),
                        password: seed_password,
                        role_code: "tenant_user".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed tenant user");
        })
        .await
        .expect("seed join");

        let pool = sqlx::PgPool::connect(&database_url).await.expect("pool");
        let row = sqlx::query(
            r#"
            SELECT a.id
            FROM platform_admin_accounts a
            INNER JOIN platform_admin_tenants t ON t.id = a.tenant_id
            WHERE t.code = $1 AND a.username = $2
            "#,
        )
        .bind(&tenant_code)
        .bind(&user_username)
        .fetch_one(&pool)
        .await
        .expect("tenant user row");
        let user_id: i64 = row.get("id");

        let mut config = AppConfig::for_tests();
        config.database_url = database_url.clone();
        let state = AppState::with_pool(config).await.expect("pool");

        (
            Self {
                app: build_router(state),
                tenant_code: Some(tenant_code),
                username: admin_username,
                password,
            },
            user_id,
        )
    }

    async fn seeded_super_admin_with_tenant_user() -> (Self, i64) {
        let database_url = live_database_url();
        let super_username = live_unique("super-admin");
        let tenant_code = live_unique("tenant");
        let user_username = live_unique("tenant-user");
        let password = "Secret123!".to_string();
        let seed_url = database_url.clone();
        let seed_super_username = super_username.clone();
        let seed_tenant_code = tenant_code.clone();
        let seed_user_username = user_username.clone();
        let seed_password = password.clone();
        tokio::task::spawn_blocking(move || {
            let _guard = acquire_live_postgres_guard();
            ensure_live_platform_schema(&seed_url);
            let store = PgAuthStore::new(&seed_url);
            store
                .upsert_account_fixture(
                    None,
                    &AccountSeed {
                        scope_type: "platform".to_string(),
                        username: seed_super_username,
                        display_name: "Platform Root".to_string(),
                        password: seed_password.clone(),
                        role_code: "super_admin".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed super admin");
            store
                .upsert_account_fixture(
                    Some(&TenantSeed {
                        code: seed_tenant_code.clone(),
                        name: format!("Tenant {seed_tenant_code}"),
                        is_active: true,
                    }),
                    &AccountSeed {
                        scope_type: "tenant".to_string(),
                        username: seed_user_username,
                        display_name: "Tenant User".to_string(),
                        password: seed_password,
                        role_code: "tenant_user".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed tenant user");
        })
        .await
        .expect("seed join");

        let pool = sqlx::PgPool::connect(&database_url).await.expect("pool");
        let row = sqlx::query(
            r#"
            SELECT a.id
            FROM platform_admin_accounts a
            INNER JOIN platform_admin_tenants t ON t.id = a.tenant_id
            WHERE t.code = $1 AND a.username = $2
            "#,
        )
        .bind(&tenant_code)
        .bind(&user_username)
        .fetch_one(&pool)
        .await
        .expect("tenant user row");
        let user_id: i64 = row.get("id");

        let mut config = AppConfig::for_tests();
        config.database_url = database_url;
        let state = AppState::with_pool(config).await.expect("pool");

        (
            Self {
                app: build_router(state),
                tenant_code: None,
                username: super_username,
                password,
            },
            user_id,
        )
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

    async fn post_with_bearer(&self, uri: &str, token: &str) -> axum::response::Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn super_admin_can_deactivate_tenant_user_over_http() {
    let (harness, account_id) = AdminHarness::seeded_super_admin_with_tenant_user().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            &format!("/api/admin/accounts/{account_id}/deactivate"),
            &access_token,
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_can_deactivate_tenant_user_inside_their_tenant() {
    let (harness, account_id) = AdminHarness::seeded_tenant_admin_with_user().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            &format!("/api/admin/tenant/accounts/{account_id}/deactivate"),
            &access_token,
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}
