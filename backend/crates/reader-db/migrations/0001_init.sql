-- OpenDHU literature reading room schema.
-- Postgres 13+ provides gen_random_uuid() out of the box.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE literature_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    authors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    year INTEGER,
    doi TEXT,
    source_url TEXT,
    abstract_text TEXT,
    publication_title TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    ingestion_status TEXT NOT NULL DEFAULT 'none',
    personal_rag_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rag_document_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_literature_items_owner ON literature_items (owner_user_id, created_at DESC);

CREATE TABLE literature_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL UNIQUE REFERENCES literature_items (id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT 'application/pdf',
    file_name TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE literature_reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES literature_items (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    progress_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
    page_no INTEGER,
    total_pages INTEGER,
    meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, user_id)
);

CREATE TABLE literature_viewer_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES literature_items (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    annotation_count INTEGER NOT NULL DEFAULT 0,
    last_page_no INTEGER,
    total_pages INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, user_id)
);

CREATE TABLE literature_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES literature_items (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    page_no INTEGER NOT NULL DEFAULT 1,
    kind TEXT NOT NULL DEFAULT 'note',
    selected_text TEXT,
    note_text TEXT,
    color TEXT NOT NULL DEFAULT '#facc15',
    rects_json JSONB,
    anchor_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_literature_annotations_item ON literature_annotations (item_id, user_id, created_at);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'literature',
    source TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doc_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding vector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (doc_id, chunk_index)
);

CREATE INDEX ix_doc_chunks_doc ON doc_chunks (doc_id, chunk_index);

CREATE TABLE doc_ingest_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    kind TEXT NOT NULL DEFAULT 'default',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX ix_doc_ingest_jobs_doc ON doc_ingest_jobs (doc_id, created_at DESC);

ALTER TABLE literature_items
    ADD CONSTRAINT fk_literature_items_rag_document
    FOREIGN KEY (rag_document_id) REFERENCES documents (id) ON DELETE SET NULL;
