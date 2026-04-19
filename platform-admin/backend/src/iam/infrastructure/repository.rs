use crate::auth::PgAuthStore;

#[derive(Debug, Clone)]
pub struct IamRepository {
    store: PgAuthStore,
}

impl IamRepository {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            store: PgAuthStore::new(database_url),
        }
    }

    pub fn store_mut(&mut self) -> &mut PgAuthStore {
        &mut self.store
    }
}
