use axum::{
    Json,
    http::{HeaderValue, StatusCode, header::HeaderName},
    response::{IntoResponse, Response},
};
use serde::Serialize;

use super::ids::RequestId;

const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEnvelope {
    pub code: &'static str,
    pub message: String,
    pub request_id: String,
    pub retryable: bool,
}

#[derive(Debug, Clone)]
pub struct ApiError {
    status: StatusCode,
    envelope: ErrorEnvelope,
}

impl ApiError {
    pub fn not_found(code: &'static str, request_id: RequestId) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            envelope: ErrorEnvelope {
                code,
                message: "Route not found".to_string(),
                request_id: request_id.into_string(),
                retryable: false,
            },
        }
    }

    pub fn missing_authorization() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            envelope: ErrorEnvelope {
                code: "missing_authorization",
                message: "authorization header is required".to_string(),
                request_id: RequestId::new().into_string(),
                retryable: false,
            },
        }
    }

    pub fn from_auth_error(error: crate::auth::AuthError) -> Self {
        let (status, code, message) = match error {
            crate::auth::AuthError::InvalidRequest(message) => {
                (StatusCode::BAD_REQUEST, "invalid_request", message)
            }
            crate::auth::AuthError::InvalidCredentials => (
                StatusCode::UNAUTHORIZED,
                "invalid_credentials",
                crate::auth::invalid_credentials_message().to_string(),
            ),
            crate::auth::AuthError::InvalidRefreshToken => (
                StatusCode::UNAUTHORIZED,
                "invalid_refresh_token",
                crate::auth::invalid_refresh_token_message().to_string(),
            ),
            crate::auth::AuthError::InvalidAccessToken => (
                StatusCode::UNAUTHORIZED,
                "invalid_access_token",
                crate::auth::invalid_access_token_message().to_string(),
            ),
            crate::auth::AuthError::Store(message) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "store_error", message)
            }
        };

        Self {
            status,
            envelope: ErrorEnvelope {
                code,
                message,
                request_id: RequestId::new().into_string(),
                retryable: false,
            },
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (self.status, Json(self.envelope)).into_response();
        let request_id = response
            .extensions()
            .get::<RequestId>()
            .cloned()
            .map(|id| id.into_string());
        if let Some(value) = request_id {
            response
                .headers_mut()
                .insert(REQUEST_ID_HEADER, HeaderValue::from_str(&value).unwrap());
        }
        response
    }
}
