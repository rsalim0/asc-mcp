export interface JsonApiResource {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { type: string; id: string } | Array<{ type: string; id: string }> }
  >;
}

export interface JsonApiResponse<T = JsonApiResource> {
  data: T | T[];
  included?: JsonApiResource[];
  links?: { next?: string; self?: string };
  meta?: Record<string, unknown>;
}

/** Flatten a single JSON:API resource into `{ id, type, ...attributes, _rel: {...} }`. */
export function flatten(resource: JsonApiResource): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: resource.id,
    type: resource.type,
    ...(resource.attributes ?? {}),
  };
  if (resource.relationships) {
    const rels: Record<string, unknown> = {};
    for (const [name, rel] of Object.entries(resource.relationships)) {
      if (!rel.data) continue;
      rels[name] = Array.isArray(rel.data)
        ? rel.data.map((d) => d.id)
        : rel.data.id;
    }
    if (Object.keys(rels).length > 0) out._rel = rels;
  }
  return out;
}

/** Flatten a list response. */
export function flattenList(
  resp: JsonApiResponse<JsonApiResource>,
): Record<string, unknown>[] {
  const data = Array.isArray(resp.data) ? resp.data : [resp.data];
  return data.map(flatten);
}
