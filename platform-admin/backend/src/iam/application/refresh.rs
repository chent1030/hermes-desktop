use crate::{
    auth::{AuthError, refresh_session},
    bootstrap::app_state::AppState,
    iam::{api::dto::RefreshRequest, domain::session::LoginSession},
    infrastructure::security::OpaqueTokenService,
};

pub async fn execute(state: AppState, request: RefreshRequest) -> Result<LoginSession, AuthError> {
    let database_url = state.config.database_url.clone();
    let session_salt = state.config.session_salt.clone();

    tokio::task::spawn_blocking(move || {
        let _tokens = OpaqueTokenService;
        let mut store = crate::iam::infrastructure::repository::IamRepository::new(database_url);
        refresh_session(store.store_mut(), request, &session_salt)
    })
    .await
    .expect("refresh task join")
}
