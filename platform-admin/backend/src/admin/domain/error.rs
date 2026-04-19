use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdminError {
    InvalidRequest(String),
    Forbidden(String),
    Conflict(String),
    NotFound(String),
    Store(String),
}

impl AdminError {
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::Forbidden(message.into())
    }
}

impl Display for AdminError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message)
            | Self::Forbidden(message)
            | Self::Conflict(message)
            | Self::NotFound(message)
            | Self::Store(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AdminError {}
