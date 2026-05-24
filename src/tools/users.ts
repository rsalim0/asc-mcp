import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";

export function usersTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_users_list",
      description: "List team members.",
      inputSchema: z.object({
        roles: z
          .array(z.string())
          .optional()
          .describe("e.g. ADMIN, DEVELOPER, APP_MANAGER, MARKETING, SALES, FINANCE, ACCOUNT_HOLDER, ACCESS_TO_REPORTS, CUSTOMER_SUPPORT"),
        username: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        include: z.array(z.string()).optional().describe("e.g. visibleApps"),
      }),
      handler: async ({ roles, username, limit, include }) =>
        client.request("/users", {
          query: {
            "filter[roles]": roles,
            "filter[username]": username,
            limit: limit ?? 100,
            include,
            "fields[users]": DEFAULT_FIELDS.users,
          },
        }),
    },
    {
      name: "asc_users_get",
      description: "Get one team member by id.",
      inputSchema: z.object({
        userId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ userId, include }) =>
        client.request(`/users/${userId}`, { query: { include } }),
    },
    {
      name: "asc_users_list_visible_apps",
      description: "List apps visible to a user.",
      inputSchema: z.object({
        userId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ userId, limit }) =>
        client.request(`/users/${userId}/visibleApps`, {
          query: { limit: limit ?? 200 },
        }),
    },
    {
      name: "asc_user_invitations_list",
      description: "List pending user invitations.",
      inputSchema: z.object({
        roles: z.array(z.string()).optional(),
        email: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ roles, email, limit }) =>
        client.request("/userInvitations", {
          query: {
            "filter[roles]": roles,
            "filter[email]": email,
            limit: limit ?? 100,
          },
        }),
    },
  ];
}
