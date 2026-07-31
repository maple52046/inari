/**
 * Transport for the Rust JSON API.
 *
 * Every S3 operation runs on the server; this module is the only place the
 * browser talks to it. Credentials are never handled here — they travel once,
 * on connect, and thereafter live in an HttpOnly cookie the browser attaches
 * automatically.
 */

/** Prefix the whole application is mounted under, injected into the document. */
declare global {
  interface Window {
    __INARI_BASE_PATH__?: string;
  }
}

/** Placeholder the server replaces; still present when Vite serves the page. */
const BASE_PATH_PLACEHOLDER = "%INARI_BASE_PATH%";

/**
 * Returns the mount prefix, or an empty string at the root.
 *
 * The dev server serves `index.html` verbatim, so the untouched placeholder has
 * to read as "no prefix" rather than becoming part of every URL.
 */
export function basePath(): string {
  const injected = window.__INARI_BASE_PATH__;
  if (!injected || injected === BASE_PATH_PLACEHOLDER) {
    return "";
  }
  return injected;
}

/** The error shape every failed API response carries. */
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** A failed request, carrying the server's stable code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.fieldErrors = body.fieldErrors;
  }

  /** Whether the session is gone and the user must reconnect. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${basePath()}/api${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/**
 * Issues a request and returns the decoded body.
 *
 * @throws ApiError when the server reports a failure, so callers can branch on
 * a stable code instead of parsing a message.
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query } = options;

  const response = await fetch(buildUrl(path, query), {
    method,
    // The session cookie is same-origin, but being explicit keeps the call
    // working if the SPA is ever served from a different origin than the API.
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const fallback: ApiErrorBody = {
      code: "unknown",
      message: "An unexpected error occurred",
    };
    throw new ApiError(
      response.status,
      (parsed as ApiErrorBody | undefined) ?? fallback,
    );
  }

  return parsed as T;
}

/** Extracts a user-facing message from any thrown value. */
export function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
