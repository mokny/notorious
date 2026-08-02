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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Lets the request survive page teardown (navigation/tab close) - the browser guarantees a `keepalive: true` fetch is still sent even after the initiating page has gone away, unlike a plain `fetch`. Used by presenceApi's "leave" call on unmount (see hooks/usePresence.ts), so a viewer disappears from others' lists promptly instead of waiting out the server's sweep interval. */
  keepalive?: boolean;
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
