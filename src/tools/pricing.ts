import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";

export function pricingTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_pricing_get_schedule",
      description: "Get the App Price Schedule for an app (manual prices + base territory + auto-renew).",
      inputSchema: z.object({
        appId: z.string(),
        include: z
          .array(z.string())
          .optional()
          .describe("e.g. baseTerritory, manualPrices, automaticPrices"),
      }),
      handler: async ({ appId, include }) =>
        client.request(`/apps/${appId}/appPriceSchedule`, { query: { include } }),
    },
    {
      name: "asc_pricing_list_territories",
      description: "List all App Store territories (code + currency).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ limit }) =>
        client.request("/territories", { query: { limit: limit ?? 200 } }),
    },
    {
      name: "asc_pricing_get_availability",
      description: "Get App Availability v2 (territories the app is available in + pre-order state).",
      inputSchema: z.object({
        appId: z.string(),
        include: z.array(z.string()).optional().describe("e.g. territoryAvailabilities"),
      }),
      handler: async ({ appId, include }) =>
        client.request(`/apps/${appId}/appAvailabilityV2`, { query: { include } }),
    },

    // ---- WRITES: Phase 7 (pricing + availability) ----
    {
      name: "asc_pricing_create_schedule",
      description:
        "Create a new App Price Schedule (replaces existing). Pass manualPrices as [{ pricePointId, territoryId, startDate? }]. baseTerritory drives automatic prices.",
      inputSchema: z.object({
        appId: z.string(),
        baseTerritoryId: z.string().optional().describe("Territory code that automatic prices derive from"),
        manualPrices: z
          .array(
            z.object({
              pricePointId: z.string(),
              territoryId: z.string(),
              startDate: z.string().optional(),
              endDate: z.string().optional(),
            }),
          )
          .default([]),
        availableInNewTerritories: z.boolean().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, baseTerritoryId, manualPrices, availableInNewTerritories, dryRun }) => {
        // Included resources: manual price entries
        const included = manualPrices.map((p: { pricePointId: string; territoryId: string; startDate?: string; endDate?: string }, i: number) => ({
          type: "appPrices",
          id: `${i}`,
          attributes: {
            startDate: p.startDate,
            endDate: p.endDate,
          },
          relationships: {
            appPricePoint: { data: { type: "appPricePoints", id: p.pricePointId } },
            territory: { data: { type: "territories", id: p.territoryId } },
          },
        }));
        const relationships: Record<string, unknown> = {
          app: singleRel("apps", appId),
          manualPrices: { data: included.map((i: { id: string }) => ({ type: "appPrices", id: i.id })) },
        };
        if (baseTerritoryId) {
          relationships.baseTerritory = singleRel("territories", baseTerritoryId);
        }
        const attrs: Record<string, unknown> = {};
        if (availableInNewTerritories !== undefined) attrs.availableInNewTerritories = availableInNewTerritories;
        const body = {
          data: {
            type: "appPriceSchedules",
            attributes: Object.keys(attrs).length ? attrs : undefined,
            relationships,
          },
          included,
        };
        return maybeSend(client, dryRun, "POST", `/appPriceSchedules`, body);
      },
    },
    {
      name: "asc_pricing_set_availability",
      description:
        "Replace the app's territory availability (v2). Pass the full list of territory ids the app should be available in.",
      inputSchema: z.object({
        appId: z.string(),
        territoryIds: z.array(z.string()).describe("Territory codes, e.g. ['USA','GBR','JPN']"),
        availableInNewTerritories: z.boolean().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, territoryIds, availableInNewTerritories, dryRun }) => {
        const included = territoryIds.map((tid: string, i: number) => ({
          type: "territoryAvailabilities",
          id: `${i}`,
          attributes: { available: true },
          relationships: { territory: { data: { type: "territories", id: tid } } },
        }));
        const attrs: Record<string, unknown> = {};
        if (availableInNewTerritories !== undefined) attrs.availableInNewTerritories = availableInNewTerritories;
        const body = {
          data: {
            type: "appAvailabilitiesV2",
            attributes: Object.keys(attrs).length ? attrs : undefined,
            relationships: {
              app: singleRel("apps", appId),
              territoryAvailabilities: {
                data: included.map((i: { id: string }) => ({ type: "territoryAvailabilities", id: i.id })),
              },
            },
          },
          included,
        };
        return maybeSend(client, dryRun, "POST", `/appAvailabilitiesV2`, body);
      },
    },
    {
      name: "asc_pricing_create_preorder",
      description: "Enable pre-order for an app with a release date.",
      inputSchema: z.object({
        appId: z.string(),
        appReleaseDate: z.string().describe("YYYY-MM-DD when the app goes live"),
        preOrderAvailableDate: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, appReleaseDate, preOrderAvailableDate, dryRun }) => {
        const attrs: Record<string, unknown> = { appReleaseDate };
        if (preOrderAvailableDate !== undefined) attrs.preOrderAvailableDate = preOrderAvailableDate;
        const body = postBody("appPreOrders", attrs, { app: singleRel("apps", appId) });
        return maybeSend(client, dryRun, "POST", `/appPreOrders`, body);
      },
    },
    {
      name: "asc_pricing_delete_preorder",
      description: "Cancel pre-order for an app.",
      inputSchema: z.object({
        preOrderId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ preOrderId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appPreOrders/${preOrderId}`),
    },
  ];
}
