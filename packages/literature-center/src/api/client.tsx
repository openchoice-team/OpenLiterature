import { createContext, useContext, type ReactNode } from "react";

import type {
  AcademicDiscoverySearchResponse,
  AcademicFulltextJob,
  AcademicIntelligenceMapData,
  AcademicIntelligenceMapFilters,
  AcademicLiteratureCoverage,
  AcademicLiteratureState,
  AcademicLiteratureTopic,
  AcademicLiteratureWork,
  AcademicResearchOrigins,
} from "./types";

/**
 * Data adapter for the literature center.
 *
 * The component tree never talks to a concrete backend directly; hosts pass an
 * implementation through `<LiteratureCenterProvider>`. `createHttpLiteratureCenterClient`
 * covers the reference REST contract, and any app can supply its own client
 * (authenticated fetch, tRPC, GraphQL, in-memory mocks for tests...).
 */
export type LiteratureCenterClient = {
  getAcademicIntelligenceMap: (
    courseId: string,
    params?: AcademicIntelligenceMapFilters,
  ) => Promise<AcademicIntelligenceMapData>;
  getAcademicCoverage: (
    courseId: string,
    topicId?: string | null,
  ) => Promise<AcademicLiteratureCoverage>;
  getAcademicResearchOrigins: (
    courseId: string,
    limit?: number,
    topicId?: string | null,
  ) => Promise<AcademicResearchOrigins>;
  searchAcademicWorks: (
    courseId: string,
    payload: { query: string; max_results?: number; topic_id?: string },
  ) => Promise<AcademicDiscoverySearchResponse>;
  listAcademicWorks: (
    courseId: string,
    params?: {
      state?: AcademicLiteratureState | string;
      q?: string;
      topic_id?: string;
      page?: number;
      page_size?: number;
    },
  ) => Promise<AcademicLiteratureWork[]>;
  listAcademicTopics: (courseId: string) => Promise<AcademicLiteratureTopic[]>;
  createAcademicTopic: (
    courseId: string,
    payload: { name: string; query_text: string; description?: string; auto_refresh?: boolean },
  ) => Promise<AcademicLiteratureTopic>;
  updateAcademicTopic: (
    courseId: string,
    topicId: string,
    payload: { name: string; query_text: string; description?: string; auto_refresh?: boolean },
  ) => Promise<AcademicLiteratureTopic>;
  deleteAcademicTopic: (courseId: string, topicId: string) => Promise<{ deleted: boolean }>;
  refreshAcademicTopic: (
    courseId: string,
    topicId: string,
  ) => Promise<AcademicDiscoverySearchResponse>;
  markAcademicTopicRead: (
    courseId: string,
    topicId: string,
  ) => Promise<AcademicLiteratureTopic>;
  updateAcademicWorkState: (
    courseId: string,
    workId: string,
    state: AcademicLiteratureState,
  ) => Promise<AcademicLiteratureWork>;
  enqueueAcademicFulltext: (
    courseId: string,
    workId: string,
  ) => Promise<AcademicFulltextJob>;
  cancelAcademicFulltext: (
    courseId: string,
    workId: string,
    jobId: string,
  ) => Promise<AcademicFulltextJob>;
};

const LiteratureCenterContext = createContext<LiteratureCenterClient | null>(null);

export function LiteratureCenterProvider({
  client,
  children,
}: {
  client: LiteratureCenterClient;
  children: ReactNode;
}) {
  return (
    <LiteratureCenterContext.Provider value={client}>{children}</LiteratureCenterContext.Provider>
  );
}

export function useLiteratureCenterClient(): LiteratureCenterClient {
  const client = useContext(LiteratureCenterContext);
  if (!client) {
    throw new Error(
      "LiteratureCenterProvider is missing: wrap the literature center in <LiteratureCenterProvider client={...}>.",
    );
  }
  return client;
}

export type HttpLiteratureCenterClientOptions = {
  /** API base URL, e.g. `https://api.example.com` or `/api`. */
  baseUrl: string;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof fetch;
  /** Headers resolved per request, e.g. a bearer token. */
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
};

export function createHttpLiteratureCenterClient({
  baseUrl,
  fetch: fetchImpl,
  getHeaders,
  credentials = "same-origin",
}: HttpLiteratureCenterClientOptions): LiteratureCenterClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const root = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const extra = await getHeaders?.();
    new Headers(extra).forEach((value, key) => headers.set(key, value));
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

  return {
    getAcademicIntelligenceMap: (courseId, params) => {
      const query = new URLSearchParams();
      if (params?.state) query.set("state", params.state);
      if (params?.q) query.set("q", params.q);
      if (params?.topic_id) query.set("topic_id", params.topic_id);
      if (params?.year_from) query.set("year_from", String(params.year_from));
      if (params?.year_to) query.set("year_to", String(params.year_to));
      if (params?.open_access_only) query.set("open_access_only", "true");
      if (params?.work_limit) query.set("work_limit", String(params.work_limit));
      const suffix = query.toString();
      return request(`/courses/${courseId}/literature/intelligence/map${suffix ? `?${suffix}` : ""}`);
    },
    getAcademicCoverage: (courseId, topicId) =>
      request(
        `/courses/${courseId}/literature/discovery/coverage${topicId ? `?topic_id=${encodeURIComponent(topicId)}` : ""}`,
      ),
    getAcademicResearchOrigins: (courseId, limit = 10, topicId) =>
      request(
        `/courses/${courseId}/literature/discovery/origins?limit=${limit}${topicId ? `&topic_id=${encodeURIComponent(topicId)}` : ""}`,
      ),
    searchAcademicWorks: (courseId, payload) =>
      request(`/courses/${courseId}/literature/discovery/search`, {
        method: "POST",
        ...json(payload),
      }),
    listAcademicWorks: (courseId, params) => {
      const query = new URLSearchParams();
      if (params?.state) query.set("state", params.state);
      if (params?.q) query.set("q", params.q);
      if (params?.topic_id) query.set("topic_id", params.topic_id);
      if (params?.page) query.set("page", String(params.page));
      if (params?.page_size) query.set("page_size", String(params.page_size));
      const suffix = query.toString();
      return request(`/courses/${courseId}/literature/discovery/works${suffix ? `?${suffix}` : ""}`);
    },
    listAcademicTopics: (courseId) => request(`/courses/${courseId}/literature/topics`),
    createAcademicTopic: (courseId, payload) =>
      request(`/courses/${courseId}/literature/topics`, { method: "POST", ...json(payload) }),
    updateAcademicTopic: (courseId, topicId, payload) =>
      request(`/courses/${courseId}/literature/topics/${topicId}`, {
        method: "PATCH",
        ...json(payload),
      }),
    deleteAcademicTopic: (courseId, topicId) =>
      request(`/courses/${courseId}/literature/topics/${topicId}`, {
        method: "DELETE",
        ...json({}),
      }),
    refreshAcademicTopic: (courseId, topicId) =>
      request(`/courses/${courseId}/literature/topics/${topicId}/refresh`, {
        method: "POST",
        ...json({}),
      }),
    markAcademicTopicRead: (courseId, topicId) =>
      request(`/courses/${courseId}/literature/topics/${topicId}/read`, {
        method: "POST",
        ...json({}),
      }),
    updateAcademicWorkState: (courseId, workId, state) =>
      request(`/courses/${courseId}/literature/discovery/works/${workId}`, {
        method: "PATCH",
        ...json({ state }),
      }),
    enqueueAcademicFulltext: (courseId, workId) =>
      request(`/courses/${courseId}/literature/discovery/works/${workId}/fulltext`, {
        method: "POST",
        ...json({}),
      }),
    cancelAcademicFulltext: (courseId, workId, jobId) =>
      request(`/courses/${courseId}/literature/discovery/works/${workId}/fulltext/${jobId}`, {
        method: "DELETE",
        ...json({}),
      }),
  };
}
