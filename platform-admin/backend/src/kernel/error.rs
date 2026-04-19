use axum::{
    http::{header::HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
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
