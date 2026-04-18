FROM rust:1.94 AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/platform-admin-backend /usr/local/bin/platform-admin-backend
EXPOSE 8080
CMD ["platform-admin-backend"]
