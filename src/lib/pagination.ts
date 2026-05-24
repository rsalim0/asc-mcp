import type { AscClient, QueryValue } from "../client.js";

interface Page<T> {
  data: T[];
  links?: { next?: string };
}

export interface PaginateOptions {
  query?: Record<string, QueryValue>;
  /** Max number of items to accumulate. Hard safety cap to protect MCP context. */
  cap?: number;
}

/**
 * Walk cursor-paginated ASC list endpoints up to `cap` items.
 * ASC encodes the next URL fully in `links.next`, so we just follow it.
 */
export async function paginate<T = unknown>(
  client: AscClient,
  path: string,
  options: PaginateOptions = {},
): Promise<T[]> {
  const cap = options.cap ?? 500;
  const acc: T[] = [];
  let nextUrl: string | null = null;
  let firstQuery = options.query;

  while (acc.length < cap) {
    const page: Page<T> = nextUrl
      ? await client.request<Page<T>>(nextUrl)
      : await client.request<Page<T>>(path, { query: firstQuery });
    firstQuery = undefined;
    if (Array.isArray(page.data)) acc.push(...page.data);
    nextUrl = page.links?.next ?? null;
    if (!nextUrl) break;
  }

  return acc.slice(0, cap);
}
