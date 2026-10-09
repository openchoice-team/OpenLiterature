# OpenDHU · OpenChoice

**English** | [简体中文](README.zh-CN.md)

Open-source modules extracted from the DHU BioEduOS learning platform and
rebranded **OpenChoice** in the demo. Every module runs standalone — no
dependency on the host application's API layer, routing or auth.

![Global research map](docs/images/center-map.png)

## Modules

| Module | Screenshot | Description |
| --- | --- | --- |
| [`@opendhu/literature-center`](packages/literature-center) | ![](docs/images/center-list.png) | Topic-ranked academic literature discovery with a full-bleed interactive global research map (MapLibre): country → region → institution drill-down, collaboration arcs, filters and PNG/CSV/GeoJSON/JSON exports. |
| [`@opendhu/literature-reader`](packages/literature-reader) | ![](docs/images/reader-zh.png) | Literature reading room: EmbedPDF/Pdfium viewer, native annotations, reading progress & viewer-state sync, AI assistant panel, cross-document Q&A and a built-in zh-CN/en-US i18n system. |
| [`backend/`](backend) | — | Rust (axum + sqlx + pgvector) reader API: shelf, upload, authenticated PDF streaming, viewer state, ingest pipeline and pluggable OpenAI-compatible AI. |

## Screenshots

| View | Preview |
| --- | --- |
| Literature center · discovery list | ![](docs/images/center-list.png) |
| Global research map | ![](docs/images/center-map.png) |
| Country drill-down (regions / institutions / works) | ![](docs/images/center-drilldown.png) |
| Map exports (PNG · CSV · GeoJSON · JSON) | ![](docs/images/center-export.png) |
| Reading room · 中文 | ![](docs/images/reader-zh.png) |
| Reading room · English (`ReaderI18nProvider`) | ![](docs/images/reader-en.png) |

All screenshots are 1920×1080 captures of the demo app running against real
data (center: in-memory mock · reader: Rust API + Postgres).

## Architecture

```
apps/demo                    Vite app: literature center (mock client)
                             + reading room (reader-api, EmbedPDF runtime)
packages/literature-center   discovery + global map components (React 18, Tailwind 4)
packages/literature-reader   reading room components + i18n (React 18, Tailwind 4)
backend                      Rust workspace
  crates/reader-api          axum app: routes, repos, auth, LLM adapter, ingest
  crates/reader-db           sqlx pool + migrations (items, states, RAG docs)
docker-compose.yml           Postgres (pgvector) + reader-api
```

Both packages are backend-agnostic: hosts inject a data adapter
(`LiteratureCenterClient` / `LiteratureReaderClient`); reference HTTP clients
are included for the documented REST contracts.

## Quickstart

Prerequisites: Node.js ≥ 20, pnpm, Docker (for the reader backend), Rust ≥ 1.88
(only when building the backend outside Docker).

```bash
# 1. Backend: Postgres + pgvector + reader API on :8790
docker compose up -d --build

# 2. Demo: literature center + reading room on :5181
pnpm install
pnpm dev
```

Open http://127.0.0.1:5181 — the demo has two tabs:

- **文献中心 / Literature center** — runs fully offline against an in-memory
  mock backend (search topics, global map, drill-down, exports).
- **研读室 / Reading room** — talks to the Rust API (dev login, no password):
  upload PDFs, read, annotate, sync progress and use the AI assistant.

### AI (optional)

Everything works without an AI provider. Set an OpenAI-compatible key and
re-run compose to enable assist / cross-document Q&A:

```bash
export LLM_API_KEY=sk-...
docker compose up -d --build
```

## Configuration

| Where | Variable | Default | Purpose |
| --- | --- | --- | --- |
| reader API | `DATABASE_URL` | — | Postgres connection string |
| reader API | `READER_BIND` | `0.0.0.0:8790` | HTTP bind address |
| reader API | `READER_DATA_DIR` | `./data` | Uploaded PDF storage |
| reader API | `READER_JWT_SECRET` | dev secret | Dev-login token secret |
| reader API | `LLM_API_KEY` | — | Enables AI + embeddings |
| reader API | `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base |
| reader API | `LLM_CHAT_MODEL` | `gpt-4o-mini` | Chat model |
| reader API | `LLM_EMBED_MODEL` | `text-embedding-3-small` | Embedding model |
| demo | `VITE_READER_API` | same host :8790 | Reader API origin |

See [`backend/README.md`](backend/README.md) for the full endpoint list.

## Development

```bash
pnpm typecheck        # TS for all packages + demo
pnpm build            # library builds + demo build
pnpm dev              # demo dev server
cd backend && cargo run -p reader-api   # backend dev server
```

The demo's reading room loads the EmbedPDF/Pdfium runtime from
`apps/demo/public/embedpdf`. After replacing that bundle, re-apply the
localization hooks:

```bash
node scripts/patch-embedpdf-i18n.mjs
```

## Roadmap

- Page-level chunk metadata for page-scoped AI assist (needs layout-aware PDF parsing)
- Rebuild the EmbedPDF snippet from source to drop bundle patching
- Dark mode for the reader
- More locales (drop-in via `registerReaderMessages`)

## License

MIT
