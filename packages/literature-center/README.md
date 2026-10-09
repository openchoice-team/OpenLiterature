# @opendhu/literature-center

**English** | [简体中文](README.zh-CN.md)

Topic-ranked academic literature discovery with a full-bleed interactive
global research map, packaged as reusable React components. Extracted from the
DHU BioEduOS platform and decoupled from its backend: data comes in through a
`LiteratureCenterClient` you provide.

| | |
| --- | --- |
| ![Discovery list](../../docs/images/center-list.png) | ![Global map](../../docs/images/center-map.png) |
| ![Country drill-down](../../docs/images/center-drilldown.png) | ![Exports](../../docs/images/center-export.png) |

## Install

```bash
pnpm add @opendhu/literature-center
```

Peer dependencies: `react >= 18`, `react-dom >= 18`. Runtime dependencies
(React Query, MapLibre, d3-geo, Radix primitives, sonner, lucide-react...) are
declared by the package.

> Bundler note: the map view loads the MapLibre worker through Vite's
> `?worker&url` import. Consume the package through Vite (either the built
> `dist` or the `./src/*` export) so the worker is emitted correctly.

## Usage

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

### Styling

The components use Tailwind CSS utility classes plus design tokens. Import the
theme once in your CSS entry:

```css
@import "tailwindcss";
@import "@opendhu/literature-center/theme.css";

/* When consuming the package as source via a bundler alias */
@source "../node_modules/@opendhu/literature-center/src";
```

### Custom clients

Implement `LiteratureCenterClient` to plug in any data source (tRPC, GraphQL,
in-memory fixtures). `createHttpLiteratureCenterClient` covers the reference
REST contract:

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

## Components

- `AcademicLiteratureCenter` — full page: topic sidebar, list/map views, topic editor.
- `AcademicLiteratureDiscovery` — work list, filters, coverage strip and origin ranking.
- `AcademicIntelligenceMap` — full-bleed dark MapLibre globe with country → region →
  institution → work drill-down, collaboration arcs and a floating control cluster
  (search/filters, layer toggles, export).

## Map drill-down

Clicking a country fits the map to its bounds and opens a detail panel with:

1. **Regions** — institutions grouped by `region` (falling back to `city`), each row
   zooming the map to that area;
2. **Institutions** — inside the current scope;
3. **Representative works** — works linked to the selected region/institution.

The drill-down is driven entirely by `AcademicIntelligenceInstitution.region` /
`.city` / `.latitude` / `.longitude`, so any `LiteratureCenterClient`
implementation gets it for free.

## Export

The map toolbar exports the currently filtered view as PNG (with a title/stats
overlay), CSV (countries / institutions / works), GeoJSON (institution points,
country centroids and collaboration lines) and full JSON. The helpers are
public so hosts can build their own export UI:

```tsx
import {
  exportIntelligenceMapPng,
  intelligenceCountriesCsv,
  downloadTextFile,
} from "@opendhu/literature-center";

downloadTextFile("countries.csv", intelligenceCountriesCsv(data), "text/csv");
await exportIntelligenceMapPng(mapRef.current!.getMap(), { title: "Global research" });
```

## Key props

- `AcademicIntelligenceMap`: `courseId`, `topicId`, `onOpenReader`, `onOpenDiscovery`,
  `pulseKey` (highlights refreshed countries) and `embedded` (host already renders
  the page heading).

## License

MIT
