import { generateToken, type AscCredentials } from "./auth.js";

const BASE_URL = "https://api.appstoreconnect.apple.com/v1";

export type QueryValue = string | number | boolean | string[] | undefined;

export interface RequestOptions {
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  expectBinary?: boolean;
}

export interface AscError extends Error {
  status?: number;
  details?: unknown;
}

export class AscClient {
  constructor(private creds: AscCredentials) {}

  get vendorNumber(): string | undefined {
    return this.creds.vendorNumber;
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): URL {
    const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`);
    if (!query) return url;
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        if (v.length === 0) continue;
        url.searchParams.set(k, v.join(","));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
    return url;
  }

  async request<T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const token = generateToken(this.creds);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    };
    if (options.body !== undefined && !options.rawBody) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }

    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.rawBody ?? (options.body ? JSON.stringify(options.body) : undefined),
    });

    if (options.expectBinary) {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw makeError(res.status, res.statusText, text);
      }
      return (await res.arrayBuffer()) as T;
    }

    const text = await res.text();
    if (!res.ok) {
      throw makeError(res.status, res.statusText, text);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}

function makeError(status: number, statusText: string, body: string): AscError {
  let detail = body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "errors" in parsed &&
      Array.isArray((parsed as { errors: unknown[] }).errors)
    ) {
      const errs = (parsed as { errors: Array<{ title?: string; detail?: string; code?: string; source?: { pointer?: string; parameter?: string } }> }).errors;
      detail = errs
        .map((e) => {
          const where = e.source?.pointer ?? e.source?.parameter ?? "";
          return [e.code, e.title, e.detail, where].filter(Boolean).join(" — ");
        })
        .join("; ");
    }
  } catch {
    // not JSON, keep raw
  }
  const err: AscError = new Error(
    `App Store Connect API ${status} ${statusText}: ${detail}`,
  );
  err.status = status;
  err.details = parsed ?? body;
  return err;
}
