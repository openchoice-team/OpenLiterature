# @opendhu/literature-reader

[English](README.md) | **简体中文**

React 文献研读室：PDF 阅读器（EmbedPDF/Pdfium）、原生批注、阅读进度与阅读状态同步、
AI 助读面板、跨文献问答，内置 zh-CN / en-US 多语言系统。抽取自 DHU BioEduOS
平台，通过 `LiteratureReaderClient` 与后端解耦。

| 中文 | English |
| --- | --- |
| ![阅读器 · 中文](../../docs/images/reader-zh.png) | ![Reader · English](../../docs/images/reader-en.png) |

## 安装

```bash
pnpm add @opendhu/literature-reader
```

Peer 依赖：`react >= 18`、`react-dom >= 18`。

## 运行要求

PDF 渲染运行时（EmbedPDF + Pdfium WASM）在运行时从静态目录加载。请把
`embedpdf/` 资源（见 `apps/demo/public/embedpdf`）拷贝到应用的 public 目录，
阅读器默认从 `${BASE_URL}embedpdf/` 加载。

如果替换了该运行时，需要重新应用自定义控件的本地化钩子：

```bash
node scripts/patch-embedpdf-i18n.mjs
```

## 用法

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  LiteratureReaderProvider,
  LiteratureReadingRoom,
  ReaderI18nProvider,
  createHttpLiteratureReaderClient,
} from "@opendhu/literature-reader";
import { Toaster } from "sonner";

import "@opendhu/literature-reader/theme.css";

const client = createHttpLiteratureReaderClient({
  baseUrl: "http://127.0.0.1:8790/api",
  getAccessToken: () => token,
});

export function ReadingRoomPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <ReaderI18nProvider locale="zh-CN">
        <LiteratureReaderProvider client={client}>
          <LiteratureReadingRoom />
        </LiteratureReaderProvider>
      </ReaderI18nProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
```

`LiteratureReadingRoom` 渲染书架（上传/切换/删除）、带批注同步的 PDF 阅读器与 AI
助读面板。也导出低层构件：`EmbedPdfLiteratureViewer`、`LiteratureAssistantPanel`、
`literatureRagState`。

## 多语言（i18n）

内置语言：`zh-CN` 与 `en-US`。未包裹 Provider 时跟随 `navigator.language`：
`zh*` 映射到 `zh-CN`，其余映射到 `en-US`。

```tsx
import { ReaderI18nProvider, registerReaderMessages } from "@opendhu/literature-reader";

// 方式 A：由状态切换语言
<ReaderI18nProvider locale={locale}>{children}</ReaderI18nProvider>;

// 方式 B：覆盖或新增某语言的文案
registerReaderMessages("en-US", {
  "room.upload": "Add PDF",
  "assistant.send": "Ask the assistant",
});
```

自定义 UI 中读取当前语言并翻译：

```tsx
import { useReaderI18n } from "@opendhu/literature-reader";

const { locale, t } = useReaderI18n();
t("room.progress", { value: 42 }); // "进度 42%" / "Progress 42%"
```

非 React 代码（例如 HTTP 客户端）可以使用 `translate`、`setReaderLocale`、
`getReaderLocale`。PDF 工具栏与侧栏也支持切换：标准 EmbedPDF 界面跟随 locale，
自定义助读控件通过 `scripts/patch-embedpdf-i18n.mjs` + `localizeRuntimeCommands`
安装的运行时钩子完成本地化。

## 后端契约

`createHttpLiteratureReaderClient` 覆盖 `backend/crates/reader-api` 的参考 REST
契约（见 `backend/README.zh-CN.md`）：

```
GET/POST   /literature/items
POST       /literature/items/upload
GET        /literature/items/:id/file
DELETE     /literature/items/:id
PATCH      /literature/items/:id/progress
GET/PUT    /literature/items/:id/viewer-state
GET/POST   /literature/items/:id/annotations
DELETE     /literature/annotations/:id
POST       /literature/items/:id/rag-import
POST       /literature/items/:id/assist
POST       /literature/knowledge/ask
POST       /literature/knowledge/compare
```

自定义客户端可直接实现 `LiteratureReaderClient`。`createHttpLiteratureReaderClient`
同时会调用 `configureReaderRuntime`，为阅读器注入 API 地址、令牌获取与带鉴权的
PDF 加载器。

## AI 降级策略

未配置 AI Key 时研读室依然完整可用：阅读、批注、进度、阅读状态与关键词检索。
助读面板会展示后端的「AI 未配置 / AI is not configured」错误；宿主也可通过
`literatureRagState` 读取 `personal_rag_enabled` / `ingestion_status` 自行呈现。

## 许可证

MIT
