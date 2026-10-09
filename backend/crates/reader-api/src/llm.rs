use anyhow::{bail, Context};
use reqwest::Client;
use serde_json::json;

use crate::settings::Settings;

#[derive(Clone)]
pub struct LlmClient {
    http: Client,
    api_key: Option<String>,
    base_url: String,
    chat_model: String,
    embed_model: String,
}

impl LlmClient {
    pub fn new(settings: &Settings) -> Self {
        Self {
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .expect("build http client"),
            api_key: settings.llm_api_key.clone(),
            base_url: settings.llm_base_url.clone(),
            chat_model: settings.llm_chat_model.clone(),
            embed_model: settings.llm_embed_model.clone(),
        }
    }

    pub fn chat_enabled(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn embeddings_enabled(&self) -> bool {
        self.api_key.is_some()
    }

    pub async fn chat(&self, system: &str, user: &str, max_tokens: u32) -> anyhow::Result<String> {
        let api_key = self
            .api_key
            .as_ref()
            .context("AI 未配置：请设置 LLM_API_KEY 后重试")?;
        let response = self
            .http
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(api_key)
            .json(&json!({
                "model": self.chat_model,
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user },
                ],
                "temperature": 0.2,
                "max_tokens": max_tokens,
            }))
            .send()
            .await
            .context("调用对话模型失败")?;
        let status = response.status();
        let body: serde_json::Value = response.json().await.context("解析对话模型响应失败")?;
        if !status.is_success() {
            bail!(
                "对话模型返回 {}：{}",
                status,
                body.pointer("/error/message")
                    .and_then(|value| value.as_str())
                    .unwrap_or("未知错误")
            );
        }
        let content = body
            .pointer("/choices/0/message/content")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim()
            .to_string();
        if content.is_empty() {
            bail!("对话模型未返回内容");
        }
        Ok(content)
    }

    pub async fn embed(&self, text: &str) -> anyhow::Result<Vec<f32>> {
        let api_key = self
            .api_key
            .as_ref()
            .context("AI 未配置：请设置 LLM_API_KEY 后重试")?;
        let response = self
            .http
            .post(format!("{}/embeddings", self.base_url))
            .bearer_auth(api_key)
            .json(&json!({ "model": self.embed_model, "input": text }))
            .send()
            .await
            .context("调用向量模型失败")?;
        let status = response.status();
        let body: serde_json::Value = response.json().await.context("解析向量模型响应失败")?;
        if !status.is_success() {
            bail!(
                "向量模型返回 {}：{}",
                status,
                body.pointer("/error/message")
                    .and_then(|value| value.as_str())
                    .unwrap_or("未知错误")
            );
        }
        let values = body
            .pointer("/data/0/embedding")
            .and_then(|value| value.as_array())
            .context("向量模型响应缺少 embedding")?;
        Ok(values
            .iter()
            .filter_map(|value| value.as_f64().map(|item| item as f32))
            .collect())
    }
}
