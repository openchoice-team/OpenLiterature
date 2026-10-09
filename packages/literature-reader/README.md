# @opendhu/literature-reader

**English** | [简体中文](README.zh-CN.md)

Full literature reading room for React: PDF viewer (EmbedPDF/Pdfium), native
annotations, reading progress & viewer-state sync, AI side panel,
cross-document Q&A — and a built-in zh-CN / en-US i18n system. Extracted from
the DHU BioEduOS platform and decoupled from its backend through the
`LiteratureReaderClient` interface.

| 中文 | English |
| --- | --- |
| ![阅读器 · 中文](../../docs/images/reader-zh.png) | ![Reader · English](../../docs/images/reader-en.png) |

## Install

```bash
pnpm add @opendhu/literature-reader
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Requirements

The PDF rendering runtime (EmbedPDF + Pdfium WASM) is loaded from a static
directory at runtime. Copy the `embedpdf/` bundle (see
`apps/demo/public/embedpdf`) into your app's public directory. The viewer
expects it at `${BASE_URL}embedpdf/`.

If you replace the bundle, re-apply the localization hooks used for the
custom assistant controls:

```bash
node scripts/patch-embedpdf-i18n.mjs
```

## Usage

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

`LiteratureReadingRoom` renders the shelf (upload / switch / delete), the PDF
viewer with annotation sync and the AI assistant panel. Lower-level building
blocks are exported too: `EmbedPdfLiteratureViewer`,
`LiteratureAssistantPanel`, `literatureRagState`.

## Internationalization

Built-in locales: `zh-CN` and `en-US`. Locale detection follows
`navigator.language` when no provider is present; anything `zh*` maps to
`zh-CN`, everything else to `en-US`.

```tsx
import { ReaderI18nProvider, registerReaderMessages } from "@opendhu/literature-reader";

// Option A: switch locale from state
<ReaderI18nProvider locale={locale}>{children}</ReaderI18nProvider>;

// Option B: add or override messages for a locale
registerReaderMessages("en-US", {
  "room.upload": "Add PDF",
  "assistant.send": "Ask the assistant",
});
```

Inside custom UI, read the current locale and translate:

```tsx
import { useReaderI18n } from "@opendhu/literature-reader";

const { locale, t } = useReaderI18n();
t("room.progress", { value: 42 }); // "Progress 42%" / "进度 42%"
```

Non-React code (e.g. the HTTP client) can use `translate`, `setReaderLocale`
and `getReaderLocale`. The PDF toolbar and sidebar labels are localized as
well: standard EmbedPDF UI follows the locale, and the custom assistant
controls are localized through the runtime hooks installed by
`scripts/patch-embedpdf-i18n.mjs` + `localizeRuntimeCommands`.

## Backend contract

`createHttpLiteratureReaderClient` covers the reference REST contract of
`backend/crates/reader-api` (see `backend/README.md`):

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

Custom clients implement `LiteratureReaderClient` directly.
`createHttpLiteratureReaderClient` also configures the internal viewer runtime
(`configureReaderRuntime`) with the API base URL, token accessor and an
authenticated PDF loader.

## AI degradation

Without an AI key the reading room still works end-to-end: annotations,
progress, viewer state and keyword retrieval. The assistant panel surfaces the
backend's `AI 未配置` / `AI is not configured` error; hosts can also inspect
`item.personal_rag_enabled` / `ingestion_status` through `literatureRagState`.

## License

MIT
