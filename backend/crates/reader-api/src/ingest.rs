use std::path::PathBuf;

use anyhow::{bail, Context};
use uuid::Uuid;

use crate::repos;
use crate::state::AppState;

const CHUNK_MAX_CHARS: usize = 1_200;

pub fn chunk_text(text: &str) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();
    for paragraph in text.split("\n\n") {
        let paragraph = paragraph.trim();
        if paragraph.is_empty() {
            continue;
        }
        if paragraph.chars().count() > CHUNK_MAX_CHARS {
            if !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            let mut buffer = String::new();
            for character in paragraph.chars() {
                buffer.push(character);
                if buffer.chars().count() >= CHUNK_MAX_CHARS {
                    chunks.push(std::mem::take(&mut buffer));
                }
            }
            if !buffer.trim().is_empty() {
                current = buffer;
            }
            continue;
        }
        let projected = current.chars().count() + paragraph.chars().count() + 2;
        if projected > CHUNK_MAX_CHARS && !current.is_empty() {
            chunks.push(std::mem::take(&mut current));
        }
        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(paragraph);
    }
    if !current.trim().is_empty() {
        chunks.push(current);
    }
    chunks
}

pub async fn run_ingest(state: AppState, item_id: Uuid, document_id: Uuid, job_id: Uuid) {
    if let Err(error) = ingest_inner(&state, item_id, document_id, job_id).await {
        let message = format!("{error:#}");
        tracing::warn!(item = %item_id, error = %message, "literature ingest failed");
        let _ = repos::set_job_status(&state.pool, job_id, "failed", Some(&message)).await;
        let _ = repos::set_document_status(&state.pool, document_id, "failed").await;
        let _ = repos::set_rag_state(&state.pool, item_id, Some(document_id), Some(job_id), "failed")
            .await;
    }
}

async fn ingest_inner(
    state: &AppState,
    item_id: Uuid,
    document_id: Uuid,
    job_id: Uuid,
) -> anyhow::Result<()> {
    repos::set_job_status(&state.pool, job_id, "processing", None).await?;
    repos::set_rag_state(&state.pool, item_id, Some(document_id), Some(job_id), "processing").await?;

    let file = repos::find_file(&state.pool, item_id)
        .await?
        .context("文献缺少 PDF 文件")?;
    let path = PathBuf::from(&file.file_path);
    let text = tokio::task::spawn_blocking(move || pdf_extract::extract_text(&path))
        .await
        .context("解析任务执行失败")?
        .context("PDF 文本提取失败")?;
    let text = text.trim();
    if text.chars().count() < 30 {
        bail!("PDF 未提取到可用文本（可能是扫描件或纯图片 PDF）");
    }

    let chunks = chunk_text(text);
    if chunks.is_empty() {
        bail!("未能切分出有效文本片段");
    }

    let mut embedded: Vec<(String, Option<Vec<f32>>)> = Vec::with_capacity(chunks.len());
    if state.llm.embeddings_enabled() {
        for chunk in &chunks {
            match state.llm.embed(chunk).await {
                Ok(vector) => embedded.push((chunk.clone(), Some(vector))),
                Err(error) => {
                    tracing::warn!(error = %error, "embedding chunk failed; falling back to keyword search");
                    embedded.push((chunk.clone(), None));
                }
            }
        }
    } else {
        tracing::info!(item = %item_id, "LLM_API_KEY not configured; indexing chunks without embeddings");
        embedded = chunks.into_iter().map(|chunk| (chunk, None)).collect();
    }

    repos::replace_chunks(&state.pool, document_id, &embedded).await?;
    repos::set_document_status(&state.pool, document_id, "approved").await?;
    repos::set_job_status(&state.pool, job_id, "succeeded", None).await?;
    repos::set_rag_state(&state.pool, item_id, Some(document_id), Some(job_id), "ready").await?;
    tracing::info!(item = %item_id, chunks = embedded.len(), "literature ingest completed");
    Ok(())
}
