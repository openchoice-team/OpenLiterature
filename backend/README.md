# OpenDHU Reader API

**English** | [简体中文](README.zh-CN.md)

Backend for the literature reading room: PDF shelf, authenticated file
streaming, viewer state / annotations / reading progress, full-text ingestion
and pluggable AI (assist, cross-document ask & compare). Powers the
[`@opendhu/literature-reader`](../packages/literature-reader) components:

![Reading room](../docs/images/reader-zh.png)

Stack: Rust · axum 0.7 · sqlx 0.7 (Postgres) · pgvector · OpenAI-compatible LLM
adapter.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/dev-login` | upserts a user by name and issues a JWT (dev mode) |
| GET | `/api/me` | current user |
| GET | `/api/literature/items` | list my literature items (file, progress, annotation count) |
| POST | `/api/literature/items` | create a metadata-only item |
| POST | `/api/literature/items/upload` | multipart upload (`file` + optional metadata) |
| GET | `/api/literature/items/:id/file` | stream the PDF |
| DELETE | `/api/literature/items/:id` | delete item, file and derived knowledge doc |
| PATCH | `/api/literature/items/:id/progress` | upsert reading progress (monotonic) |
| GET/PUT | `/api/literature/items/:id/viewer-state` | EmbedPDF viewer state (annotations snapshot) |
| GET/POST | `/api/literature/items/:id/annotations` | list / create annotations |
| DELETE | `/api/literature/annotations/:id` | delete an annotation |
| POST | `/api/literature/items/:id/rag-import` | extract text, chunk, embed, index for retrieval |
| POST | `/api/literature/items/:id/assist` | AI reading assist (`page`/`full`/`questions`/`ask`) |
| POST | `/api/literature/knowledge/ask` | cross-document Q&A (`current_item` / `my_library`) |
| POST | `/api/literature/knowledge/compare` | compare 2-8 indexed documents |

All endpoints except `health` and `auth/dev-login` require
`Authorization: Bearer <token>`.

## Run

```bash
# 1. Postgres + pgvector (or use the root docker-compose.yml)
docker run -d --name opendhu-db \
  -e POSTGRES_USER=opendhu -e POSTGRES_PASSWORD=opendhu -e POSTGRES_DB=opendhu \
  -p 55432:5432 pgvector/pgvector:pg16

# 2. API
cd backend
cp .env.example .env        # adjust DATABASE_URL / READER_DATA_DIR
cargo run -p reader-api
```

or `docker compose up --build` from the repository root.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string (required) |
| `READER_BIND` | `0.0.0.0:8790` | HTTP bind address |
| `READER_DATA_DIR` | `./data` | Uploaded PDF storage |
| `READER_JWT_SECRET` | dev secret | HMAC secret for dev-login tokens |
| `READER_ALLOW_DEV_LOGIN` | `true` | Disable the passwordless dev login |
| `LLM_API_KEY` | — | Enables AI assist / Q&A and embeddings |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible base URL |
| `LLM_CHAT_MODEL` | `gpt-4o-mini` | Chat model |
| `LLM_EMBED_MODEL` | `text-embedding-3-small` | Embedding model |

## AI configuration

Set `LLM_API_KEY` (plus optional base/model overrides) for any
OpenAI-compatible provider (OpenAI, DeepSeek, Qwen, vLLM, ...). Without a key:

- reading, annotations, progress and viewer-state sync work normally;
- `rag-import` still extracts and chunks text, indexed for keyword search;
- `assist` / `knowledge/*` return `503 ai_unavailable` with a clear message.

With a key, ingest also computes embeddings and retrieval switches to vector
similarity with keyword fallback.

## Ingest pipeline

```
upload PDF ──▶ literature_files (disk)
rag-import ──▶ documents + doc_ingest_jobs (queued)
             ──▶ pdf-extract text ──▶ ~1200-char chunks
             ──▶ optional embeddings (LLM_EMBED_MODEL)
             ──▶ doc_chunks ──▶ documents.status=approved, item.ingestion_status=ready
assist/ask   ──▶ vector search (pgvector) ──▶ keyword ILIKE fallback
             ──▶ chat completion with [title · chunk] citations
```

## Notes

- **Cargo mirror**: `.cargo/config.toml` pre-configures the `rsproxy.cn` mirror
  (fast in mainland China). Delete the file to use crates.io directly.
- **Dev auth**: passwordless login is intended for demos and self-hosting
  behind a trusted network. Put a real IdP in front in production
  (`READER_ALLOW_DEV_LOGIN=false` disables the endpoint).
- **Page-level context**: PDF text extraction currently does not map chunks to
  page numbers, so page-mode assist relies on selected text; chunk metadata
  stays `{}`. Contributions welcome.
- **Multi-user**: items, progress, viewer state and annotations are scoped to
  the authenticated user; there is no course/organization layer in the
  open-source core.

## Layout

```
crates/reader-api   axum app: routes, repos, auth, LLM adapter, ingest
crates/reader-db    sqlx pool + migrations (users, items, states, RAG docs)
```
