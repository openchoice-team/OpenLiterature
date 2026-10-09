# OpenDHU Reader API（研读室后端）

[English](README.md) | **简体中文**

文献研读室的后端：PDF 书架、带鉴权的文件流、阅读状态/批注/阅读进度、全文解析入库，
以及可插拔的 AI（单篇助读、跨文献问答与对比）。为
[`@opendhu/literature-reader`](../packages/literature-reader) 提供数据：

![研读室](../docs/images/reader-zh.png)

技术栈：Rust · axum 0.7 · sqlx 0.7（Postgres）· pgvector · OpenAI 兼容 LLM 适配器。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/dev-login` | 按用户名建档并签发 JWT（开发登录） |
| GET | `/api/me` | 当前用户 |
| GET | `/api/literature/items` | 我的文献列表（文件、进度、批注数） |
| POST | `/api/literature/items` | 仅创建元数据条目 |
| POST | `/api/literature/items/upload` | multipart 上传（`file` + 可选元数据） |
| GET | `/api/literature/items/:id/file` | 流式读取 PDF |
| DELETE | `/api/literature/items/:id` | 删除文献、文件与派生的知识库文档 |
| PATCH | `/api/literature/items/:id/progress` | 写入阅读进度（单调不回退） |
| GET/PUT | `/api/literature/items/:id/viewer-state` | EmbedPDF 阅读状态（批注快照） |
| GET/POST | `/api/literature/items/:id/annotations` | 批注列表 / 新建 |
| DELETE | `/api/literature/annotations/:id` | 删除批注 |
| POST | `/api/literature/items/:id/rag-import` | 抽取文本、切块、向量化并建立检索索引 |
| POST | `/api/literature/items/:id/assist` | AI 助读（`page`/`full`/`questions`/`ask`） |
| POST | `/api/literature/knowledge/ask` | 跨文献问答（`current_item` / `my_library`） |
| POST | `/api/literature/knowledge/compare` | 对比 2-8 篇已入库文献 |

除 `health` 与 `auth/dev-login` 外，所有端点都需要
`Authorization: Bearer <token>`。

## 运行

```bash
# 1. Postgres + pgvector（或使用根目录 docker-compose.yml）
docker run -d --name opendhu-db \
  -e POSTGRES_USER=opendhu -e POSTGRES_PASSWORD=opendhu -e POSTGRES_DB=opendhu \
  -p 55432:5432 pgvector/pgvector:pg16

# 2. 启动 API
cd backend
cp .env.example .env        # 按需修改 DATABASE_URL / READER_DATA_DIR
cargo run -p reader-api
```

或在仓库根目录执行 `docker compose up --build`。

## 配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres 连接串（必填） |
| `READER_BIND` | `0.0.0.0:8790` | HTTP 监听地址 |
| `READER_DATA_DIR` | `./data` | PDF 存储目录 |
| `READER_JWT_SECRET` | 开发密钥 | 演示登录令牌的 HMAC 密钥 |
| `READER_ALLOW_DEV_LOGIN` | `true` | 置为 `false` 可禁用免密开发登录 |
| `LLM_API_KEY` | — | 启用 AI 助读/问答与向量化 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | 任意 OpenAI 兼容地址 |
| `LLM_CHAT_MODEL` | `gpt-4o-mini` | 对话模型 |
| `LLM_EMBED_MODEL` | `text-embedding-3-small` | 向量模型 |

## AI 配置

配置 `LLM_API_KEY`（可配合 `LLM_BASE_URL`/模型覆盖）即可接入任意 OpenAI 兼容服务
（OpenAI、DeepSeek、Qwen、vLLM 等）。未配置时：

- 阅读、批注、进度与阅读状态同步照常工作；
- `rag-import` 仍会抽取并切块文本，使用关键词检索；
- `assist` / `knowledge/*` 返回 `503 ai_unavailable` 与明确提示。

配置后，入库会额外计算向量，检索优先走向量相似度，失败自动回退关键词。

## 解析入库流程

```
上传 PDF ──▶ literature_files（落盘）
rag-import ──▶ documents + doc_ingest_jobs（queued）
             ──▶ pdf-extract 抽取文本 ──▶ 约 1200 字切块
             ──▶ 可选向量化（LLM_EMBED_MODEL）
             ──▶ doc_chunks ──▶ documents.status=approved，item.ingestion_status=ready
assist/ask   ──▶ pgvector 向量检索 ──▶ 关键词 ILIKE 回退
             ──▶ 对话模型生成（附 [文献标题 · 片段 N] 引用）
```

## 说明

- **Cargo 镜像**：`.cargo/config.toml` 预置了 `rsproxy.cn` 镜像（中国大陆加速）。
  不需要时删除该文件即可直连 crates.io。
- **开发登录**：免密登录面向演示与可信内网自托管；生产环境请置于真实身份系统之后
  （`READER_ALLOW_DEV_LOGIN=false` 可关闭该端点）。
- **页级上下文**：当前 PDF 文本抽取不映射页码，因此「当前页」助读依赖选中文段，
  chunk 元数据暂为 `{}`，欢迎贡献。
- **多用户**：文献、进度、阅读状态与批注都按登录用户隔离；开源核心不含课程/组织层。

## 目录结构

```
crates/reader-api   axum 应用：路由、仓储、鉴权、LLM 适配器、解析管线
crates/reader-db    sqlx 连接池 + 迁移（用户、文献、状态、RAG 文档）
```
