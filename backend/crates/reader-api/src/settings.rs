use std::path::PathBuf;

use anyhow::Context;

#[derive(Clone)]
pub struct Settings {
    pub database_url: String,
    pub bind_addr: String,
    pub data_dir: PathBuf,
    pub jwt_secret: String,
    pub llm_api_key: Option<String>,
    pub llm_base_url: String,
    pub llm_chat_model: String,
    pub llm_embed_model: String,
    pub cors_origin: Option<String>,
}

impl Settings {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .context("DATABASE_URL is required (e.g. postgres://opendhu:opendhu@127.0.0.1:5432/opendhu)")?;
        Ok(Self {
            database_url,
            bind_addr: std::env::var("READER_BIND").unwrap_or_else(|_| "0.0.0.0:8790".into()),
            data_dir: std::env::var("READER_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("./data")),
            jwt_secret: std::env::var("READER_JWT_SECRET")
                .unwrap_or_else(|_| "opendhu-dev-secret-change-me".into()),
            llm_api_key: std::env::var("LLM_API_KEY").ok().filter(|value| !value.trim().is_empty()),
            llm_base_url: std::env::var("LLM_BASE_URL")
                .unwrap_or_else(|_| "https://api.openai.com/v1".into())
                .trim_end_matches('/')
                .to_string(),
            llm_chat_model: std::env::var("LLM_CHAT_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into()),
            llm_embed_model: std::env::var("LLM_EMBED_MODEL")
                .unwrap_or_else(|_| "text-embedding-3-small".into()),
            cors_origin: std::env::var("READER_CORS_ORIGIN").ok(),
        })
    }
}
