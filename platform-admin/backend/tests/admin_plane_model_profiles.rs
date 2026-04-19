use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use platform_admin_backend::{
    auth::{AccountSeed, PgAuthStore, TenantSeed},
    bootstrap::{app_state::AppState, config::AppConfig, router::build_router},
    desktop::PgDesktopStore,
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
    PgDesktopStore::new(database_url)
        .ensure_schema()
        .expect("desktop schema should be created");
}

struct ModelProfileHarness {
    app: axum::Router,
    tenant_code: Option<String>,
    username: String,
    password: String,
}

impl ModelProfileHarness {
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

        Self::new(database_url, None, username, password).await
    }

    async fn seeded_tenant_admin() -> Self {
        let (harness, _tenant_id) = Self::seeded_tenant_admin_with_tenant().await;
        harness
    }

    async fn seeded_tenant_admin_with_tenant() -> (Self, i64) {
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

        let tenant_id = find_tenant_id(&database_url, &tenant_code).await;
        let harness = Self::new(database_url, Some(tenant_code), username, password).await;

        (harness, tenant_id)
    }

    async fn seeded_super_admin_with_tenant() -> (Self, i64) {
        let database_url = live_database_url();
        let username = live_unique("super-admin");
        let password = "Secret123!".to_string();
        let tenant_code = live_unique("tenant");
        let seed_url = database_url.clone();
        let seed_username = username.clone();
        let seed_password = password.clone();
        let seed_tenant_code = tenant_code.clone();

        tokio::task::spawn_blocking(move || {
            let _guard = acquire_live_postgres_guard();
            ensure_live_platform_schema(&seed_url);
            let store = PgAuthStore::new(&seed_url);
            store
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
            store
                .upsert_account_fixture(
                    Some(&TenantSeed {
                        code: seed_tenant_code.clone(),
                        name: format!("Tenant {seed_tenant_code}"),
                        is_active: true,
                    }),
                    &AccountSeed {
                        scope_type: "tenant".to_string(),
                        username: live_unique("tenant-user"),
                        display_name: "Tenant User".to_string(),
                        password: "Secret123!".to_string(),
                        role_code: "tenant_user".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed tenant");
        })
        .await
        .expect("seed join");

        let tenant_id = find_tenant_id(&database_url, &tenant_code).await;
        let harness = Self::new(database_url, None, username, password).await;

        (harness, tenant_id)
    }

    async fn new(
        database_url: String,
        tenant_code: Option<String>,
        username: String,
        password: String,
    ) -> Self {
        let mut config = AppConfig::for_tests();
        config.database_url = database_url;
        let state = AppState::with_pool(config).await.expect("pool");

        Self {
            app: build_router(state),
            tenant_code,
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

    async fn get_with_bearer(&self, uri: &str, token: &str) -> axum::response::Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
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

    async fn read_json(&self, response: axum::response::Response) -> Value {
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }
}

async fn find_tenant_id(database_url: &str, tenant_code: &str) -> i64 {
    let pool = sqlx::PgPool::connect(database_url).await.expect("pool");
    let row = sqlx::query(
        r#"
        SELECT id
        FROM platform_admin_tenants
        WHERE code = $1
        "#,
    )
    .bind(tenant_code)
    .fetch_one(&pool)
    .await
    .expect("tenant row");

    row.get("id")
}

async fn seeded_super_and_tenant_harnesses() -> (ModelProfileHarness, ModelProfileHarness, i64) {
    let database_url = live_database_url();
    let super_username = live_unique("super-admin");
    let tenant_code = live_unique("tenant");
    let tenant_username = live_unique("tenant-admin");
    let password = "Secret123!".to_string();
    let seed_url = database_url.clone();
    let seed_super_username = super_username.clone();
    let seed_tenant_code = tenant_code.clone();
    let seed_tenant_username = tenant_username.clone();
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
                    username: seed_tenant_username,
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

    let tenant_id = find_tenant_id(&database_url, &tenant_code).await;
    let super_harness =
        ModelProfileHarness::new(database_url.clone(), None, super_username, password.clone())
            .await;
    let tenant_harness =
        ModelProfileHarness::new(database_url, Some(tenant_code), tenant_username, password).await;

    (super_harness, tenant_harness, tenant_id)
}

#[tokio::test]
async fn super_admin_can_create_global_default_model_profile_over_http() {
    let harness = ModelProfileHarness::seeded_super_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &access_token,
            json!({
                "tenantId": null,
                "provider": "openai",
                "model": live_unique("gpt-5-4"),
                "label": live_unique("GPT-5.4"),
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_cannot_create_global_model_profile_over_http() {
    let harness = ModelProfileHarness::seeded_tenant_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenant/model-profiles",
            &access_token,
            json!({
                "tenantId": null,
                "provider": "openai",
                "model": live_unique("gpt-5-4-mini"),
                "label": live_unique("GPT-5.4 Mini"),
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn creating_new_default_model_clears_previous_default_in_same_scope() {
    let (harness, tenant_id) = ModelProfileHarness::seeded_super_admin_with_tenant().await;
    let access_token = harness.login().await;
    let first_model = live_unique("gpt-4-1");
    let second_model = live_unique("gpt-5-4");

    let first_response = harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &access_token,
            json!({
                "tenantId": tenant_id,
                "provider": "openai",
                "model": first_model.clone(),
                "label": "GPT-4.1",
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;
    assert_eq!(first_response.status(), StatusCode::OK);

    let second_response = harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &access_token,
            json!({
                "tenantId": tenant_id,
                "provider": "openai",
                "model": second_model.clone(),
                "label": "GPT-5.4",
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;
    assert_eq!(second_response.status(), StatusCode::OK);

    let list = harness
        .get_with_bearer(
            &format!("/api/admin/model-profiles?tenantId={tenant_id}"),
            &access_token,
        )
        .await;
    assert_eq!(list.status(), StatusCode::OK);
    let payload = harness.read_json(list).await;

    let defaults: Vec<&Value> = payload
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["isDefault"] == json!(true))
        .collect();

    assert_eq!(defaults.len(), 1);
    assert_eq!(defaults[0]["model"], json!(second_model));
}

#[tokio::test]
async fn desktop_model_delivery_includes_configured_api_key() {
    let (super_harness, tenant_harness, tenant_id) = seeded_super_and_tenant_harnesses().await;
    let super_token = super_harness.login().await;
    let tenant_token = tenant_harness.login().await;

    let create_response = super_harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &super_token,
            json!({
                "tenantId": tenant_id,
                "provider": "openai",
                "model": live_unique("gpt-5-4"),
                "label": "GPT-5.4 Tenant",
                "baseUrl": "https://api.openai.com/v1",
                "apiKey": "sk-platform-tenant",
                "isDefault": true
            }),
        )
        .await;
    assert_eq!(create_response.status(), StatusCode::OK);

    let desktop_models = tenant_harness
        .get_with_bearer("/api/desktop/model-profiles", &tenant_token)
        .await;
    assert_eq!(desktop_models.status(), StatusCode::OK);

    let payload = tenant_harness.read_json(desktop_models).await;
    assert_eq!(payload["items"][0]["apiKey"], json!("sk-platform-tenant"));
}
