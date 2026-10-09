/**
 * Runtime configuration shared by the reader components.
 *
 * The viewer and markdown renderer need to build asset URLs and fetch
 * authenticated PDF bytes. The host application wires these through
 * `configureReaderRuntime` (usually via `LiteratureReaderProvider`).
 */
export type ReaderRuntime = {
  /** API base URL, e.g. `https://api.example.com` or `/api`. */
  baseUrl: string;
  /** Current bearer token, if any. */
  getAccessToken?: () => string | null;
  /** Refresh the bearer token and return the new one (or null). */
  refreshAccessToken?: () => Promise<string | null>;
  /** Fetch the raw PDF bytes for an item file URL. */
  loadPdfSource?: (url: string) => Promise<ArrayBuffer>;
};

let runtime: ReaderRuntime = { baseUrl: "/api" };

export function configureReaderRuntime(next: Partial<ReaderRuntime>) {
  runtime = { ...runtime, ...next };
}

export function getReaderRuntime(): ReaderRuntime {
  return runtime;
}
