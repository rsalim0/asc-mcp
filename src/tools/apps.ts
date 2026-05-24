import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";
import { patchBody, postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { METADATA_CHAR_LIMITS, APP_STORE_LOCALES } from "../lib/locales.js";

const APP_INFO_LOC_FIELDS = ["name", "subtitle", "privacyPolicyUrl", "privacyPolicyText"] as const;

function enforceCharLimit(field: string, value: unknown): void {
  if (typeof value !== "string") return;
  const limit = (METADATA_CHAR_LIMITS as Record<string, number | undefined>)[field];
  if (limit && value.length > limit) {
    throw new Error(`Field "${field}" is ${value.length} chars but App Store limit is ${limit}.`);
  }
}

export function appsTools(client: AscClient): ToolDef[] {
  return [
    // ---- READS ----
    {
      name: "asc_apps_list",
      description: "List apps. Returns id, name, bundleId, sku, primaryLocale.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional(),
        bundleId: z.string().optional(),
        name: z.string().optional(),
        sku: z.string().optional(),
      }),
      handler: async ({ limit, bundleId, name, sku }) =>
        client.request("/apps", {
          query: {
            limit: limit ?? 100,
            "filter[bundleId]": bundleId,
            "filter[name]": name,
            "filter[sku]": sku,
            "fields[apps]": DEFAULT_FIELDS.apps,
          },
        }),
    },
    {
      name: "asc_apps_get",
      description: "Get a single app by id.",
      inputSchema: z.object({
        appId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ appId, include }) =>
        client.request(`/apps/${appId}`, { query: { include } }),
    },
    {
      name: "asc_apps_list_app_infos",
      description: "List App Infos for an app (per version-state name/subtitle/categories).",
      inputSchema: z.object({
        appId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ appId, include }) =>
        client.request(`/apps/${appId}/appInfos`, { query: { include } }),
    },
    {
      name: "asc_apps_list_app_info_localizations",
      description: "List App Info localizations (name/subtitle/privacy policy per locale).",
      inputSchema: z.object({
        appInfoId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appInfoId, limit }) =>
        client.request(`/appInfos/${appInfoId}/appInfoLocalizations`, {
          query: { limit: limit ?? 50 },
        }),
    },
    {
      name: "asc_apps_get_app_info_localization",
      description: "Get one App Info Localization by id.",
      inputSchema: z.object({ localizationId: z.string() }),
      handler: async ({ localizationId }) =>
        client.request(`/appInfoLocalizations/${localizationId}`),
    },
    {
      name: "asc_apps_list_categories",
      description: "List App Categories (Apple-defined taxonomy).",
      inputSchema: z.object({
        platform: z.enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"]).optional(),
      }),
      handler: async ({ platform }) =>
        client.request("/appCategories", { query: { "filter[platforms]": platform } }),
    },
    {
      name: "asc_apps_get_age_rating_declaration",
      description: "Get the Age Rating Declaration for an App Info (questionnaire answers).",
      inputSchema: z.object({ appInfoId: z.string() }),
      handler: async ({ appInfoId }) =>
        client.request(`/appInfos/${appInfoId}/ageRatingDeclaration`),
    },

    // ---- WRITES: Phase 2 ----
    {
      name: "asc_apps_update_app_info_localization",
      description:
        "Update a single field on an App Info Localization (name 30, subtitle 30, privacyPolicyUrl, privacyPolicyText).",
      inputSchema: z.object({
        localizationId: z.string(),
        field: z.enum(APP_INFO_LOC_FIELDS),
        value: z.string().nullable(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, field, value, dryRun }) => {
        if (value !== null) enforceCharLimit(field, value);
        const body = patchBody("appInfoLocalizations", localizationId, { [field]: value });
        return maybeSend(client, dryRun, "PATCH", `/appInfoLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_apps_update_app_info_localization_bulk",
      description: "Update multiple fields on an App Info Localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        attributes: z
          .object({
            name: z.string().nullable().optional(),
            subtitle: z.string().nullable().optional(),
            privacyPolicyUrl: z.string().nullable().optional(),
            privacyPolicyText: z.string().nullable().optional(),
          })
          .refine((a) => Object.keys(a).length > 0, "Provide at least one field"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, attributes, dryRun }) => {
        for (const [k, v] of Object.entries(attributes)) {
          if (v !== null && v !== undefined) enforceCharLimit(k, v);
        }
        const body = patchBody("appInfoLocalizations", localizationId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/appInfoLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_apps_create_app_info_localization",
      description: "Add a new locale to an App Info with initial name/subtitle/privacy URL.",
      inputSchema: z.object({
        appInfoId: z.string(),
        locale: z.enum(APP_STORE_LOCALES),
        attributes: z.object({
          name: z.string().nullable().optional(),
          subtitle: z.string().nullable().optional(),
          privacyPolicyUrl: z.string().nullable().optional(),
          privacyPolicyText: z.string().nullable().optional(),
        }),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appInfoId, locale, attributes, dryRun }) => {
        for (const [k, v] of Object.entries(attributes)) {
          if (v !== null && v !== undefined) enforceCharLimit(k, v);
        }
        const body = postBody(
          "appInfoLocalizations",
          { locale, ...attributes },
          { appInfo: singleRel("appInfos", appInfoId) },
        );
        return maybeSend(client, dryRun, "POST", `/appInfoLocalizations`, body);
      },
    },
    {
      name: "asc_apps_delete_app_info_localization",
      description: "Delete a locale from an App Info.",
      inputSchema: z.object({
        localizationId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appInfoLocalizations/${localizationId}`),
    },
  ];
}
