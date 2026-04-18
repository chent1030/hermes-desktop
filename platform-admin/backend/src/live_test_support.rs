use std::env;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::audit::PgAuditStore;
use crate::auth::{
    AccountSeed, AuthPrincipal, LoginRequest, LoginResponse, PgAuthStore, TenantSeed,
    authenticate_login,
};
use crate::desktop::PgDesktopStore;

pub fn live_postgres_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn acquire_live_postgres_guard() -> MutexGuard<'static, ()> {
    live_postgres_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn live_database_url() -> String {
    env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured")
}

pub fn live_unique(prefix: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_millis();
    format!("{prefix}-{millis}")
}

pub fn ensure_live_platform_schema(database_url: &str) {
    PgAuthStore::new(database_url)
        .ensure_schema()
        .expect("auth schema should be created");
    PgDesktopStore::new(database_url)
        .ensure_schema()
        .expect("desktop schema should be created");
    PgAuditStore::new(database_url)
        .ensure_schema()
        .expect("audit schema should be created");
}

pub fn seed_live_tenant_admin(
    database_url: &str,
    tenant_code: &str,
    username: &str,
    password: &str,
) -> AuthPrincipal {
    PgAuthStore::new(database_url)
        .upsert_account_fixture(
            Some(&TenantSeed {
                code: tenant_code.to_string(),
                name: format!("Tenant {tenant_code}"),
                is_active: true,
            }),
            &AccountSeed {
                scope_type: "tenant".to_string(),
                username: username.to_string(),
                display_name: format!("Tenant Admin {username}"),
                password: password.to_string(),
                role_code: "tenant_admin".to_string(),
                is_active: true,
            },
        )
        .expect("tenant fixture should be seeded");

    let response = authenticate_login(
        &mut PgAuthStore::new(database_url),
        LoginRequest {
            tenant_code: tenant_code.to_string(),
            username: username.to_string(),
            password: password.to_string(),
        },
        &format!("tenant-salt-{tenant_code}"),
    )
    .expect("tenant login should succeed");

    principal_from_login_response(response)
}

pub fn seed_live_super_admin(database_url: &str, username: &str, password: &str) -> AuthPrincipal {
    PgAuthStore::new(database_url)
        .upsert_account_fixture(
            None,
            &AccountSeed {
                scope_type: "platform".to_string(),
                username: username.to_string(),
                display_name: format!("Platform Root {username}"),
                password: password.to_string(),
                role_code: "super_admin".to_string(),
                is_active: true,
            },
        )
        .expect("super admin fixture should be seeded");

    let response = authenticate_login(
        &mut PgAuthStore::new(database_url),
        LoginRequest {
            tenant_code: String::new(),
            username: username.to_string(),
            password: password.to_string(),
        },
        &format!("super-salt-{username}"),
    )
    .expect("super admin login should succeed");

    principal_from_login_response(response)
}

fn principal_from_login_response(response: LoginResponse) -> AuthPrincipal {
    AuthPrincipal {
        tenant: response.tenant,
        user: response.user,
        password_hash: String::new(),
    }
}
