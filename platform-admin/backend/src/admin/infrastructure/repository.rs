use sqlx::{PgPool, Row};

use crate::{
    admin::domain::{
        account::{AdminAccountRecord, CreateAccountCommand},
        error::AdminError,
        tenant::{CreateTenantCommand, TenantRecord},
    },
    auth::{AuthTenant, hash_password},
    bootstrap::app_state::AppState,
};

#[derive(Debug, Clone)]
pub struct AdminRepository {
    pool: PgPool,
}

impl AdminRepository {
    pub fn from_state(state: &AppState) -> Result<Self, AdminError> {
        let pool = state.pool.as_ref().cloned().ok_or(AdminError::Store(
            "database pool is not configured".to_string(),
        ))?;
        Ok(Self { pool })
    }

    pub async fn list_tenants(&self) -> Result<Vec<TenantRecord>, AdminError> {
        let rows = sqlx::query(
            r#"
            SELECT id, code, name, is_active
            FROM platform_admin_tenants
            ORDER BY id DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(rows.into_iter().map(row_to_tenant).collect())
    }

    pub async fn create_tenant(
        &self,
        input: CreateTenantCommand,
    ) -> Result<TenantRecord, AdminError> {
        let row = sqlx::query(
            r#"
            INSERT INTO platform_admin_tenants (code, name, is_active)
            VALUES ($1, $2, TRUE)
            RETURNING id, code, name, is_active
            "#,
        )
        .bind(input.normalized_code())
        .bind(input.normalized_name())
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_write_error)?;

        Ok(row_to_tenant(row))
    }

    pub async fn find_tenant(&self, tenant_id: i64) -> Result<Option<TenantRecord>, AdminError> {
        let row = sqlx::query(
            r#"
            SELECT id, code, name, is_active
            FROM platform_admin_tenants
            WHERE id = $1
            "#,
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(row.map(row_to_tenant))
    }

    pub async fn list_accounts(
        &self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<AdminAccountRecord>, AdminError> {
        let rows = if let Some(tenant_id) = tenant_id {
            sqlx::query(
                r#"
                SELECT
                    a.id AS account_id,
                    a.scope_type,
                    t.id AS tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    a.username,
                    a.display_name,
                    a.role_code,
                    a.is_active AS account_is_active
                FROM platform_admin_accounts a
                LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
                WHERE a.tenant_id = $1
                ORDER BY a.id DESC
                "#,
            )
            .bind(tenant_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?
        } else {
            sqlx::query(
                r#"
                SELECT
                    a.id AS account_id,
                    a.scope_type,
                    t.id AS tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    a.username,
                    a.display_name,
                    a.role_code,
                    a.is_active AS account_is_active
                FROM platform_admin_accounts a
                LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
                WHERE a.scope_type = 'tenant'
                ORDER BY a.id DESC
                "#,
            )
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?
        };

        Ok(rows.into_iter().map(row_to_account).collect())
    }

    pub async fn create_account(
        &self,
        scope_type: &str,
        tenant_id: Option<i64>,
        input: CreateAccountCommand,
    ) -> Result<AdminAccountRecord, AdminError> {
        let row = sqlx::query(
            r#"
            INSERT INTO platform_admin_accounts (
                scope_type,
                tenant_id,
                username,
                display_name,
                password_hash,
                role_code,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            RETURNING id AS account_id
            "#,
        )
        .bind(scope_type)
        .bind(tenant_id)
        .bind(input.normalized_username())
        .bind(input.normalized_display_name())
        .bind(hash_password(&input.password))
        .bind(input.role_code.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_write_error)?;

        let account_id: i64 = row.get("account_id");
        self.find_account(account_id)
            .await?
            .ok_or(AdminError::NotFound("account not found".to_string()))
    }

    pub async fn find_account(
        &self,
        account_id: i64,
    ) -> Result<Option<AdminAccountRecord>, AdminError> {
        let row = sqlx::query(
            r#"
            SELECT
                a.id AS account_id,
                a.scope_type,
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                t.is_active AS tenant_is_active,
                a.username,
                a.display_name,
                a.role_code,
                a.is_active AS account_is_active
            FROM platform_admin_accounts a
            LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
            WHERE a.id = $1
            "#,
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(row.map(row_to_account))
    }

    pub async fn deactivate_tenant(&self, tenant_id: i64) -> Result<(), AdminError> {
        sqlx::query(
            r#"
            UPDATE platform_admin_tenants
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(tenant_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    pub async fn deactivate_account(&self, account_id: i64) -> Result<(), AdminError> {
        sqlx::query(
            r#"
            UPDATE platform_admin_accounts
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(account_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(())
    }

    pub async fn count_active_platform_super_admin(&self) -> Result<i64, AdminError> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*)::BIGINT AS count
            FROM platform_admin_accounts
            WHERE scope_type = 'platform'
              AND role_code = 'super_admin'
              AND is_active = TRUE
            "#,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
        Ok(row.get("count"))
    }
}

fn map_sqlx_error(error: sqlx::Error) -> AdminError {
    AdminError::Store(error.to_string())
}

fn map_sqlx_write_error(error: sqlx::Error) -> AdminError {
    if let sqlx::Error::Database(database_error) = &error
        && database_error.code().as_deref() == Some("23505")
    {
        return AdminError::Conflict("resource already exists".to_string());
    }
    map_sqlx_error(error)
}

fn row_to_tenant(row: sqlx::postgres::PgRow) -> TenantRecord {
    TenantRecord {
        id: row.get("id"),
        code: row.get("code"),
        name: row.get("name"),
        is_active: row.get("is_active"),
    }
}

fn row_to_account(row: sqlx::postgres::PgRow) -> AdminAccountRecord {
    let tenant_id: Option<i64> = row.get("tenant_id");
    let tenant = tenant_id.map(|id| AuthTenant {
        id,
        code: row
            .get::<Option<String>, _>("tenant_code")
            .unwrap_or_default(),
        name: row
            .get::<Option<String>, _>("tenant_name")
            .unwrap_or_default(),
        is_active: row
            .get::<Option<bool>, _>("tenant_is_active")
            .unwrap_or(false),
    });

    AdminAccountRecord {
        id: row.get("account_id"),
        scope_type: row.get("scope_type"),
        tenant,
        username: row.get("username"),
        display_name: row.get("display_name"),
        role_code: row.get("role_code"),
        is_active: row.get("account_is_active"),
    }
}
