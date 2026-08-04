import { clientId } from "../ws/clientId.js";
import { getShareToken } from "./shareMode.js";

function shareHeaders(): Record<string, string> {
  const token = getShareToken();
  return token ? { "X-Share-Token": token } : {};
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Lets the request survive page teardown (navigation/tab close) - the browser guarantees a `keepalive: true` fetch is still sent even after the initiating page has gone away, unlike a plain `fetch`. Used by presenceApi's "leave" call on unmount (see hooks/usePresence.ts), so a viewer disappears from others' lists promptly instead of waiting out the server's sweep interval. */
  keepalive?: boolean;
  /** Lets the caller cancel an in-flight request (e.g. the Cancel button on a ProgressPopup, see backupApi's destination-file download/restore). */
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

/** Thin JSON fetch wrapper: cookies for auth, typed errors, no retries/magic. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body
      ? { "Content-Type": "application/json", "X-Client-Id": clientId, ...shareHeaders() }
      : { "X-Client-Id": clientId, ...shareHeaders() },
    body: options.body ? JSON.stringify(options.body) : undefined,
    keepalive: options.keepalive,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data ? String(data.message) : "Request failed";
    throw new ApiError(response.status, message);
  }

  return data as T;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "X-Client-Id": clientId, ...shareHeaders() },
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.message ?? "Upload failed");
  return data as T;
}

/**
 * Downloads a binary response as a `Blob`, reporting byte progress along the
 * way - used by ProgressPopup-driven downloads (local export, a remote
 * destination's backup file). Reads the body as a stream instead of calling
 * `response.blob()` directly so `onProgress` can fire per chunk; `percent`
 * is omitted when the server didn't send `Content-Length` (nothing in this
 * codebase omits it today, but the caller should still treat it as
 * optional).
 */
export async function apiDownload(
  path: string,
  options: { query?: RequestOptions["query"]; onProgress?: (info: { bytes: number; percent?: number }) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  const response = await fetch(buildUrl(path, options.query), {
    credentials: "include",
    headers: { "X-Client-Id": clientId, ...shareHeaders() },
    signal: options.signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data && typeof data === "object" && "message" in data ? String(data.message) : "Download failed";
    throw new ApiError(response.status, message);
  }

  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : undefined;
  const reader = response.body?.getReader();
  if (!reader) return response.blob();

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytes += value.length;
    options.onProgress?.({ bytes, percent: total ? Math.min(100, (bytes / total) * 100) : undefined });
  }
  return new Blob(chunks as BlobPart[]);
}

/**
 * Uploads a `FormData` body with byte-level upload progress - `fetch` has
 * no cross-browser way to observe upload progress, so this uses
 * `XMLHttpRequest` instead, the same technique every other progress-capable
 * uploader on the web uses. Returns an `abort()` alongside the promise so a
 * ProgressPopup's Cancel button can stop the transfer.
 */
export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (info: { bytes: number; percent?: number }) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Client-Id", clientId);
    const shareToken = getShareToken();
    if (shareToken) xhr.setRequestHeader("X-Share-Token", shareToken);

    xhr.upload.onprogress = (event) => {
      onProgress?.({ bytes: event.loaded, percent: event.lengthComputable ? Math.min(100, (event.loaded / event.total) * 100) : undefined });
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Empty/non-JSON body - handled below via status check.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        const message = data && typeof data === "object" && "message" in data ? String((data as { message: unknown }).message) : "Upload failed";
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(formData);
  });

  return { promise, abort: () => xhr.abort() };
}
