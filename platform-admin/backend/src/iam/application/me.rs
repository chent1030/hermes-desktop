use crate::{
    auth::{AuthError, authenticate_access_token},
    bootstrap::app_state::AppState,
    iam::domain::principal::AuthContext,
};

pub async fn execute(state: AppState, access_token: String) -> Result<AuthContext, AuthError> {
    let database_url = state.config.database_url.clone();

    tokio::task::spawn_blocking(move || {
        let mut store = crate::iam::infrastructure::repository::IamRepository::new(database_url);
        authenticate_access_token(store.store_mut(), &access_token)
    })
    .await
    .expect("me task join")
}
