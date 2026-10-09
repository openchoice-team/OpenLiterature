use std::collections::HashMap;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, multipart::Multipart, Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::auth::{dev_login_enabled, issue_token, AuthUser};
use crate::error::{ApiError, ApiResult};
use crate::models::{
    annotation_response, item_response, viewer_state_response, AnnotationResponse, AssistPayload,
    AssistResponse, ComparisonDocument, ComparisonResponse, CreateAnnotationPayload,
    CreateItemPayload, DevLoginPayload, FileResponse, KnowledgeAskPayload, KnowledgeAskResponse,
    KnowledgeComparePayload, LiteratureItemResponse, ProgressResponse, SourceResponse,
    UpdateProgressPayload, UpsertViewerStatePayload, UserResponse, ViewerStateResponse,
};
use crate::repos;
use crate::state::AppState;

const MAX_UPLOAD_BYTES: usize = 300 * 1024 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/dev-login", post(dev_login))
        .route("/api/me", get(me))
        .route("/api/literature/items", get(list_items).post(create_item))
        .route(
            "/api/literature/items/upload",
            post(upload_item).layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES + 1024 * 1024)),
        )
        .route("/api/literature/items/:item_id", delete(delete_item))
        .route("/api/literature/items/:item_id/file", get(stream_file))
        .route("/api/literature/items/:item_id/progress", patch(update_progress))
        .route(
            "/api/literature/items/:item_id/viewer-state",
            get(get_viewer_state)
                .put(put_viewer_state)
                .layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route(
            "/api/literature/items/:item_id/annotations",
            get(list_annotations).post(create_annotation),
        )
        .route("/api/literature/annotations/:annotation_id", delete(delete_annotation))
        .route("/api/literature/items/:item_id/rag-import", post(rag_import))
        .route("/api/literature/items/:item_id/assist", post(assist))
        .route("/api/literature/knowledge/ask", post(knowledge_ask))
        .route("/api/literature/knowledge/compare", post(knowledge_compare))
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "opendhu-reader-api",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn dev_login(
    State(state): State<AppState>,
    Json(payload): Json<DevLoginPayload>,
) -> ApiResult<Json<Value>> {
    if !dev_login_enabled() {
        return Err(ApiError::unauthorized("开发登录已被禁用"));
    }
    let name = payload.name.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err(ApiError::bad_request("用户名需要 1-64 个字符"));
    }
    let user = repos::upsert_user(&state.pool, name).await?;
    let token = issue_token(&state.settings, user.id, &user.name)?;
    Ok(Json(json!({
        "access_token": token,
        "user": UserResponse { id: user.id.to_string(), name: user.name },
    })))
}

async fn me(user: AuthUser) -> Json<UserResponse> {
    Json(UserResponse {
        id: user.id.to_string(),
        name: user.name,
    })
}

async fn list_items(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<LiteratureItemResponse>>> {
    let rows = repos::list_items(&state.pool, user.id).await?;
    Ok(Json(rows.into_iter().map(item_response).collect()))
}

async fn create_item(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<CreateItemPayload>,
) -> ApiResult<Json<LiteratureItemResponse>> {
    let title = payload.title.trim();
    if title.is_empty() || title.chars().count() > 240 {
        return Err(ApiError::bad_request("标题需要 1-240 个字符"));
    }
    let created = repos::create_item(
        &state.pool,
        user.id,
        title,
        &payload.authors,
        payload.year,
        payload.doi.as_deref(),
        payload.source_url.as_deref(),
        payload.abstract_text.as_deref(),
        payload.publication_title.as_deref(),
    )
    .await?;
    let row = repos::get_item(&state.pool, user.id, created.id).await?;
    Ok(Json(item_response(row)))
}

async fn upload_item(
    State(state): State<AppState>,
    user: AuthUser,
    mut multipart: Multipart,
) -> ApiResult<Json<LiteratureItemResponse>> {
    let mut file_name = String::from("document.pdf");
    let mut file_bytes: Option<Bytes> = None;
    let mut title: Option<String> = None;
    let mut authors: Vec<String> = Vec::new();
    let mut year: Option<i32> = None;
    let mut doi: Option<String> = None;
    let mut source_url: Option<String> = None;
    let mut abstract_text: Option<String> = None;
    let mut publication_title: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::bad_request(format!("读取上传数据失败：{error}")))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "file" => {
                if let Some(value) = field.file_name() {
                    file_name = value.to_string();
                }
                file_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|error| ApiError::bad_request(format!("读取 PDF 失败：{error}")))?,
                );
            }
            "title" => title = field.text().await.ok(),
            "authors" => {
                if let Ok(text) = field.text().await {
                    authors = serde_json::from_str::<Vec<String>>(&text).unwrap_or_default();
                }
            }
            "year" => year = field.text().await.ok().and_then(|text| text.parse().ok()),
            "doi" => doi = field.text().await.ok(),
            "source_url" => source_url = field.text().await.ok(),
            "abstract_text" => abstract_text = field.text().await.ok(),
            "publication_title" => publication_title = field.text().await.ok(),
            _ => {}
        }
    }

    let bytes = file_bytes.ok_or_else(|| ApiError::bad_request("缺少 file 字段"))?;
    if bytes.is_empty() {
        return Err(ApiError::bad_request("PDF 文件为空"));
    }
    if bytes.len() > MAX_UPLOAD_BYTES {
        return Err(ApiError::bad_request("PDF 超过 300MB 上限"));
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err(ApiError::bad_request("仅支持 PDF 文件"));
    }

    let title = title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| file_name.trim_end_matches(".pdf").to_string());
    let safe_name = sanitize_file_name(&file_name);

    let created = repos::create_item(
        &state.pool,
        user.id,
        &title,
        &authors,
        year,
        doi.as_deref(),
        source_url.as_deref(),
        abstract_text.as_deref(),
        publication_title.as_deref(),
    )
    .await?;

    let directory = state
        .settings
        .data_dir
        .join("literature")
        .join(user.id.to_string())
        .join(created.id.to_string());
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|error| ApiError::internal(format!("创建存储目录失败：{error}")))?;
    let path = directory.join(&safe_name);
    if let Err(error) = tokio::fs::write(&path, &bytes).await {
        let _ = repos::delete_item(&state.pool, user.id, created.id).await;
        return Err(ApiError::internal(format!("写入 PDF 失败：{error}")));
    }
    repos::upsert_file(
        &state.pool,
        created.id,
        &path.to_string_lossy(),
        "application/pdf",
        &safe_name,
        bytes.len() as i64,
    )
    .await?;

    let row = repos::get_item(&state.pool, user.id, created.id).await?;
    Ok(Json(item_response(row)))
}

fn sanitize_file_name(name: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("document.pdf")
        .trim();
    let mut cleaned: String = base
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '.' || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    if !cleaned.to_lowercase().ends_with(".pdf") {
        cleaned.push_str(".pdf");
    }
    if cleaned.is_empty() {
        cleaned = "document.pdf".into();
    }
    cleaned
}

async fn delete_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let file = repos::find_file(&state.pool, item_id).await?;
    let document_id = repos::delete_item(&state.pool, user.id, item_id).await?;
    if let Some(document_id) = document_id {
        let _ = repos::delete_document(&state.pool, document_id).await;
    }
    if let Some(file) = file {
        let _ = tokio::fs::remove_file(&file.file_path).await;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn stream_file(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Response> {
    let _ = repos::get_item(&state.pool, user.id, item_id).await?;
    let file = repos::find_file(&state.pool, item_id)
        .await?
        .ok_or_else(|| ApiError::not_found("该文献还没有 PDF 文件"))?;
    let handle = tokio::fs::File::open(&file.file_path)
        .await
        .map_err(|error| ApiError::not_found(format!("PDF 文件不可读：{error}")))?;
    let stream = ReaderStream::new(handle);
    let ascii_name: String = file
        .file_name
        .chars()
        .map(|character| if character.is_ascii_graphic() && character != '"' { character } else { '_' })
        .collect();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, file.mime)
        .header(header::CONTENT_LENGTH, file.size_bytes.to_string())
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", ascii_name),
        )
        .body(axum::body::Body::from_stream(stream))
        .map_err(|error| ApiError::internal(error.to_string()))
}

async fn update_progress(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(payload): Json<UpdateProgressPayload>,
) -> ApiResult<Json<ProgressResponse>> {
    let _ = repos::get_item(&state.pool, user.id, item_id).await?;
    let row = repos::upsert_progress(
        &state.pool,
        item_id,
        user.id,
        payload.progress_pct,
        payload.page_no,
        payload.total_pages,
        &payload.meta_json,
    )
    .await?;
    Ok(Json(ProgressResponse {
        progress_pct: row.progress_pct,
        page_no: row.page_no,
        total_pages: row.total_pages,
        meta_json: row.meta_json,
        updated_at: row.updated_at,
    }))
}

async fn get_viewer_state(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<ViewerStateResponse>> {
    let _ = repos::get_item(&state.pool, user.id, item_id).await?;
    match repos::find_viewer_state(&state.pool, item_id, user.id).await? {
        Some(row) => Ok(Json(viewer_state_response(row))),
        None => Ok(Json(ViewerStateResponse {
            item_id: item_id.to_string(),
            user_id: user.id.to_string(),
            state_json: json!({ "annotations": [] }),
            annotation_count: 0,
            last_page_no: None,
            total_pages: None,
            revision: 0,
            updated_at: chrono::Utc::now(),
        })),
    }
}

async fn put_viewer_state(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(payload): Json<UpsertViewerStatePayload>,
) -> ApiResult<Json<ViewerStateResponse>> {
    let _ = repos::get_item(&state.pool, user.id, item_id).await?;
    let annotation_count = payload
        .state_json
        .get("annotations")
        .and_then(|value| value.as_array())
        .map(|items| items.len() as i32)
        .or(payload.annotation_count)
        .unwrap_or(0);
    let row = repos::upsert_viewer_state(
        &state.pool,
        item_id,
        user.id,
        &payload.state_json,
        annotation_count,
        payload.last_page_no,
        payload.total_pages,
    )
    .await?;
    Ok(Json(viewer_state_response(row)))
}

async fn list_annotations(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<Vec<AnnotationResponse>>> {
    let _ = repos::get_item(&state.pool, user.id, item_id).await?;
    let rows = repos::list_annotations(&state.pool, item_id, user.id).await?;
    Ok(Json(rows.into_iter().map(annotation_response).collect()))
}

async fn create_annotation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(payload): Json<CreateAnnotationPayload>,
) -> ApiResult<Json<AnnotationResponse>> {
    let _ = repos::get_item(&state.pool, user.id, item_id).await?;
    let row = repos::create_annotation(
        &state.pool,
        item_id,
        user.id,
        payload.page_no,
        payload.kind.trim(),
        payload.selected_text.as_deref(),
        payload.note_text.as_deref(),
        &payload.color,
        payload.rects_json.as_ref(),
        payload.anchor_json.as_ref(),
    )
    .await?;
    Ok(Json(annotation_response(row)))
}

async fn delete_annotation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(annotation_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    if repos::delete_annotation(&state.pool, annotation_id, user.id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("批注不存在"))
    }
}

async fn rag_import(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
) -> ApiResult<Json<LiteratureItemResponse>> {
    let existing = repos::get_item(&state.pool, user.id, item_id).await?;
    if existing.item.personal_rag_enabled
        && existing.item.ingestion_status == "ready"
        && existing.item.rag_document_id.is_some()
    {
        return Ok(Json(item_response(existing)));
    }
    let file = repos::find_file(&state.pool, item_id)
        .await?
        .ok_or_else(|| ApiError::bad_request("该文献还没有 PDF，无法导入知识库"))?;

    let (document_id, job_id) =
        repos::create_rag_document(&state.pool, user.id, &existing.item.title, &file.file_path).await?;
    repos::set_rag_state(&state.pool, item_id, Some(document_id), Some(job_id), "queued").await?;

    let task_state = state.clone();
    tokio::spawn(async move {
        crate::ingest::run_ingest(task_state, item_id, document_id, job_id).await;
    });

    let row = repos::get_item(&state.pool, user.id, item_id).await?;
    Ok(Json(item_response(row)))
}

fn keywords(query: &str) -> Vec<String> {
    let mut list: Vec<String> = query
        .split_whitespace()
        .map(|value| value.trim().trim_matches(|character: char| character == '，' || character == '。' || character == ',' || character == '?' || character == '？'))
        .filter(|value| value.chars().count() >= 2)
        .take(8)
        .map(str::to_string)
        .collect();
    if list.is_empty() {
        let trimmed = query.trim();
        if trimmed.chars().count() >= 2 {
            list.push(trimmed.to_string());
        }
    }
    list
}

async fn retrieve(
    state: &AppState,
    document_ids: &[Uuid],
    query: &str,
    limit: i64,
) -> anyhow::Result<Vec<(crate::models::ChunkRow, f64)>> {
    if document_ids.is_empty() || query.trim().is_empty() {
        return Ok(Vec::new());
    }
    if state.llm.embeddings_enabled() {
        match state.llm.embed(query).await {
            Ok(vector) => match repos::search_chunks_vector(&state.pool, document_ids, &vector, limit).await {
                Ok(rows) if !rows.is_empty() => return Ok(rows),
                Ok(_) => {}
                Err(error) => tracing::warn!(error = %error, "vector search failed; falling back to keyword search"),
            },
            Err(error) => tracing::warn!(error = %error, "query embedding failed; falling back to keyword search"),
        }
    }
    let words = keywords(query);
    let rows = repos::search_chunks_keyword(&state.pool, document_ids, &words, limit).await?;
    Ok(rows.into_iter().map(|row| (row, 0.0)).collect())
}

fn build_sources(
    rows: &[(crate::models::ChunkRow, f64)],
    titles: &HashMap<Uuid, (Uuid, String)>,
) -> Vec<SourceResponse> {
    rows.iter()
        .filter_map(|(row, score)| {
            let (item_id, title) = titles.get(&row.doc_id)?;
            let snippet: String = row.content.chars().take(240).collect();
            let page_no = row
                .metadata_json
                .get("page")
                .and_then(|value| value.as_i64())
                .map(|value| value as i32);
            Some(SourceResponse {
                evidence_id: format!("literature:{}:{}", row.doc_id, row.chunk_index),
                source_type: "literature".into(),
                citation_label: format!("{} · 片段 {}", title, row.chunk_index + 1),
                item_id: Some(item_id.to_string()),
                document_id: row.doc_id.to_string(),
                chunk_id: row.id.to_string(),
                title: title.clone(),
                chunk_index: row.chunk_index,
                page_no,
                snippet,
                score: *score,
                preview_path: None,
            })
        })
        .collect()
}

fn sources_prompt(sources: &[SourceResponse]) -> String {
    sources
        .iter()
        .map(|source| format!("[{}] {}\n{}", source.citation_label, source.title, source.snippet))
        .collect::<Vec<_>>()
        .join("\n\n")
}

async fn assist(
    State(state): State<AppState>,
    user: AuthUser,
    Path(item_id): Path<Uuid>,
    Json(payload): Json<AssistPayload>,
) -> ApiResult<Json<AssistResponse>> {
    let existing = repos::get_item(&state.pool, user.id, item_id).await?;
    if !state.llm.chat_enabled() {
        return Err(ApiError::ai_unavailable(
            "AI 未配置：设置 LLM_API_KEY 后启用文献助读；当前仍可阅读、批注与同步进度",
        ));
    }
    let item = existing.item;

    let authors = item
        .authors_json
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .collect::<Vec<_>>()
                .join("、")
        })
        .unwrap_or_default();

    let mut context = format!("文献标题：{}\n", item.title);
    if !authors.is_empty() {
        context.push_str(&format!("作者：{}\n", authors));
    }
    if let Some(year) = item.year {
        context.push_str(&format!("年份：{}\n", year));
    }
    if let Some(publication) = item.publication_title.as_deref() {
        context.push_str(&format!("发表于：{}\n", publication));
    }
    if let Some(abstract_text) = item.abstract_text.as_deref() {
        let abstract_excerpt: String = abstract_text.chars().take(1_200).collect();
        context.push_str(&format!("摘要：{}\n", abstract_excerpt));
    }

    let mut evidence = String::new();
    if item.personal_rag_enabled && item.ingestion_status == "ready" {
        if let Some(document_id) = item.rag_document_id {
            let query = format!(
                "{} {}",
                payload.question.clone().unwrap_or_default(),
                payload.selected_text.clone().unwrap_or_default()
            );
            let rows = retrieve(&state, &[document_id], &query, 6)
                .await
                .map_err(ApiError::internal)?;
            evidence = rows
                .iter()
                .map(|(row, _)| row.content.chars().take(700).collect::<String>())
                .collect::<Vec<_>>()
                .join("\n---\n");
        }
    }

    let instruction = match payload.mode.as_str() {
        "page" => format!(
            "请总结当前阅读页（第 {} 页）的核心内容，指出关键概念、方法与结论，并提示阅读重点。",
            payload.page_no.unwrap_or(1)
        ),
        "full" => "请概括全文的研究问题、方法、主要结果与结论，并列出 3-5 条关键要点。".into(),
        "questions" => "请基于全文提出 3 个值得深入思考的问题，并为每个问题给出一句理解提示。".into(),
        _ => payload.question.clone().unwrap_or_else(|| "请解读这篇文献的核心内容。".into()),
    };

    let user_prompt = format!(
        "{context}\n原文片段：\n{evidence}\n\n选中文本：\n{}\n\n任务：{instruction}",
        payload.selected_text.clone().unwrap_or_else(|| "（无）".into()),
    );
    let answer = state
        .llm
        .chat(
            "你是一名严谨的文献研读助教。优先依据提供的原文片段作答，无法从片段确认时明确说明推断。",
            &user_prompt,
            1_600,
        )
        .await
        .map_err(|error| ApiError::ai_unavailable(format!("AI 调用失败：{error}")))?;
    Ok(Json(AssistResponse {
        mode: payload.mode,
        answer,
    }))
}

async fn knowledge_ask(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<KnowledgeAskPayload>,
) -> ApiResult<Json<KnowledgeAskResponse>> {
    if payload.question.trim().is_empty() {
        return Err(ApiError::bad_request("请输入问题"));
    }
    if !state.llm.chat_enabled() {
        return Err(ApiError::ai_unavailable(
            "AI 未配置：设置 LLM_API_KEY 后启用跨文献问答",
        ));
    }
    let scope = payload.scope.clone();
    let ready = if scope == "my_library" {
        repos::list_ready_items(&state.pool, user.id).await?
    } else {
        let item_id = payload
            .item_id
            .ok_or_else(|| ApiError::bad_request("current_item 范围需要 item_id"))?;
        repos::list_ready_items_by_ids(&state.pool, user.id, &[item_id]).await?
    };
    if ready.is_empty() {
        return Err(ApiError::bad_request(
            "选中的文献尚未导入知识库，请先点击“导入知识库”再提问",
        ));
    }

    let document_ids: Vec<Uuid> = ready.iter().map(|item| item.rag_document_id).collect();
    let titles: HashMap<Uuid, (Uuid, String)> = ready
        .iter()
        .map(|item| (item.rag_document_id, (item.id, item.title.clone())))
        .collect();
    let rows = retrieve(&state, &document_ids, &payload.question, 10)
        .await
        .map_err(ApiError::internal)?;
    let sources = build_sources(&rows, &titles);

    if sources.is_empty() {
        return Ok(Json(KnowledgeAskResponse {
            scope,
            answer: "在已导入的文献中没有检索到与该问题相关的片段。".into(),
            sources,
        }));
    }

    let prompt = format!(
        "问题：{}\n\n可引用的原文片段：\n{}\n\n请基于这些片段回答，并在句末用 [文献标题 · 片段 N] 的形式标注依据。",
        payload.question,
        sources_prompt(&sources),
    );
    let answer = state
        .llm
        .chat(
            "你是一名严谨的研究助理。只依据给定片段回答，无法确认的内容明确说明。",
            &prompt,
            1_600,
        )
        .await
        .map_err(|error| ApiError::ai_unavailable(format!("AI 调用失败：{error}")))?;

    Ok(Json(KnowledgeAskResponse {
        scope,
        answer,
        sources,
    }))
}

async fn knowledge_compare(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<KnowledgeComparePayload>,
) -> ApiResult<Json<ComparisonResponse>> {
    if payload.item_ids.len() < 2 || payload.item_ids.len() > 8 {
        return Err(ApiError::bad_request("请选择 2-8 篇文献进行对比"));
    }
    if !state.llm.chat_enabled() {
        return Err(ApiError::ai_unavailable(
            "AI 未配置：设置 LLM_API_KEY 后启用跨文献对比",
        ));
    }
    let ready = repos::list_ready_items_by_ids(&state.pool, user.id, &payload.item_ids).await?;
    if ready.len() < 2 {
        return Err(ApiError::bad_request("至少需要两篇已导入知识库的文献"));
    }
    let question = payload
        .question
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "请对比这些文献的研究问题、方法与主要结论，并总结共识与分歧。".into());
    let per_item = payload.max_chunks_per_item.unwrap_or(3).clamp(1, 6) as i64;

    let mut titles: HashMap<Uuid, (Uuid, String)> = HashMap::new();
    let mut all_sources: Vec<SourceResponse> = Vec::new();
    let mut documents: Vec<ComparisonDocument> = Vec::new();

    for item in &ready {
        titles.insert(item.rag_document_id, (item.id, item.title.clone()));
        let rows = retrieve(&state, &[item.rag_document_id], &question, per_item)
            .await
            .map_err(ApiError::internal)?;
        let sources = build_sources(&rows, &titles);
        let mut pages: Vec<i32> = sources.iter().filter_map(|source| source.page_no).collect();
        pages.sort_unstable();
        pages.dedup();
        documents.push(ComparisonDocument {
            item_id: item.id.to_string(),
            title: item.title.clone(),
            evidence_count: sources.len(),
            pages,
        });
        all_sources.extend(sources);
    }

    let prompt = format!(
        "问题：{}\n\n各文献可引用的原文片段：\n{}\n\n请按文献分别概述，再给出对比结论（共识、分歧、方法差异），并用 [文献标题 · 片段 N] 标注依据。",
        question,
        sources_prompt(&all_sources),
    );
    let answer = state
        .llm
        .chat(
            "你是一名严谨的研究助理，擅长多篇文献对比。只依据给定片段作答。",
            &prompt,
            2_400,
        )
        .await
        .map_err(|error| ApiError::ai_unavailable(format!("AI 调用失败：{error}")))?;

    Ok(Json(ComparisonResponse {
        scope: "my_library".into(),
        question,
        answer,
        sources: all_sources,
        documents,
    }))
}

/// Helper kept for parity with the app's file response shape.
#[allow(dead_code)]
fn file_response(item_id: Uuid, row: crate::models::FileRow) -> FileResponse {
    FileResponse {
        id: row.id.to_string(),
        item_id: item_id.to_string(),
        file_name: row.file_name,
        mime: row.mime,
        size_bytes: row.size_bytes,
        preview_url: format!("/literature/items/{}/file", item_id),
        created_at: row.created_at,
    }
}

#[allow(dead_code)]
async fn not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, Json(json!({ "error": { "message": "接口不存在" } })))
}
