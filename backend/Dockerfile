FROM rust:1.88-bookworm AS build

WORKDIR /app
COPY Cargo.toml ./
COPY crates ./crates
RUN cargo build --release --bin reader-api

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/reader-api /usr/local/bin/reader-api

ENV READER_BIND=0.0.0.0:8790 \
    READER_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 8790

CMD ["reader-api"]
