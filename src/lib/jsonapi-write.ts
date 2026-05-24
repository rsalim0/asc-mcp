import type { AscClient } from "../client.js";

export interface JsonApiBody {
  data: {
    type: string;
    id?: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<
      string,
      { data: { type: string; id: string } | Array<{ type: string; id: string }> | null }
    >;
  };
}

export function patchBody(
  type: string,
  id: string,
  attributes?: Record<string, unknown>,
  relationships?: JsonApiBody["data"]["relationships"],
): JsonApiBody {
  return { data: { type, id, attributes, relationships } };
}

export function postBody(
  type: string,
  attributes?: Record<string, unknown>,
  relationships?: JsonApiBody["data"]["relationships"],
): JsonApiBody {
  return { data: { type, attributes, relationships } };
}

export function singleRel(type: string, id: string) {
  return { data: { type, id } } as const;
}

export interface DryRunResult {
  dryRun: true;
  method: string;
  path: string;
  body?: unknown;
}

export async function maybeSend<T>(
  client: AscClient,
  dryRun: boolean | undefined,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T | DryRunResult> {
  if (dryRun) return { dryRun: true, method, path, body };
  return client.request<T>(path, {
    method,
    body,
  });
}
