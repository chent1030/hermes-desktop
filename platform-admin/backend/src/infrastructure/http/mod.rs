use axum::{
    body::Body,
    http::{HeaderValue, Request, header::HeaderName},
    middleware::Next,
    response::Response,
};

use crate::kernel::ids::RequestId;

const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

pub async fn request_id_middleware(mut request: Request<Body>, next: Next) -> Response {
    let request_id = RequestId::new();
    request.extensions_mut().insert(request_id.clone());

    let mut response = next.run(request).await;
    response.extensions_mut().insert(request_id.clone());
    response.headers_mut().insert(
        REQUEST_ID_HEADER,
        HeaderValue::from_str(request_id.as_str()).unwrap(),
    );
    response
}
