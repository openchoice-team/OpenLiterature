use async_trait::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::ApiError;
use crate::settings::Settings;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub name: String,
    pub exp: i64,
}

pub fn issue_token(settings: &Settings, user_id: Uuid, name: &str) -> anyhow::Result<String> {
    let claims = Claims {
        sub: user_id.to_string(),
        name: name.to_string(),
        exp: (Utc::now() + Duration::days(30)).timestamp(),
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(settings.jwt_secret.as_bytes()),
    )?;
    Ok(token)
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub name: String,
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| ApiError::unauthorized("缺少 Authorization 头"))?;
        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| ApiError::unauthorized("Authorization 需要 Bearer token"))?;
        let decoded = decode::<Claims>(
            token.trim(),
            &DecodingKey::from_secret(state.settings.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| ApiError::unauthorized("登录状态已失效，请重新登录"))?;
        let id = Uuid::parse_str(&decoded.claims.sub)
            .map_err(|_| ApiError::unauthorized("登录状态无效"))?;
        Ok(AuthUser {
            id,
            name: decoded.claims.name,
        })
    }
}

/// Development-mode login: upserts a user by name and issues a token.
/// The open-source core intentionally ships without password storage; put a
/// real identity provider in front of this endpoint in production.
pub fn dev_login_enabled() -> bool {
    std::env::var("READER_ALLOW_DEV_LOGIN")
        .map(|value| value != "false" && value != "0")
        .unwrap_or(true)
}
