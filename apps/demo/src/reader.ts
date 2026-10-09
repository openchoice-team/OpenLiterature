import {
  createHttpLiteratureReaderClient,
  type LiteratureReaderClient,
} from "@opendhu/literature-reader";

const readerOrigin =
  (import.meta.env.VITE_READER_API as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8790`;

export const READER_API_BASE = readerOrigin.endsWith("/api")
  ? readerOrigin
  : `${readerOrigin.replace(/\/$/, "")}/api`;

const TOKEN_KEY = "opendhu.reader.token";

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function getReaderToken() {
  return token;
}

export function clearReaderToken() {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
}

export type ReaderUser = { id: string; name: string };

export async function devLogin(name: string): Promise<ReaderUser> {
  const response = await fetch(`${READER_API_BASE}/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    user?: ReaderUser;
    error?: { message?: string };
  };
  if (!response.ok || !body.access_token || !body.user) {
    throw new Error(body.error?.message ?? "登录失败");
  }
  token = body.access_token;
  localStorage.setItem(TOKEN_KEY, token);
  return body.user;
}

export const readerClient: LiteratureReaderClient = createHttpLiteratureReaderClient({
  baseUrl: READER_API_BASE,
  getAccessToken: () => token,
});
