use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{
    AnnotationRow, ChunkRow, FileRow, ItemListRow, ItemRow, ProgressRow, ReadyItemRow,
    UserRow, ViewerStateRow,
};

const ITEM_SELECT: &str = r#"
SELECT
    i.id, i.owner_user_id, i.title, i.authors_json, i.year, i.doi, i.source_url,
    i.abstract_text, i.publication_title, i.status, i.ingestion_status,
    i.personal_rag_enabled, i.rag_document_id, i.created_at, i.updated_at,
    f.id AS file_id, f.file_path AS file_path, f.mime AS file_mime,
    f.file_name AS file_name, f.size_bytes AS file_size_bytes,
    f.created_at AS file_created_at,
    p.progress_pct AS progress_pct, p.page_no AS progress_page_no,
    p.total_pages AS progress_total_pages, p.meta_json AS progress_meta_json,
    p.updated_at AS progress_updated_at,
    COALESCE(v.annotation_count, 0)::bigint AS annotation_count
FROM literature_items i
LEFT JOIN literature_files f ON f.item_id = i.id
LEFT JOIN literature_reading_progress p ON p.item_id = i.id AND p.user_id = i.owner_user_id
LEFT JOIN literature_viewer_states v ON v.item_id = i.id AND v.user_id = i.owner_user_id
"#;

pub async fn upsert_user(pool: &PgPool, name: &str) -> sqlx::Result<UserRow> {
    sqlx::query_as::<_, UserRow>(
        r#"
        INSERT INTO users (name) VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET updated_at = now()
        RETURNING id, name
        "#,
    )
    .bind(name)
    .fetch_one(pool)
    .await
}

pub async fn list_items(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Vec<ItemListRow>> {
    sqlx::query_as::<_, ItemListRow>(&format!(
        "{ITEM_SELECT} WHERE i.owner_user_id = $1 ORDER BY i.created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn get_item(pool: &PgPool, user_id: Uuid, item_id: Uuid) -> sqlx::Result<ItemListRow> {
    sqlx::query_as::<_, ItemListRow>(&format!(
        "{ITEM_SELECT} WHERE i.id = $1 AND i.owner_user_id = $2"
    ))
    .bind(item_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
}

pub async fn create_item(
    pool: &PgPool,
    user_id: Uuid,
    title: &str,
    authors: &[String],
    year: Option<i32>,
    doi: Option<&str>,
    source_url: Option<&str>,
    abstract_text: Option<&str>,
    publication_title: Option<&str>,
) -> sqlx::Result<ItemRow> {
    sqlx::query_as::<_, ItemRow>(
        r#"
        INSERT INTO literature_items
            (owner_user_id, title, authors_json, year, doi, source_url, abstract_text, publication_title)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, owner_user_id, title, authors_json, year, doi, source_url,
                  abstract_text, publication_title, status, ingestion_status,
                  personal_rag_enabled, rag_document_id, created_at, updated_at
        "#,
    )
    .bind(user_id)
    .bind(title)
    .bind(json!(authors))
    .bind(year)
    .bind(doi)
    .bind(source_url)
    .bind(abstract_text)
    .bind(publication_title)
    .fetch_one(pool)
    .await
}

pub async fn upsert_file(
    pool: &PgPool,
    item_id: Uuid,
    file_path: &str,
    mime: &str,
    file_name: &str,
    size_bytes: i64,
) -> sqlx::Result<FileRow> {
    sqlx::query_as::<_, FileRow>(
        r#"
        INSERT INTO literature_files (item_id, file_path, mime, file_name, size_bytes)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (item_id) DO UPDATE SET
            file_path = EXCLUDED.file_path,
            mime = EXCLUDED.mime,
            file_name = EXCLUDED.file_name,
            size_bytes = EXCLUDED.size_bytes
        RETURNING id, item_id, file_path, mime, file_name, size_bytes, created_at
        "#,
    )
    .bind(item_id)
    .bind(file_path)
    .bind(mime)
    .bind(file_name)
    .bind(size_bytes)
    .fetch_one(pool)
    .await
}

pub async fn find_file(pool: &PgPool, item_id: Uuid) -> sqlx::Result<Option<FileRow>> {
    sqlx::query_as::<_, FileRow>(
        "SELECT id, item_id, file_path, mime, file_name, size_bytes, created_at
         FROM literature_files WHERE item_id = $1",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await
}

pub async fn delete_item(pool: &PgPool, user_id: Uuid, item_id: Uuid) -> sqlx::Result<Option<Uuid>> {
    let row: Option<(Option<Uuid>,)> = sqlx::query_as(
        r#"
        DELETE FROM literature_items
        WHERE id = $1 AND owner_user_id = $2
        RETURNING rag_document_id
        "#,
    )
    .bind(item_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|value| value.0))
}

pub async fn upsert_progress(
    pool: &PgPool,
    item_id: Uuid,
    user_id: Uuid,
    progress_pct: f64,
    page_no: Option<i32>,
    total_pages: Option<i32>,
    meta_json: &Value,
) -> sqlx::Result<ProgressRow> {
    sqlx::query_as::<_, ProgressRow>(
        r#"
        INSERT INTO literature_reading_progress
            (item_id, user_id, progress_pct, page_no, total_pages, meta_json)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (item_id, user_id) DO UPDATE SET
            progress_pct = GREATEST(literature_reading_progress.progress_pct, EXCLUDED.progress_pct),
            page_no = EXCLUDED.page_no,
            total_pages = EXCLUDED.total_pages,
            meta_json = EXCLUDED.meta_json,
            updated_at = now()
        RETURNING progress_pct, page_no, total_pages, meta_json, updated_at
        "#,
    )
    .bind(item_id)
    .bind(user_id)
    .bind(progress_pct.clamp(0.0, 1.0))
    .bind(page_no)
    .bind(total_pages)
    .bind(meta_json)
    .fetch_one(pool)
    .await
}

pub async fn find_viewer_state(
    pool: &PgPool,
    item_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<ViewerStateRow>> {
    sqlx::query_as::<_, ViewerStateRow>(
        r#"
        SELECT item_id, user_id, state_json, annotation_count, last_page_no, total_pages, revision, updated_at
        FROM literature_viewer_states
        WHERE item_id = $1 AND user_id = $2
        "#,
    )
    .bind(item_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_viewer_state(
    pool: &PgPool,
    item_id: Uuid,
    user_id: Uuid,
    state_json: &Value,
    annotation_count: i32,
    last_page_no: Option<i32>,
    total_pages: Option<i32>,
) -> sqlx::Result<ViewerStateRow> {
    sqlx::query_as::<_, ViewerStateRow>(
        r#"
        INSERT INTO literature_viewer_states
            (item_id, user_id, state_json, annotation_count, last_page_no, total_pages)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (item_id, user_id) DO UPDATE SET
            state_json = EXCLUDED.state_json,
            annotation_count = EXCLUDED.annotation_count,
            last_page_no = EXCLUDED.last_page_no,
            total_pages = EXCLUDED.total_pages,
            revision = literature_viewer_states.revision + 1,
            updated_at = now()
        RETURNING item_id, user_id, state_json, annotation_count, last_page_no, total_pages, revision, updated_at
        "#,
    )
    .bind(item_id)
    .bind(user_id)
    .bind(state_json)
    .bind(annotation_count)
    .bind(last_page_no)
    .bind(total_pages)
    .fetch_one(pool)
    .await
}

pub async fn list_annotations(
    pool: &PgPool,
    item_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Vec<AnnotationRow>> {
    sqlx::query_as::<_, AnnotationRow>(
        r#"
        SELECT id, item_id, user_id, page_no, kind, selected_text, note_text, color,
               rects_json, anchor_json, created_at, updated_at
        FROM literature_annotations
        WHERE item_id = $1 AND user_id = $2
        ORDER BY page_no, created_at
        "#,
    )
    .bind(item_id)
    .bind(user_id)
    .fetch_all(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn create_annotation(
    pool: &PgPool,
    item_id: Uuid,
    user_id: Uuid,
    page_no: i32,
    kind: &str,
    selected_text: Option<&str>,
    note_text: Option<&str>,
    color: &str,
    rects_json: Option<&Value>,
    anchor_json: Option<&Value>,
) -> sqlx::Result<AnnotationRow> {
    sqlx::query_as::<_, AnnotationRow>(
        r#"
        INSERT INTO literature_annotations
            (item_id, user_id, page_no, kind, selected_text, note_text, color, rects_json, anchor_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, item_id, user_id, page_no, kind, selected_text, note_text, color,
                  rects_json, anchor_json, created_at, updated_at
        "#,
    )
    .bind(item_id)
    .bind(user_id)
    .bind(page_no)
    .bind(kind)
    .bind(selected_text)
    .bind(note_text)
    .bind(color)
    .bind(rects_json)
    .bind(anchor_json)
    .fetch_one(pool)
    .await
}

pub async fn delete_annotation(
    pool: &PgPool,
    annotation_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM literature_annotations WHERE id = $1 AND user_id = $2")
        .bind(annotation_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn set_rag_state(
    pool: &PgPool,
    item_id: Uuid,
    document_id: Option<Uuid>,
    job_id: Option<Uuid>,
    ingestion_status: &str,
) -> sqlx::Result<()> {
    sqlx::query(
        r#"
        UPDATE literature_items SET
            personal_rag_enabled = $3,
            rag_document_id = $2,
            ingestion_status = $4,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(item_id)
    .bind(document_id)
    .bind(document_id.is_some())
    .bind(ingestion_status)
    .execute(pool)
    .await?;
    let _ = job_id;
    Ok(())
}

pub async fn create_rag_document(
    pool: &PgPool,
    user_id: Uuid,
    title: &str,
    source: &str,
) -> sqlx::Result<(Uuid, Uuid)> {
    let mut tx = pool.begin().await?;
    let document_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO documents (title, source_kind, source, status, created_by)
        VALUES ($1, 'literature', $2, 'processing', $3)
        RETURNING id
        "#,
    )
    .bind(title)
    .bind(source)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    let job_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO doc_ingest_jobs (doc_id, status, kind)
        VALUES ($1, 'queued', 'default')
        RETURNING id
        "#,
    )
    .bind(document_id.0)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((document_id.0, job_id.0))
}

pub async fn delete_document(pool: &PgPool, document_id: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM documents WHERE id = $1")
        .bind(document_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_job_status(
    pool: &PgPool,
    job_id: Uuid,
    status: &str,
    error: Option<&str>,
) -> sqlx::Result<()> {
    sqlx::query(
        r#"
        UPDATE doc_ingest_jobs SET
            status = $2,
            error = $3,
            started_at = CASE WHEN $2 = 'processing' AND started_at IS NULL THEN now() ELSE started_at END,
            finished_at = CASE WHEN $2 IN ('succeeded', 'failed') THEN now() ELSE finished_at END,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .bind(status)
    .bind(error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_document_status(pool: &PgPool, document_id: Uuid, status: &str) -> sqlx::Result<()> {
    sqlx::query("UPDATE documents SET status = $2, updated_at = now() WHERE id = $1")
        .bind(document_id)
        .bind(status)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn replace_chunks(
    pool: &PgPool,
    document_id: Uuid,
    chunks: &[(String, Option<Vec<f32>>)],
) -> sqlx::Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM doc_chunks WHERE doc_id = $1")
        .bind(document_id)
        .execute(&mut *tx)
        .await?;
    for (index, (content, embedding)) in chunks.iter().enumerate() {
        sqlx::query(
            r#"
            INSERT INTO doc_chunks (doc_id, chunk_index, content, embedding)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(document_id)
        .bind(index as i32)
        .bind(content)
        .bind(embedding.as_ref().map(|values| pgvector::Vector::from(values.clone())))
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn list_ready_items(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Vec<ReadyItemRow>> {
    sqlx::query_as::<_, ReadyItemRow>(
        r#"
        SELECT id, title, rag_document_id
        FROM literature_items
        WHERE owner_user_id = $1
          AND personal_rag_enabled = TRUE
          AND ingestion_status = 'ready'
          AND rag_document_id IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 120
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn list_ready_items_by_ids(
    pool: &PgPool,
    user_id: Uuid,
    item_ids: &[Uuid],
) -> sqlx::Result<Vec<ReadyItemRow>> {
    sqlx::query_as::<_, ReadyItemRow>(
        r#"
        SELECT id, title, rag_document_id
        FROM literature_items
        WHERE owner_user_id = $1
          AND id = ANY($2)
          AND personal_rag_enabled = TRUE
          AND ingestion_status = 'ready'
          AND rag_document_id IS NOT NULL
        "#,
    )
    .bind(user_id)
    .bind(item_ids)
    .fetch_all(pool)
    .await
}

pub async fn search_chunks_keyword(
    pool: &PgPool,
    document_ids: &[Uuid],
    keywords: &[String],
    limit: i64,
) -> sqlx::Result<Vec<ChunkRow>> {
    if keywords.is_empty() {
        return Ok(Vec::new());
    }
    let patterns: Vec<String> = keywords
        .iter()
        .map(|keyword| format!("%{}%", keyword.to_lowercase()))
        .collect();
    sqlx::query_as::<_, ChunkRow>(
        r#"
        SELECT id, doc_id, chunk_index, content, metadata_json
        FROM doc_chunks
        WHERE doc_id = ANY($1)
          AND EXISTS (
              SELECT 1 FROM unnest($2::text[]) AS pattern
              WHERE lower(content) LIKE pattern
          )
        ORDER BY chunk_index
        LIMIT $3
        "#,
    )
    .bind(document_ids)
    .bind(&patterns)
    .bind(limit)
    .fetch_all(pool)
    .await
}

pub async fn search_chunks_vector(
    pool: &PgPool,
    document_ids: &[Uuid],
    embedding: &[f32],
    limit: i64,
) -> sqlx::Result<Vec<(ChunkRow, f64)>> {
    let rows: Vec<(Uuid, Uuid, i32, String, Value, f64)> = sqlx::query_as(
        r#"
        SELECT id, doc_id, chunk_index, content, metadata_json,
               1.0 - (embedding <=> $2) AS score
        FROM doc_chunks
        WHERE doc_id = ANY($1) AND embedding IS NOT NULL
        ORDER BY embedding <=> $2
        LIMIT $3
        "#,
    )
    .bind(document_ids)
    .bind(pgvector::Vector::from(embedding.to_vec()))
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, doc_id, chunk_index, content, metadata_json, score)| {
            (
                ChunkRow {
                    id,
                    doc_id,
                    chunk_index,
                    content,
                    metadata_json,
                },
                score,
            )
        })
        .collect())
}

pub async fn count_ready_documents(pool: &PgPool) -> sqlx::Result<i64> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM documents WHERE status = 'approved'")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}
