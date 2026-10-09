use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, FromRow)]
pub struct ItemRow {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub title: String,
    pub authors_json: Value,
    pub year: Option<i32>,
    pub doi: Option<String>,
    pub source_url: Option<String>,
    pub abstract_text: Option<String>,
    pub publication_title: Option<String>,
    pub status: String,
    pub ingestion_status: String,
    pub personal_rag_enabled: bool,
    pub rag_document_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct ItemListRow {
    #[sqlx(flatten)]
    pub item: ItemRow,
    pub file_id: Option<Uuid>,
    pub file_path: Option<String>,
    pub file_mime: Option<String>,
    pub file_name: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub file_created_at: Option<DateTime<Utc>>,
    pub progress_pct: Option<f64>,
    pub progress_page_no: Option<i32>,
    pub progress_total_pages: Option<i32>,
    pub progress_meta_json: Option<Value>,
    pub progress_updated_at: Option<DateTime<Utc>>,
    pub annotation_count: i64,
}

#[derive(Debug, FromRow)]
pub struct FileRow {
    pub id: Uuid,
    pub item_id: Uuid,
    pub file_path: String,
    pub mime: String,
    pub file_name: String,
    pub size_bytes: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct ProgressRow {
    pub progress_pct: f64,
    pub page_no: Option<i32>,
    pub total_pages: Option<i32>,
    pub meta_json: Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct ViewerStateRow {
    pub item_id: Uuid,
    pub user_id: Uuid,
    pub state_json: Value,
    pub annotation_count: i32,
    pub last_page_no: Option<i32>,
    pub total_pages: Option<i32>,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct AnnotationRow {
    pub id: Uuid,
    pub item_id: Uuid,
    pub user_id: Uuid,
    pub page_no: i32,
    pub kind: String,
    pub selected_text: Option<String>,
    pub note_text: Option<String>,
    pub color: String,
    pub rects_json: Option<Value>,
    pub anchor_json: Option<Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub struct ChunkRow {
    pub id: Uuid,
    pub doc_id: Uuid,
    pub chunk_index: i32,
    pub content: String,
    pub metadata_json: Value,
}

#[derive(Debug, FromRow)]
pub struct ReadyItemRow {
    pub id: Uuid,
    pub title: String,
    pub rag_document_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct DevLoginPayload {
    pub name: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct CreateItemPayload {
    pub title: String,
    #[serde(default)]
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub doi: Option<String>,
    pub source_url: Option<String>,
    pub abstract_text: Option<String>,
    pub publication_title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProgressPayload {
    pub progress_pct: f64,
    pub page_no: Option<i32>,
    pub total_pages: Option<i32>,
    #[serde(default)]
    pub meta_json: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpsertViewerStatePayload {
    #[serde(default)]
    pub state_json: Value,
    pub annotation_count: Option<i32>,
    pub last_page_no: Option<i32>,
    pub total_pages: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnotationPayload {
    pub page_no: i32,
    pub kind: String,
    pub selected_text: Option<String>,
    pub note_text: Option<String>,
    #[serde(default = "default_annotation_color")]
    pub color: String,
    pub rects_json: Option<Value>,
    pub anchor_json: Option<Value>,
}

fn default_annotation_color() -> String {
    "#facc15".into()
}

#[derive(Debug, Deserialize)]
pub struct AssistPayload {
    pub mode: String,
    pub question: Option<String>,
    pub page_no: Option<i32>,
    pub selected_text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KnowledgeAskPayload {
    #[serde(default = "default_scope")]
    pub scope: String,
    pub question: String,
    pub item_id: Option<Uuid>,
}

fn default_scope() -> String {
    "current_item".into()
}

#[derive(Debug, Deserialize)]
pub struct KnowledgeComparePayload {
    pub item_ids: Vec<Uuid>,
    pub question: Option<String>,
    pub max_chunks_per_item: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct FileResponse {
    pub id: String,
    pub item_id: String,
    pub file_name: String,
    pub mime: String,
    pub size_bytes: i64,
    pub preview_url: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ProgressResponse {
    pub progress_pct: f64,
    pub page_no: Option<i32>,
    pub total_pages: Option<i32>,
    pub meta_json: Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct LiteratureItemResponse {
    pub id: String,
    pub owner_user_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub doi: Option<String>,
    pub source_url: Option<String>,
    pub abstract_text: Option<String>,
    pub publication_title: Option<String>,
    pub status: String,
    pub ingestion_status: String,
    pub personal_rag_enabled: bool,
    pub rag_document_id: Option<String>,
    pub academic_work_id: Option<String>,
    pub visibility: String,
    pub file: Option<FileResponse>,
    pub progress: Option<ProgressResponse>,
    pub annotation_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ViewerStateResponse {
    pub item_id: String,
    pub user_id: String,
    pub state_json: Value,
    pub annotation_count: i32,
    pub last_page_no: Option<i32>,
    pub total_pages: Option<i32>,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AnnotationResponse {
    pub id: String,
    pub item_id: String,
    pub user_id: String,
    pub page_no: i32,
    pub kind: String,
    pub selected_text: Option<String>,
    pub note_text: Option<String>,
    pub color: String,
    pub rects_json: Option<Value>,
    pub anchor_json: Option<Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AssistResponse {
    pub mode: String,
    pub answer: String,
}

#[derive(Debug, Serialize)]
pub struct SourceResponse {
    pub evidence_id: String,
    pub source_type: String,
    pub citation_label: String,
    pub item_id: Option<String>,
    pub document_id: String,
    pub chunk_id: String,
    pub title: String,
    pub chunk_index: i32,
    pub page_no: Option<i32>,
    pub snippet: String,
    pub score: f64,
    pub preview_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeAskResponse {
    pub scope: String,
    pub answer: String,
    pub sources: Vec<SourceResponse>,
}

#[derive(Debug, Serialize)]
pub struct ComparisonDocument {
    pub item_id: String,
    pub title: String,
    pub evidence_count: usize,
    pub pages: Vec<i32>,
}

#[derive(Debug, Serialize)]
pub struct ComparisonResponse {
    pub scope: String,
    pub question: String,
    pub answer: String,
    pub sources: Vec<SourceResponse>,
    pub documents: Vec<ComparisonDocument>,
}

pub fn item_response(row: ItemListRow) -> LiteratureItemResponse {
    let authors = row
        .item
        .authors_json
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let file = match (row.file_id, row.file_name, row.file_mime) {
        (Some(id), Some(file_name), Some(mime)) => Some(FileResponse {
            id: id.to_string(),
            item_id: row.item.id.to_string(),
            file_name,
            mime,
            size_bytes: row.file_size_bytes.unwrap_or(0),
            preview_url: format!("/literature/items/{}/file", row.item.id),
            created_at: row.file_created_at.unwrap_or(row.item.created_at),
        }),
        _ => None,
    };
    let progress = row.progress_updated_at.map(|updated_at| ProgressResponse {
        progress_pct: row.progress_pct.unwrap_or(0.0),
        page_no: row.progress_page_no,
        total_pages: row.progress_total_pages,
        meta_json: row.progress_meta_json.unwrap_or(Value::Object(Default::default())),
        updated_at,
    });
    LiteratureItemResponse {
        id: row.item.id.to_string(),
        owner_user_id: row.item.owner_user_id.to_string(),
        title: row.item.title,
        authors,
        year: row.item.year,
        doi: row.item.doi,
        source_url: row.item.source_url,
        abstract_text: row.item.abstract_text,
        publication_title: row.item.publication_title,
        status: row.item.status,
        ingestion_status: row.item.ingestion_status,
        personal_rag_enabled: row.item.personal_rag_enabled,
        rag_document_id: row.item.rag_document_id.map(|id| id.to_string()),
        academic_work_id: None,
        visibility: "private".into(),
        file,
        progress,
        annotation_count: row.annotation_count,
        created_at: row.item.created_at,
        updated_at: row.item.updated_at,
    }
}

pub fn viewer_state_response(row: ViewerStateRow) -> ViewerStateResponse {
    ViewerStateResponse {
        item_id: row.item_id.to_string(),
        user_id: row.user_id.to_string(),
        state_json: row.state_json,
        annotation_count: row.annotation_count,
        last_page_no: row.last_page_no,
        total_pages: row.total_pages,
        revision: row.revision,
        updated_at: row.updated_at,
    }
}

pub fn annotation_response(row: AnnotationRow) -> AnnotationResponse {
    AnnotationResponse {
        id: row.id.to_string(),
        item_id: row.item_id.to_string(),
        user_id: row.user_id.to_string(),
        page_no: row.page_no,
        kind: row.kind,
        selected_text: row.selected_text,
        note_text: row.note_text,
        color: row.color,
        rects_json: row.rects_json,
        anchor_json: row.anchor_json,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}
