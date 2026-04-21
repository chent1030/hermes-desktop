use super::error::ApiError;

pub type AppResult<T> = Result<T, ApiError>;
