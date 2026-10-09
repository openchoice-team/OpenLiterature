import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, FileSearch, Loader2 } from "lucide-react";

import { getReaderRuntime } from "../api/runtime";
import { translate, useReaderI18n } from "../i18n";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import type { PdfTextSelection } from "./pdf-selection";

const EMBEDPDF_BASE = `${import.meta.env.BASE_URL}embedpdf/`;
const EMBEDPDF_ENTRY = `${EMBEDPDF_BASE}embedpdf.js`;
const EMBEDPDF_WASM = `${EMBEDPDF_BASE}pdfium.wasm`;
const BIOEDU_ASSISTANT_PANEL_ID = "bioedu-literature-assistant-panel";
const BIOEDU_ASSISTANT_SLOT_SELECTOR = "[data-bioedu-literature-assistant-slot]";
const COMMENT_PANEL_ID = "comment-panel";
const ANNOTATION_PLUGIN_ID = "annotation";
const BIOEDU_ANNOTATION_AUTHOR = "BioEdu Reader";
const PDF_ANNOTATION_SUBTYPE_TEXT = 1;
const PDF_ANNOTATION_NAME_COMMENT = 0;
const USER_VISIBLE_ANNOTATION_SUBTYPES = new Set([
  1, // Text comment
  3, // FreeText
  4, // Line
  5, // Square
  6, // Circle
  7, // Polygon
  8, // Polyline
  9, // Highlight
  10, // Underline
  11, // Squiggly
  12, // Strikeout
  13, // Stamp
  14, // Caret
  15, // Ink
  28, // Redact
]);

type EmbedPdfModule = {
  default: {
    init: (config: Record<string, unknown>) => EmbedPdfContainer | undefined;
  };
};

type EmbedPdfContainer = HTMLElement & {
  registry: Promise<EmbedPdfRegistry>;
};

type EmbedPdfRegistry = {
  getPlugin?: (name: string) => { provides?: () => unknown } | undefined;
};

type UiCapability = {
  forDocument?: (documentId: string) => UiScope;
};

type UiScope = {
  setActiveSidebar?: (
    placement: string,
    slot: string,
    sidebarId: string,
    activeTab?: string,
    props?: Record<string, unknown>,
  ) => void;
  toggleSidebar?: (
    placement: string,
    slot: string,
    sidebarId: string,
    activeTab?: string,
    props?: Record<string, unknown>,
  ) => void;
};

type DocumentManagerCapability = {
  getActiveDocumentId?: () => string | null;
  getActiveDocument?: () => EmbedPdfDocument | null;
  onDocumentOpened?: (listener: (state: { id: string; document?: EmbedPdfDocument | null }) => void) => () => void;
};

type ScrollCapability = {
  forDocument?: (documentId: string) => ScrollScope;
  onPageChange?: (listener: (event: { documentId: string; pageNumber: number; totalPages: number }) => void) => () => void;
};

type ScrollScope = {
  getCurrentPage?: () => number;
  getTotalPages?: () => number;
  scrollToPage?: (options: { pageNumber: number; behavior?: ScrollBehavior; alignY?: number }) => void;
};

type AnnotationCapability = {
  forDocument?: (documentId: string) => AnnotationScope;
  setLocked?: (mode: { type: "none" | "all" | "include" | "exclude"; categories?: string[] }, documentId?: string) => void;
};

type AnnotationScope = {
  getState?: () => unknown;
  getAnnotations?: () => Array<{ object?: Record<string, unknown>; commitState?: string }>;
  exportAnnotations?: () => PdfTask<EmbedPdfAnnotationTransferItem[]>;
  importAnnotations?: (items: EmbedPdfAnnotationTransferItem[]) => void;
  createAnnotation?: (pageIndex: number, annotation: Record<string, unknown>) => void;
  selectAnnotation?: (pageIndex: number, annotationId: string) => void;
  commit?: () => PdfTask<boolean>;
  onStateChange?: (listener: (state: unknown) => void) => () => void;
  onAnnotationEvent?: (listener: (event: unknown) => void) => () => void;
};

type SelectionCapability = {
  forDocument?: (documentId: string) => SelectionScope;
};

type SelectionScope = {
  getFormattedSelection?: () => FormattedSelection[];
  getSelectedText?: () => PdfTask<string[]>;
  onEndSelection?: (listener: () => void) => () => void;
  onSelectionChange?: (listener: (selection: unknown) => void) => () => void;
  clear?: () => void;
};

type PdfTask<T> = {
  toPromise?: () => Promise<T>;
  wait?: (resolve: (value: T) => void, reject: (error: unknown) => void) => void;
};

type EmbedPdfDocument = {
  pageCount: number;
  pages: Array<{ size: { width: number; height: number } }>;
};

type FormattedSelection = {
  pageIndex: number;
  rect: EmbedPdfRect;
  segmentRects: EmbedPdfRect[];
};

type EmbedPdfRect = {
  origin: { x: number; y: number };
  size: { width: number; height: number };
};

type EmbedPdfAnnotationTransferItem = {
  annotation?: Record<string, unknown>;
  ctx?: unknown;
};

export type EmbedPdfViewerState = {
  version: 1;
  annotations: EmbedPdfAnnotationTransferItem[];
  view?: {
    page?: number | null;
    totalPages?: number | null;
    zoomLevel?: unknown;
    currentZoomLevel?: number | null;
    savedAt?: string;
  };
};

type Props = {
  url: string;
  title?: string;
  fileName?: string;
  initialPage?: number | null;
  initialViewerState?: EmbedPdfViewerState | null;
  className?: string;
  onProgress?: (progress: number, meta?: Record<string, unknown>) => void;
  onViewerStateChange?: (state: EmbedPdfViewerState, meta?: { annotationCount: number; page?: number | null; totalPages?: number | null }) => void;
  onTextSelection?: (selection: PdfTextSelection | null) => void;
  onSelectionAiAction?: (action: "explain" | "ask", selection: PdfTextSelection) => void;
  aiCommentRequest?: EmbedPdfAiCommentRequest | null;
  onAiCommentCreated?: (
    request: EmbedPdfAiCommentRequest,
    result: { ok: boolean; error?: string },
  ) => void;
  assistantPanel?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  readOnly?: boolean;
};

export type EmbedPdfAiCommentRequest = {
  id: string;
  content: string;
  selection: PdfTextSelection;
};

type AssistantSlotSearchRoot = HTMLElement | ShadowRoot;

function capability<T>(registry: EmbedPdfRegistry, name: string): T | null {
  return (registry.getPlugin?.(name)?.provides?.() as T | undefined) ?? null;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function taskToPromise<T>(task: PdfTask<T> | undefined): Promise<T> {
  if (!task) return Promise.reject(new Error("missing pdf task"));
  if (typeof task.toPromise === "function") return task.toPromise();
  return new Promise((resolve, reject) => {
    task.wait?.(resolve, reject);
  });
}

function toEmbedPdfViewerState(value: unknown): EmbedPdfViewerState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<EmbedPdfViewerState>;
  if (!Array.isArray(record.annotations)) return null;
  return {
    version: 1,
    annotations: record.annotations.filter(Boolean),
    view: record.view && typeof record.view === "object" ? record.view : undefined,
  };
}

function annotationCountFromState(state: EmbedPdfViewerState | null | undefined) {
  return filterUserVisibleAnnotations(state?.annotations ?? []).length;
}

function annotationSubtype(annotation: Record<string, unknown>) {
  const rawType = annotation.type;
  if (typeof rawType === "number" && Number.isFinite(rawType)) return rawType;
  if (typeof rawType === "string" && /^\d+$/.test(rawType)) return Number(rawType);
  return null;
}

function isUserVisibleAnnotation(item: EmbedPdfAnnotationTransferItem | null | undefined) {
  const annotation = item?.annotation;
  if (!annotation || typeof annotation !== "object") return false;
  const subtype = annotationSubtype(annotation);
  if (subtype == null || !USER_VISIBLE_ANNOTATION_SUBTYPES.has(subtype)) return false;

  const custom = annotation.custom;
  const hasBioEduCustom = Boolean(
    custom &&
      typeof custom === "object" &&
      "bioedu" in custom,
  );
  return annotation.author === BIOEDU_ANNOTATION_AUTHOR || hasBioEduCustom;
}

function filterUserVisibleAnnotations(annotations: EmbedPdfAnnotationTransferItem[]) {
  return annotations.filter(isUserVisibleAnnotation);
}

function normalizeAnnotationDates(item: EmbedPdfAnnotationTransferItem): EmbedPdfAnnotationTransferItem {
  const annotation = item.annotation;
  if (!annotation) return item;
  const normalized = { ...annotation };
  for (const key of ["created", "modified"] as const) {
    const value = normalized[key];
    if (typeof value === "string" || typeof value === "number") {
      normalized[key] = new Date(value);
    }
  }
  return {
    ...item,
    annotation: normalized,
  };
}

function getCurrentViewState(registry: EmbedPdfRegistry, documentId: string) {
  const scroll = capability<ScrollCapability>(registry, "scroll");
  const zoom = capability<{
    forDocument?: (documentId: string) => {
      getState?: () => { zoomLevel?: unknown; currentZoomLevel?: number };
    };
  }>(registry, "zoom");
  const scrollScope = scroll?.forDocument?.(documentId);
  const zoomState = zoom?.forDocument?.(documentId)?.getState?.();
  return {
    page: scrollScope?.getCurrentPage?.() ?? null,
    totalPages: scrollScope?.getTotalPages?.() ?? null,
    zoomLevel: zoomState?.zoomLevel,
    currentZoomLevel: zoomState?.currentZoomLevel ?? null,
    savedAt: new Date().toISOString(),
  };
}

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `bioedu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function findAssistantSlot(root: AssistantSlotSearchRoot): HTMLElement | null {
  const direct = root.querySelector<HTMLElement>(BIOEDU_ASSISTANT_SLOT_SELECTOR);
  if (direct) return direct;

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (!element.shadowRoot) continue;
    const nested = findAssistantSlot(element.shadowRoot);
    if (nested) return nested;
  }

  return null;
}

function buildAiCommentAnnotation(request: EmbedPdfAiCommentRequest, document: EmbedPdfDocument | null) {
  const pageIndex = Math.max(0, request.selection.pageNumber - 1);
  const page = document?.pages[pageIndex];
  const pageWidth = page?.size.width || 612;
  const pageHeight = page?.size.height || 792;
  const firstRect = request.selection.rects[0];
  if (!firstRect) return null;

  const iconSize = 24;
  const anchorX = firstRect.x * pageWidth;
  const anchorY = firstRect.y * pageHeight;
  const rightEdge = (firstRect.x + firstRect.width) * pageWidth;
  const x = Math.max(0, Math.min(pageWidth - iconSize, rightEdge + 8));
  const y = Math.max(0, Math.min(pageHeight - iconSize, anchorY));

  return {
    id: createRequestId(),
    created: new Date(),
    modified: new Date(),
    flags: ["noRotate", "noZoom", "print"],
    type: PDF_ANNOTATION_SUBTYPE_TEXT,
    name: PDF_ANNOTATION_NAME_COMMENT,
    pageIndex,
    contents: request.content,
    strokeColor: "#3b86e0",
    opacity: 1,
    rect: {
      origin: { x, y },
      size: { width: iconSize, height: iconSize },
    },
    custom: {
      bioedu: {
        kind: "ai_reading_comment",
        requestId: request.id,
        selectedText: request.selection.text,
        anchor: {
          x: anchorX,
          y: anchorY,
          width: firstRect.width * pageWidth,
          height: firstRect.height * pageHeight,
        },
      },
    },
  };
}

async function getAuthenticatedPdfSource(url: string, name: string) {
  const { loadPdfSource } = getReaderRuntime();
  const buffer = loadPdfSource
    ? await loadPdfSource(url)
    : await (async () => {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
          throw new Error(translate("viewer.pdfError"));
        }
        return response.arrayBuffer();
      })();
  return {
    buffer,
    name,
    requestOptions: { credentials: "include" as RequestCredentials },
  };
}

function getSelectionViewportRect(container: HTMLElement): PdfTextSelection["viewportRect"] | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1);
  const rect = rects[0] ?? range.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    const containerRect = container.getBoundingClientRect();
    return {
      x: containerRect.left + containerRect.width / 2 - 80,
      y: containerRect.top + 88,
      width: 160,
      height: 30,
    };
  }
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function formatEmbedSelection(
  document: EmbedPdfDocument | null,
  textParts: string[],
  selectionParts: FormattedSelection[],
  container: HTMLElement,
): PdfTextSelection | null {
  const text = textParts.join("\n").trim();
  if (!text || selectionParts.length === 0) return null;

  const firstPage = selectionParts[0]?.pageIndex ?? 0;
  const page = document?.pages[firstPage];
  const pageWidth = page?.size.width || 1;
  const pageHeight = page?.size.height || 1;
  const rects = selectionParts.flatMap((part) => {
    const pageSize = document?.pages[part.pageIndex]?.size ?? { width: pageWidth, height: pageHeight };
    return (part.segmentRects?.length ? part.segmentRects : [part.rect]).map((rect) => ({
      x: clamp01(rect.origin.x / Math.max(1, pageSize.width)),
      y: clamp01(rect.origin.y / Math.max(1, pageSize.height)),
      width: clamp01(rect.size.width / Math.max(1, pageSize.width)),
      height: clamp01(rect.size.height / Math.max(1, pageSize.height)),
    }));
  });

  return {
    text,
    pageNumber: firstPage + 1,
    rects,
    viewportRect: getSelectionViewportRect(container) ?? { x: 24, y: 96, width: 280, height: 40 },
  };
}

const RUNTIME_LABEL_KEYS = [
  "__ODHU_AI_HINT__",
  "__ODHU_ASSISTANT_TITLE__",
  "__ODHU_ASSISTANT_CLOSE__",
  "__ODHU_CLOSE__",
  "__ODHU_COMMENTS_TITLE__",
  "__ODHU_PAGE_RANGE__",
  "__ODHU_ASSISTANT_TAB__",
] as const;

// The vendored EmbedPDF runtime exposes a few custom control labels through
// `globalThis.__ODHU_*` hooks (see scripts/patch-embedpdf-i18n.mjs); this sets
// them for the active locale and clears them for the built-in Chinese copy.
function applyRuntimeLabelOverrides(locale: string) {
  const target = globalThis as Record<string, unknown>;
  for (const key of RUNTIME_LABEL_KEYS) {
    delete target[key];
  }
  if (locale === "zh-CN") return;
  target.__ODHU_AI_HINT__ = "AI assist, literature Q&A and reading goals";
  target.__ODHU_ASSISTANT_TITLE__ = "Reading assistant";
  target.__ODHU_ASSISTANT_CLOSE__ = "Close reading assistant";
  target.__ODHU_CLOSE__ = "Close";
  target.__ODHU_COMMENTS_TITLE__ = "Comments";
  target.__ODHU_PAGE_RANGE__ = (page: number) => `Pages 1-${page}`;
  target.__ODHU_ASSISTANT_TAB__ = "AI Assist";
}

// Command labels live in a module-level object inside the vendored runtime
// (evaluated once per import), so they are localized by mutating the exposed
// command registry before the viewer initializes.
function localizeRuntimeCommands(locale: string) {
  const registry = (globalThis as Record<string, unknown>).__ODHU_UC__ as
    | Record<string, { label?: string }>
    | undefined;
  if (!registry) return;
  const zh = locale === "zh-CN";
  const apply = (id: string, zhLabel: string, enLabel: string) => {
    const command = registry[id];
    if (command) command.label = zh ? zhLabel : enLabel;
  };
  apply("bioedu:selection-explain", "AI 解读", "Explain with AI");
  apply("bioedu:selection-ask", "提问", "Ask AI");
  apply("bioedu:toggle-literature-assistant", "AI 助读", "AI Assist");
}

export function EmbedPdfLiteratureViewer({
  url,
  title,
  fileName,
  initialPage = 1,
  initialViewerState = null,
  className,
  onProgress,
  onViewerStateChange,
  onTextSelection,
  onSelectionAiAction,
  aiCommentRequest,
  onAiCommentCreated,
  assistantPanel,
  assistantOpen = false,
  onAssistantOpenChange,
  readOnly = false,
}: Props) {
  const { t, locale } = useReaderI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<EmbedPdfContainer | null>(null);
  const registryRef = useRef<EmbedPdfRegistry | null>(null);
  const activeDocumentIdRef = useRef<string | null>(null);
  const onProgressRef = useRef(onProgress);
  const onViewerStateChangeRef = useRef(onViewerStateChange);
  const onTextSelectionRef = useRef(onTextSelection);
  const onSelectionAiActionRef = useRef(onSelectionAiAction);
  const onAiCommentCreatedRef = useRef(onAiCommentCreated);
  const handledAiCommentRequestIdRef = useRef<string | null>(null);
  const initialViewerStateRef = useRef<EmbedPdfViewerState | null>(toEmbedPdfViewerState(initialViewerState));
  const importedViewerStateDocumentIdsRef = useRef<Set<string>>(new Set());
  const viewerStateSaveTimerRef = useRef<number | null>(null);
  const viewerStateExportingRef = useRef(false);
  const pendingViewerStateExportRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [assistantSlot, setAssistantSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onViewerStateChangeRef.current = onViewerStateChange;
    onTextSelectionRef.current = onTextSelection;
    onSelectionAiActionRef.current = onSelectionAiAction;
    onAiCommentCreatedRef.current = onAiCommentCreated;
  }, [onProgress, onViewerStateChange, onTextSelection, onSelectionAiAction, onAiCommentCreated]);

  useEffect(() => {
    initialViewerStateRef.current = toEmbedPdfViewerState(initialViewerState);
  }, [initialViewerState]);

  const openAssistantSidebar = () => {
    const registry = registryRef.current;
    const documentId = activeDocumentIdRef.current;
    if (!registry || !documentId) return;
    const ui = capability<UiCapability>(registry, "ui");
    ui?.forDocument?.(documentId)?.setActiveSidebar?.("right", "main", BIOEDU_ASSISTANT_PANEL_ID);
    onAssistantOpenChange?.(true);
  };

  useEffect(() => {
    if (assistantOpen) {
      openAssistantSidebar();
    }
  }, [assistantOpen]);

  useEffect(() => {
    if (!aiCommentRequest || handledAiCommentRequestIdRef.current === aiCommentRequest.id) return;
    const registry = registryRef.current;
    const documentId = activeDocumentIdRef.current;
    if (!registry || !documentId || status !== "ready") return;

    const annotation = capability<AnnotationCapability>(registry, ANNOTATION_PLUGIN_ID);
    const annotationScope = annotation?.forDocument?.(documentId);
    const documentManager = capability<DocumentManagerCapability>(registry, "document-manager");
    const commentAnnotation = buildAiCommentAnnotation(
      aiCommentRequest,
      documentManager?.getActiveDocument?.() ?? null,
    );

    if (!annotationScope?.createAnnotation || !commentAnnotation) {
      handledAiCommentRequestIdRef.current = aiCommentRequest.id;
      onAiCommentCreatedRef.current?.(aiCommentRequest, {
        ok: false,
        error: translate("viewer.commentAnchorError"),
      });
      return;
    }

    try {
      annotationScope.createAnnotation(commentAnnotation.pageIndex as number, commentAnnotation);
      annotationScope.selectAnnotation?.(commentAnnotation.pageIndex as number, commentAnnotation.id as string);
      annotationScope.commit?.();
      window.setTimeout(() => {
        const event = new CustomEvent("bioedu:embedpdf-viewer-state-dirty", {
          detail: { reason: "ai-comment" },
        });
        window.dispatchEvent(event);
      }, 250);
      const ui = capability<UiCapability>(registry, "ui");
      ui?.forDocument?.(documentId)?.setActiveSidebar?.("right", "main", COMMENT_PANEL_ID);
      handledAiCommentRequestIdRef.current = aiCommentRequest.id;
      onAiCommentCreatedRef.current?.(aiCommentRequest, { ok: true });
    } catch (caught) {
      handledAiCommentRequestIdRef.current = aiCommentRequest.id;
      onAiCommentCreatedRef.current?.(aiCommentRequest, {
        ok: false,
        error: caught instanceof Error ? caught.message : translate("viewer.commentError"),
      });
    }
  }, [aiCommentRequest, status]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observedRoots = new Set<AssistantSlotSearchRoot>();
    const observeShadowRoots = (root: AssistantSlotSearchRoot) => {
      for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        if (!element.shadowRoot || observedRoots.has(element.shadowRoot)) continue;
        observer.observe(element.shadowRoot, { childList: true, subtree: true });
        observedRoots.add(element.shadowRoot);
        observeShadowRoots(element.shadowRoot);
      }
    };
    const syncSlot = () => {
      observeShadowRoots(host);
      setAssistantSlot(findAssistantSlot(host));
    };

    const observer = new MutationObserver(syncSlot);
    observer.observe(host, { childList: true, subtree: true });
    observedRoots.add(host);
    syncSlot();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const unsubs: Array<() => void> = [];
    setStatus("loading");
    setError(null);
    setAssistantSlot(null);
    registryRef.current = null;
    activeDocumentIdRef.current = null;
    importedViewerStateDocumentIdsRef.current = new Set();
    onTextSelectionRef.current?.(null);
    host.innerHTML = "";

    async function initViewer() {
      try {
        const embedPdfEntry = new URL(EMBEDPDF_ENTRY, window.location.origin).href;
        const embedPdf = (await import(/* @vite-ignore */ embedPdfEntry)) as EmbedPdfModule;
        if (disposed || !host) return;
        const documentName = fileName || title || "literature.pdf";
        const authenticatedSource = await getAuthenticatedPdfSource(url, documentName);
        if (disposed || !host) return;
        const initialDocument = authenticatedSource
          ? {
              buffer: authenticatedSource.buffer,
              name: authenticatedSource.name,
            }
          : {
              url,
              name: documentName,
            };
        applyRuntimeLabelOverrides(locale);
        localizeRuntimeCommands(locale);
        const viewer = embedPdf.default.init({
          type: "container",
          target: host,
          worker: false,
          wasmUrl: EMBEDPDF_WASM,
          documentManager: {
            initialDocuments: [initialDocument],
          },
          tabBar: "never",
          fonts: {
            ui: {
              family:
                '"Inter","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif',
              stylesheetUrl: null,
            },
            signature: null,
          },
          disabledCategories: [
            "redaction",
            "form",
            "insert",
            "stamp",
            "signature",
            "document-open",
            "document-protect",
            ...(readOnly
              ? [
                  "annotation",
                  "mode-annotate",
                  "mode-shapes",
                  "annotation-markup",
                  "annotation-shape",
                  "annotation-comment-tool",
                  "panel-annotation-style",
                  "bioedu",
                  "bioedu-literature-assistant",
                ]
              : []),
          ],
          i18n: {
            defaultLocale: locale,
          },
          theme: {
            preference: "light",
            light: {
              background: {
                app: "#e8eef3",
                surface: "#ffffff",
                surfaceAlt: "#f5f8fb",
                elevated: "#ffffff",
              },
              accent: {
                primary: "#2f74c9",
                primaryHover: "#0369a1",
                primaryActive: "#075985",
                primaryLight: "#eaf3fd",
              },
              interactive: {
                selected: "#eaf3fd",
                focus: "#2f74c9",
                focusRing: "#bae6fd",
              },
              scrollbar: {
                track: "#edf2f7",
                thumb: "#cbd5e1",
                thumbHover: "#a6aec0",
              },
            },
          },
          scroll: {
            defaultStrategy: "vertical",
            defaultPageGap: 18,
            defaultBufferSize: 5,
          },
          zoom: {
            defaultZoomLevel: "fit-width",
            minZoom: 0.35,
            maxZoom: 5,
          },
          pan: {
            defaultMode: "mobile",
          },
          selection: {
            menuHeight: 44,
            toleranceFactor: 1.6,
          },
          annotations: {
            autoCommit: true,
            annotationAuthor: BIOEDU_ANNOTATION_AUTHOR,
          },
          stamp: {
            manifests: [],
            defaultLibrary: false,
          },
          export: {
            defaultFileName: fileName || title || "literature.pdf",
          },
        });

        if (!viewer) throw new Error(translate("viewer.initError"));
        viewerRef.current = viewer;
        const registry = await viewer.registry;
        if (disposed) return;
        registryRef.current = registry;

        const documentManager = capability<DocumentManagerCapability>(registry, "document-manager");
        const scroll = capability<ScrollCapability>(registry, "scroll");
        const selection = capability<SelectionCapability>(registry, "selection");
        const annotation = capability<AnnotationCapability>(registry, ANNOTATION_PLUGIN_ID);

        const exportAndEmitViewerState = async () => {
          const documentId = activeDocumentIdRef.current;
          if (!documentId || disposed) return;
          const annotationScope = annotation?.forDocument?.(documentId);
          if (!annotationScope?.exportAnnotations) return;
          if (readOnly) return;
          if (viewerStateExportingRef.current) {
            pendingViewerStateExportRef.current = true;
            return;
          }
          viewerStateExportingRef.current = true;
          try {
            const annotations = filterUserVisibleAnnotations(await taskToPromise(annotationScope.exportAnnotations()));
            if (disposed) return;
            const view = getCurrentViewState(registry, documentId);
            onViewerStateChangeRef.current?.(
              {
                version: 1,
                annotations,
                view,
              },
              {
                annotationCount: annotationCountFromState({ version: 1, annotations }),
                page: view.page,
                totalPages: view.totalPages,
              },
            );
          } catch {
            // EmbedPDF may reject while a PDF commit is still settling; the next dirty signal retries.
          } finally {
            viewerStateExportingRef.current = false;
            if (pendingViewerStateExportRef.current && !disposed) {
              pendingViewerStateExportRef.current = false;
              scheduleViewerStateExport();
            }
          }
        };

        const scheduleViewerStateExport = () => {
          if (viewerStateSaveTimerRef.current) {
            window.clearTimeout(viewerStateSaveTimerRef.current);
          }
          viewerStateSaveTimerRef.current = window.setTimeout(() => {
            viewerStateSaveTimerRef.current = null;
            void exportAndEmitViewerState();
          }, 900);
        };

        const importViewerState = (documentId: string) => {
          if (importedViewerStateDocumentIdsRef.current.has(documentId)) return;
          importedViewerStateDocumentIdsRef.current.add(documentId);
          const savedState = initialViewerStateRef.current;
          if (!savedState?.annotations?.length) return;
          const visibleAnnotations = filterUserVisibleAnnotations(savedState.annotations);
          if (!visibleAnnotations.length) return;
          const annotationScope = annotation?.forDocument?.(documentId);
          if (!annotationScope?.importAnnotations) return;
          try {
            annotationScope.importAnnotations(visibleAnnotations.map(normalizeAnnotationDates));
            if (readOnly) annotation?.setLocked?.({ type: "all" }, documentId);
          } catch {
            // Keep the PDF usable even if an older state snapshot has unsupported annotation data.
          }
        };

        const saveProgress = (page: number, totalPages?: number | null) => {
          const total = totalPages && totalPages > 0 ? totalPages : documentManager?.getActiveDocument?.()?.pageCount ?? null;
          const progress = total ? clamp01(page / total) : 0;
          if (readOnly) return;
          onProgressRef.current?.(progress, {
            page,
            total_pages: total,
            source: "embedpdf",
          });
        };

        const attachSelection = (documentId: string) => {
          const scope = selection?.forDocument?.(documentId);
          if (!scope) return;
          const syncSelection = async () => {
            if (disposed || !host) return;
            const formatted = scope.getFormattedSelection?.() ?? [];
            if (formatted.length === 0) {
              onTextSelectionRef.current?.(null);
              return;
            }
            try {
              const text = await taskToPromise(scope.getSelectedText?.());
              if (disposed) return;
              onTextSelectionRef.current?.(
                formatEmbedSelection(documentManager?.getActiveDocument?.() ?? null, text, formatted, host),
              );
            } catch {
              onTextSelectionRef.current?.(null);
            }
          };
          unsubs.push(scope.onEndSelection?.(syncSelection) ?? (() => {}));
          unsubs.push(
            scope.onSelectionChange?.((value) => {
              if (!value) onTextSelectionRef.current?.(null);
            }) ?? (() => {}),
          );
        };

        const focusInitialPage = (documentId: string, pageCount?: number | null) => {
          const savedPage = Number(initialViewerStateRef.current?.view?.page ?? 0) || null;
          const page = Math.max(1, Math.floor(savedPage || initialPage || 1));
          window.setTimeout(() => {
            scroll?.forDocument?.(documentId)?.scrollToPage?.({
              pageNumber: page,
              behavior: "auto",
              alignY: 8,
            });
            saveProgress(page, pageCount ?? null);
          }, 250);
        };

        const handleSelectionAiAction = async (event: Event) => {
          if (disposed || !host) return;
          const detail = (event as CustomEvent).detail as
            | {
                action?: "explain" | "ask";
                selection?: FormattedSelection[];
                selectedText?: string;
              }
            | undefined;
          if (detail?.action !== "explain" && detail?.action !== "ask") return;
          const formatted = detail.selection ?? selection?.forDocument?.(documentManager?.getActiveDocumentId?.() ?? "")?.getFormattedSelection?.() ?? [];
          const text = detail.selectedText ? [detail.selectedText] : [];
          const formattedSelection = formatEmbedSelection(
            documentManager?.getActiveDocument?.() ?? null,
            text,
            formatted,
            host,
          );
          if (!formattedSelection) return;
          openAssistantSidebar();
          onTextSelectionRef.current?.(formattedSelection);
          onSelectionAiActionRef.current?.(detail.action, formattedSelection);
        };
        window.addEventListener("bioedu:pdf-selection-ai-action", handleSelectionAiAction);
        unsubs.push(() => window.removeEventListener("bioedu:pdf-selection-ai-action", handleSelectionAiAction));

        const handleExternalViewerDirty = () => scheduleViewerStateExport();
        window.addEventListener("bioedu:embedpdf-viewer-state-dirty", handleExternalViewerDirty);
        unsubs.push(() => window.removeEventListener("bioedu:embedpdf-viewer-state-dirty", handleExternalViewerDirty));

        unsubs.push(
          documentManager?.onDocumentOpened?.((state) => {
            if (disposed) return;
            activeDocumentIdRef.current = state.id;
            setStatus("ready");
            importViewerState(state.id);
            focusInitialPage(state.id, state.document?.pageCount ?? null);
            attachSelection(state.id);
            const annotationScope = annotation?.forDocument?.(state.id);
            if (!readOnly) {
              unsubs.push(annotationScope?.onStateChange?.(() => scheduleViewerStateExport()) ?? (() => {}));
              unsubs.push(annotationScope?.onAnnotationEvent?.(() => scheduleViewerStateExport()) ?? (() => {}));
            }
          }) ?? (() => {}),
        );

        unsubs.push(
          scroll?.onPageChange?.((event) => {
            if (disposed) return;
            saveProgress(event.pageNumber, event.totalPages);
            if (!readOnly) scheduleViewerStateExport();
          }) ?? (() => {}),
        );

        const currentDocumentId = documentManager?.getActiveDocumentId?.();
        if (currentDocumentId) {
          activeDocumentIdRef.current = currentDocumentId;
          setStatus("ready");
          importViewerState(currentDocumentId);
          focusInitialPage(currentDocumentId, documentManager?.getActiveDocument?.()?.pageCount ?? null);
          attachSelection(currentDocumentId);
          const annotationScope = annotation?.forDocument?.(currentDocumentId);
          if (!readOnly) {
            unsubs.push(annotationScope?.onStateChange?.(() => scheduleViewerStateExport()) ?? (() => {}));
            unsubs.push(annotationScope?.onAnnotationEvent?.(() => scheduleViewerStateExport()) ?? (() => {}));
          }
        }

        window.setTimeout(() => {
          if (!disposed) setStatus("ready");
        }, 1200);
      } catch (caught) {
        if (disposed) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : translate("viewer.loadError"));
      }
    }

    initViewer();

    return () => {
      disposed = true;
      for (const unsub of unsubs) {
        try {
          unsub();
        } catch {
          // ignore stale plugin cleanup
        }
      }
      onTextSelectionRef.current?.(null);
      viewerRef.current = null;
      registryRef.current = null;
      activeDocumentIdRef.current = null;
      if (viewerStateSaveTimerRef.current) {
        window.clearTimeout(viewerStateSaveTimerRef.current);
        viewerStateSaveTimerRef.current = null;
      }
      setAssistantSlot(null);
      host.innerHTML = "";
    };
  }, [url, title, fileName, initialPage, readOnly, locale]);

  return (
    <div
      className={cn(
        "relative h-[min(78vh,980px)] min-h-[620px] overflow-hidden rounded-2xl border border-ink-200 bg-ink-900 shadow-[0_30px_90px_-46px_rgba(15,23,42,0.75)]",
        className,
      )}
      >
      <div ref={hostRef} className="h-full w-full bg-ink-200" />
      {assistantPanel && assistantSlot ? createPortal(assistantPanel, assistantSlot) : null}
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/12 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/75 bg-white/90 px-4 py-3 text-sm font-semibold text-ink-700 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin text-info-600" />
            {t("viewer.loadingTitle")}
          </div>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-100 p-6">
          <div className="max-w-md rounded-2xl border border-danger-200 bg-white p-5 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-50 text-danger-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink-950">{t("viewer.errorTitle")}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-500">{error || t("viewer.retry")}</p>
            <Button className="mt-4" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <FileSearch className="mr-2 h-4 w-4" />
                {t("viewer.openNewTab")}
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
