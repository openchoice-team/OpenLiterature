# @opendhu/literature-center

[English](README.md) | **简体中文**

按主题检索的学术文献发现组件，配套全屏交互式全球研究地图。抽取自 DHU
BioEduOS 平台，与后端解耦：数据通过宿主注入的 `LiteratureCenterClient`
进入组件。

| | |
| --- | --- |
| ![发现列表](../../docs/images/center-list.png) | ![全球地图](../../docs/images/center-map.png) |
| ![国家下钻](../../docs/images/center-drilldown.png) | ![导出](../../docs/images/center-export.png) |

## 安装

```bash
pnpm add @opendhu/literature-center
```

Peer 依赖：`react >= 18`、`react-dom >= 18`。运行时依赖（React Query、MapLibre、d3-geo、Radix、sonner、lucide-react 等）由包声明。

> 构建说明：地图视图通过 Vite 的 `?worker&url` 引入 MapLibre worker，
> 请使用 Vite 消费该包（`dist` 或 `./src/*` 导出均可）。

## 用法

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AcademicLiteratureCenter,
  LiteratureCenterProvider,
  createHttpLiteratureCenterClient,
} from "@opendhu/literature-center";
import { Toaster } from "sonner";

import "@opendhu/literature-center/theme.css";

const client = createHttpLiteratureCenterClient({
  baseUrl: "/api",
  getHeaders: () => ({ Authorization: `Bearer ${token}` }),
});

export function LiteraturePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiteratureCenterProvider client={client}>
        <AcademicLiteratureCenter
          courseId={courseId}
          onOpenReader={(itemId) => router.push(`/reader/${itemId}`)}
        />
        <Toaster />
      </LiteratureCenterProvider>
    </QueryClientProvider>
  );
}
```

### 样式

组件使用 Tailwind 工具类 + 设计令牌。在 CSS 入口引入一次主题：

```css
@import "tailwindcss";
@import "@opendhu/literature-center/theme.css";

/* 通过 bundler alias 以源码方式消费时 */
@source "../node_modules/@opendhu/literature-center/src";
```

### 自定义数据源

实现 `LiteratureCenterClient` 即可接入任意数据源（tRPC、GraphQL、内存 fixtures）。
`createHttpLiteratureCenterClient` 覆盖参考 REST 契约：

```
GET    /courses/:courseId/literature/intelligence/map
GET    /courses/:courseId/literature/discovery/coverage
GET    /courses/:courseId/literature/discovery/origins
POST   /courses/:courseId/literature/discovery/search
GET    /courses/:courseId/literature/discovery/works
PATCH  /courses/:courseId/literature/discovery/works/:workId
POST   /courses/:courseId/literature/discovery/works/:workId/fulltext
DELETE /courses/:courseId/literature/discovery/works/:workId/fulltext/:jobId
GET    /courses/:courseId/literature/topics
POST   /courses/:courseId/literature/topics
PATCH  /courses/:courseId/literature/topics/:topicId
DELETE /courses/:courseId/literature/topics/:topicId
POST   /courses/:courseId/literature/topics/:topicId/refresh
POST   /courses/:courseId/literature/topics/:topicId/read
```

## 组件

- `AcademicLiteratureCenter` — 完整页面：主题侧栏、列表/地图视图、主题编辑器。
- `AcademicLiteratureDiscovery` — 文献列表、筛选、覆盖度条与研究来源榜。
- `AcademicIntelligenceMap` — 全屏深色 MapLibre 地图：国家 → 地域 → 机构 →
  文献逐级下钻、合作弧线、浮动控件簇（筛选/图层/导出）。

## 地图下钻

点击国家会缩放到该国土范围并打开详情面板：

1. **地域分布** —— 按 `region`（缺失时回退 `city`）分组的机构，点击缩放到该区域；
2. **主要机构** —— 当前范围内的机构列表；
3. **代表文献** —— 与所选地域/机构关联的文献。

下钻完全由 `AcademicIntelligenceInstitution` 的 `region` / `city` /
`latitude` / `longitude` 驱动，任何 `LiteratureCenterClient` 实现都自动获得该能力。

## 导出

地图工具栏可导出当前筛选范围：PNG（带标题与统计水印）、CSV（国家/机构/文献）、
GeoJSON（机构点 + 国家质心 + 合作线）与完整 JSON。导出函数公开，宿主可自建导出 UI：

```tsx
import {
  exportIntelligenceMapPng,
  intelligenceCountriesCsv,
  downloadTextFile,
} from "@opendhu/literature-center";

downloadTextFile("countries.csv", intelligenceCountriesCsv(data), "text/csv");
await exportIntelligenceMapPng(mapRef.current!.getMap(), { title: "全球研究分布" });
```

## 主要 Props

- `AcademicIntelligenceMap`：`courseId`、`topicId`、`onOpenReader`、`onOpenDiscovery`、
  `pulseKey`（高亮刚更新的国家）、`embedded`（宿主已渲染页面标题）。

## 许可证

MIT
