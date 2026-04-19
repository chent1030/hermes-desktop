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

struct SkillCatalogHarness {
    app: axum::Router,
    tenant_code: Option<String>,
    username: String,
    password: String,
    skill_id: Option<String>,
}

impl SkillCatalogHarness {
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

        Self::new(database_url, None, username, password, None).await
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

        Self::new(database_url, Some(tenant_code), username, password, None).await
    }

    async fn seeded_tenant_admin_with_tenant_skill() -> Self {
        let database_url = live_database_url();
        let tenant_code = live_unique("tenant");
        let username = live_unique("tenant-admin");
        let password = "Secret123!".to_string();
        let skill_id = live_unique("skl");
        let skill_name = live_unique("tenant-skill");
        let seed_url = database_url.clone();
        let seed_tenant_code = tenant_code.clone();
        let seed_username = username.clone();
        let seed_password = password.clone();
        let seed_skill_id = skill_id.clone();
        let seed_skill_name = skill_name.clone();

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
                        username: seed_username,
                        display_name: "Tenant Admin".to_string(),
                        password: seed_password,
                        role_code: "tenant_admin".to_string(),
                        is_active: true,
                    },
                )
                .expect("seed tenant admin");

            let mut client =
                postgres::Client::connect(&seed_url, postgres::NoTls).expect("connect postgres");
            let tenant_id: i64 = client
                .query_one(
                    "SELECT id FROM platform_admin_tenants WHERE code = $1",
                    &[&seed_tenant_code],
                )
                .expect("tenant row")
                .get("id");
            client
                .execute(
                    r#"
                    INSERT INTO platform_desktop_skill_catalog (
                        id,
                        scope,
                        tenant_id,
                        name,
                        version,
                        description,
                        download_url,
                        is_active
                    )
                    VALUES ($1, 'tenant', $2, $3, '1.0.0', 'Tenant scoped skill', $4, TRUE)
                    "#,
                    &[
                        &seed_skill_id,
                        &tenant_id,
                        &seed_skill_name,
                        &format!("https://example.com/{seed_skill_id}.zip"),
                    ],
                )
                .expect("seed tenant skill");
        })
        .await
        .expect("seed join");

        Self::new(
            database_url,
            Some(tenant_code),
            username,
            password,
            Some(skill_id),
        )
        .await
    }

    async fn new(
        database_url: String,
        tenant_code: Option<String>,
        username: String,
        password: String,
        skill_id: Option<String>,
    ) -> Self {
        let mut config = AppConfig::for_tests();
        config.database_url = database_url;
        let state = AppState::with_pool(config).await.expect("pool");

        Self {
            app: build_router(state),
            tenant_code,
            username,
            password,
            skill_id,
        }
    }

    fn skill_id(&self) -> &str {
        self.skill_id.as_deref().expect("skill id should be seeded")
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
async fn super_admin_can_create_global_skill_catalog_item_over_http() {
    let harness = SkillCatalogHarness::seeded_super_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/skills/catalog",
            &access_token,
            json!({
                "tenantId": null,
                "name": live_unique("code-review"),
                "version": "1.0.0",
                "description": "Review code",
                "downloadUrl": "https://example.com/code-review.zip"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_cannot_create_global_skill_catalog_item_over_http() {
    let harness = SkillCatalogHarness::seeded_tenant_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenant/skills/catalog",
            &access_token,
            json!({
                "tenantId": null,
                "name": live_unique("global-ocr"),
                "version": "1.0.0",
                "description": "OCR",
                "downloadUrl": "https://example.com/ocr.zip"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn tenant_admin_can_only_deactivate_skill_catalog_items_inside_their_tenant() {
    let harness = SkillCatalogHarness::seeded_tenant_admin_with_tenant_skill().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            &format!(
                "/api/admin/tenant/skills/catalog/{}/deactivate",
                harness.skill_id()
            ),
            &access_token,
            json!({}),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}
