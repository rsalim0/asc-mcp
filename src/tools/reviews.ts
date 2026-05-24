import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";

export function reviewsTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_reviews_list",
      description: "List customer reviews for an app.",
      inputSchema: z.object({
        appId: z.string(),
        rating: z.number().int().min(1).max(5).optional(),
        territory: z.string().optional().describe("Territory code e.g. USA"),
        sort: z
          .enum([
            "createdDate",
            "-createdDate",
            "rating",
            "-rating",
          ])
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, rating, territory, sort, limit }) =>
        client.request(`/apps/${appId}/customerReviews`, {
          query: {
            "filter[rating]": rating !== undefined ? String(rating) : undefined,
            "filter[territory]": territory,
            sort: sort ?? "-createdDate",
            limit: limit ?? 50,
            "fields[customerReviews]": DEFAULT_FIELDS.customerReviews,
            include: ["response"],
          },
        }),
    },
    {
      name: "asc_reviews_get",
      description: "Get one customer review by id, including the developer response if any.",
      inputSchema: z.object({
        reviewId: z.string(),
      }),
      handler: async ({ reviewId }) =>
        client.request(`/customerReviews/${reviewId}`, {
          query: { include: ["response"] },
        }),
    },
    {
      name: "asc_reviews_get_response",
      description: "Get the developer's response to a customer review.",
      inputSchema: z.object({ reviewId: z.string() }),
      handler: async ({ reviewId }) =>
        client.request(`/customerReviews/${reviewId}/response`),
    },
  ];
}
