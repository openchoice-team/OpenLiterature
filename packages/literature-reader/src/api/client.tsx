import { createContext, useContext, useEffect, type ReactNode } from "react";

import { translate } from "../i18n";
import { configureReaderRuntime } from "./runtime";
import type {
  LiteratureAssistResponse,
  LiteratureComparisonResponse,
  LiteratureItem,
  LiteratureKnowledgeAskResponse,
  LiteratureKnowledgeScope,
  LiteratureProgress,
  LiteratureViewerState,
} from "./types";

/** Payload for `LiteratureReaderClient.uploadItem` (multipart). */
export type UploadLiteratureItemPayload = {
  file: File;
  title?: string;
  authors?: string[];
  year?: number | null;
  doi?: string | null;
  source_url?: string | null;
  abstract_text?: string | null;
  publication_title?: string | null;
};

export type UpdateProgressPayload = {
  progress_pct: number;
  page_no?: number | null;
  total_pages?: number | null;
  meta_json?: Record<string, unknown>;
};

export type UpsertViewerStatePayload = {
  state_json: Record<string, unknown>;
  annotation_count?: number;
  last_page_no?: number | null;
  total_pages?: number | null;
};

export type AssistMode = "page" | "full" | "questions" | "ask";

export type AssistPayload = {
  mode: AssistMode;
  question?: string;
  page_no?: number | null;
  selected_text?: string | null;
};

export type KnowledgeAskPayload = {
  scope: LiteratureKnowledgeScope | string;
  question: string;
  item_id?: string | null;
};

export type KnowledgeComparePayload = {
  item_ids: string[];
  question?: string;
  max_chunks_per_item?: number;
};

/**
 * Data adapter for the literature reading room.
 *
 * Components never talk to a concrete backend directly; hosts pass an
 * implementation through `<LiteratureReaderProvider>`. Use
 * `createHttpLiteratureReaderClient` for the reference REST contract, or
 * implement the interface for tests / other data sources.
 */
export type LiteratureReaderClient = {
  listItems: () => Promise<LiteratureItem[]>;
  uploadItem: (payload: UploadLiteratureItemPayload) => Promise<LiteratureItem>;
  deleteItem: (itemId: string) => Promise<void>;
  /** Stream URL of the PDF file (the viewer fetches it through the runtime). */
  fileUrl: (itemId: string) => string;
  getFileSource: (itemId: string) => Promise<ArrayBuffer>;
  getViewerState: (itemId: string) => Promise<LiteratureViewerState>;
  saveViewerState: (
    itemId: string,
    payload: UpsertViewerStatePayload,
  ) => Promise<LiteratureViewerState>;
  updateProgress: (
    itemId: string,
    payload: UpdateProgressPayload,
  ) => Promise<LiteratureProgress>;
  importToRag: (itemId: string) => Promise<LiteratureItem>;
  assist: (itemId: string, payload: AssistPayload) => Promise<LiteratureAssistResponse>;
  askKnowledge: (payload: KnowledgeAskPayload) => Promise<LiteratureKnowledgeAskResponse>;
  compareKnowledge: (
    payload: KnowledgeComparePayload,
  ) => Promise<LiteratureComparisonResponse>;
};

const LiteratureReaderContext = createContext<LiteratureReaderClient | null>(null);

export function LiteratureReaderProvider({
  client,
  children,
}: {
  client: LiteratureReaderClient;
  children: ReactNode;
}) {
  useEffect(() => {
    configureReaderRuntime({
      loadPdfSource: (url) => {
        const match = url.match(/\/literature\/items\/([^/]+)\/file/);
        if (!match) {
          throw new Error(`无法解析文献文件地址：${url}`);
        }
        return client.getFileSource(match[1]);
      },
    });
  }, [client]);
  return (
    <LiteratureReaderContext.Provider value={client}>{children}</LiteratureReaderContext.Provider>
  );
}

export function useLiteratureReaderClient(): LiteratureReaderClient {
  const client = useContext(LiteratureReaderContext);
  if (!client) {
    throw new Error(
      "LiteratureReaderProvider is missing: wrap the reading room in <LiteratureReaderProvider client={...}>.",
    );
  }
  return client;
}

export type HttpLiteratureReaderClientOptions = {
  /** API base URL, e.g. `https://api.example.com` or `/api`. */
  baseUrl: string;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof fetch;
  /** Current bearer token, if any. */
  getAccessToken?: () => string | null;
  /** Refresh the bearer token; return the new token or null. */
  refreshAccessToken?: () => Promise<string | null>;
  credentials?: RequestCredentials;
};

export function createHttpLiteratureReaderClient({
  baseUrl,
  fetch: fetchImpl,
  getAccessToken,
  refreshAccessToken,
  credentials = "include",
}: HttpLiteratureReaderClientOptions): LiteratureReaderClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const root = baseUrl.replace(/\/$/, "");

  function authHeaders(): HeadersInit | undefined {
    const token = getAccessToken?.() ?? null;
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const auth = authHeaders();
    if (auth) new Headers(auth).forEach((value, key) => headers.set(key, value));
    const response = await doFetch(`${root}${path}`, { ...init, headers, credentials });
    if (!response.ok) {
      let message = response.statusText || `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        message = body?.error?.message ?? message;
      } catch {
        // non-JSON error body
      }
      throw new Error(message);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const json = (body: unknown) => ({ body: JSON.stringify(body ?? {}) });

  const fileUrl = (itemId: string) => `${root}/literature/items/${itemId}/file`;

  async function loadPdfSource(url: string): Promise<ArrayBuffer> {
    const response = await doFetch(url, { credentials, headers: authHeaders() });
    if (response.status === 401 && refreshAccessToken) {
      await refreshAccessToken();
      const retry = await doFetch(url, { credentials, headers: authHeaders() });
      if (retry.ok) return retry.arrayBuffer();
      throw new Error(translate("viewer.pdfError"));
    }
    if (!response.ok) {
      throw new Error(translate("viewer.pdfError"));
    }
    return response.arrayBuffer();
  }

  configureReaderRuntime({
    baseUrl: root,
    getAccessToken,
    refreshAccessToken,
    loadPdfSource,
  });

  return {
    listItems: () => request(`/literature/items`),
    uploadItem: (payload) => {
      const form = new FormData();
      form.append("file", payload.file, payload.file.name);
      if (payload.title) form.append("title", payload.title);
      if (payload.authors?.length) form.append("authors", JSON.stringify(payload.authors));
      if (payload.year != null) form.append("year", String(payload.year));
      if (payload.doi) form.append("doi", payload.doi);
      if (payload.source_url) form.append("source_url", payload.source_url);
      if (payload.abstract_text) form.append("abstract_text", payload.abstract_text);
      if (payload.publication_title) form.append("publication_title", payload.publication_title);
      return request(`/literature/items/upload`, { method: "POST", body: form });
    },
    deleteItem: (itemId) =>
      request(`/literature/items/${itemId}`, { method: "DELETE", ...json({}) }),
    fileUrl,
    getFileSource: (itemId) => loadPdfSource(fileUrl(itemId)),
    getViewerState: (itemId) => request(`/literature/items/${itemId}/viewer-state`),
    saveViewerState: (itemId, payload) =>
      request(`/literature/items/${itemId}/viewer-state`, { method: "PUT", ...json(payload) }),
    updateProgress: (itemId, payload) =>
      request(`/literature/items/${itemId}/progress`, { method: "PATCH", ...json(payload) }),
    importToRag: (itemId) =>
      request(`/literature/items/${itemId}/rag-import`, { method: "POST", ...json({}) }),
    assist: (itemId, payload) =>
      request(`/literature/items/${itemId}/assist`, { method: "POST", ...json(payload) }),
    askKnowledge: (payload) =>
      request(`/literature/knowledge/ask`, { method: "POST", ...json(payload) }),
    compareKnowledge: (payload) =>
      request(`/literature/knowledge/compare`, { method: "POST", ...json(payload) }),
  };
}
