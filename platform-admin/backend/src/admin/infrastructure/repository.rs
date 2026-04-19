use sqlx::{PgPool, Row};

use crate::{
    admin::domain::{
        account::{AdminAccountRecord, CreateAccountCommand},
        error::AdminError,
        model_profile::{CreateModelProfileCommand, ModelProfileRecord},
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

    pub async fn list_model_profiles(
        &self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<ModelProfileRecord>, AdminError> {
        let rows = if let Some(tenant_id) = tenant_id {
            sqlx::query(
                r#"
                SELECT
                    m.id,
                    m.tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    m.provider,
                    m.model,
                    m.label,
                    m.base_url,
                    m.is_default,
                    m.is_active
                FROM platform_desktop_model_profiles m
                LEFT JOIN platform_admin_tenants t ON t.id = m.tenant_id
                WHERE m.tenant_id = $1
                ORDER BY m.is_default DESC, m.id ASC
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
                    m.id,
                    m.tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    m.provider,
                    m.model,
                    m.label,
                    m.base_url,
                    m.is_default,
                    m.is_active
                FROM platform_desktop_model_profiles m
                LEFT JOIN platform_admin_tenants t ON t.id = m.tenant_id
                WHERE m.tenant_id IS NULL
                ORDER BY m.is_default DESC, m.id ASC
                "#,
            )
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_error)?
        };

        Ok(rows.into_iter().map(row_to_model_profile).collect())
    }

    pub async fn create_model_profile(
        &self,
        id: String,
        input: CreateModelProfileCommand,
    ) -> Result<ModelProfileRecord, AdminError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx_error)?;

        if input.is_default {
            sqlx::query(
                r#"
                UPDATE platform_desktop_model_profiles
                SET is_default = FALSE,
                    updated_at = NOW()
                WHERE (($1::bigint IS NULL AND tenant_id IS NULL) OR tenant_id = $1)
                  AND is_active = TRUE
                "#,
            )
            .bind(input.tenant_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_error)?;
        }

        let row = sqlx::query(
            r#"
            INSERT INTO platform_desktop_model_profiles (
                id,
                tenant_id,
                provider,
                model,
                label,
                base_url,
                is_default,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
            RETURNING id, tenant_id, provider, model, label, base_url, is_default, is_active
            "#,
        )
        .bind(&id)
        .bind(input.tenant_id)
        .bind(input.normalized_provider())
        .bind(input.normalized_model())
        .bind(input.normalized_label())
        .bind(input.normalized_base_url())
        .bind(input.is_default)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_write_error)?;

        tx.commit().await.map_err(map_sqlx_error)?;

        let tenant = if let Some(tenant_id) = input.tenant_id {
            self.find_tenant(tenant_id).await?.map(|tenant| AuthTenant {
                id: tenant.id,
                code: tenant.code,
                name: tenant.name,
                is_active: tenant.is_active,
            })
        } else {
            None
        };

        Ok(ModelProfileRecord {
            id: row.get("id"),
            scope_type: if input.tenant_id.is_some() {
                "tenant".to_string()
            } else {
                "global".to_string()
            },
            tenant,
            provider: row.get("provider"),
            model: row.get("model"),
            label: row.get("label"),
            base_url: row.get("base_url"),
            is_default: row.get("is_default"),
            is_active: row.get("is_active"),
        })
    }

    pub async fn find_model_profile(
        &self,
        model_id: &str,
    ) -> Result<Option<ModelProfileRecord>, AdminError> {
        let row = sqlx::query(
            r#"
            SELECT
                m.id,
                m.tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                t.is_active AS tenant_is_active,
                m.provider,
                m.model,
                m.label,
                m.base_url,
                m.is_default,
                m.is_active
            FROM platform_desktop_model_profiles m
            LEFT JOIN platform_admin_tenants t ON t.id = m.tenant_id
            WHERE m.id = $1
            "#,
        )
        .bind(model_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_error)?;

        Ok(row.map(row_to_model_profile))
    }

    pub async fn deactivate_model_profile(&self, model_id: &str) -> Result<(), AdminError> {
        sqlx::query(
            r#"
            UPDATE platform_desktop_model_profiles
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(model_id)
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

fn row_to_model_profile(row: sqlx::postgres::PgRow) -> ModelProfileRecord {
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

    ModelProfileRecord {
        id: row.get("id"),
        scope_type: if tenant_id.is_some() {
            "tenant".to_string()
        } else {
            "global".to_string()
        },
        tenant,
        provider: row.get("provider"),
        model: row.get("model"),
        label: row.get("label"),
        base_url: row.get("base_url"),
        is_default: row.get("is_default"),
        is_active: row.get("is_active"),
    }
}
