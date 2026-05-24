import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";
import { patchBody, postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { APP_STORE_LOCALES } from "../lib/locales.js";

export function buildsTools(client: AscClient): ToolDef[] {
  return [
    // ---- READS ----
    {
      name: "asc_builds_list",
      description: "List builds, optionally filtered by app/version/state.",
      inputSchema: z.object({
        appId: z.string().optional(),
        versionId: z.string().optional(),
        preReleaseVersion: z.string().optional(),
        processingState: z.enum(["PROCESSING", "FAILED", "INVALID", "VALID"]).optional(),
        expired: z.boolean().optional(),
        version: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        sort: z.enum(["uploadedDate", "-uploadedDate", "version", "-version"]).optional(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ appId, versionId, preReleaseVersion, processingState, expired, version, limit, sort, include }) =>
        client.request("/builds", {
          query: {
            "filter[app]": appId,
            "filter[appStoreVersion]": versionId,
            "filter[preReleaseVersion]": preReleaseVersion,
            "filter[processingState]": processingState,
            "filter[expired]": expired !== undefined ? String(expired) : undefined,
            "filter[version]": version,
            limit: limit ?? 50,
            sort: sort ?? "-uploadedDate",
            include,
            "fields[builds]": DEFAULT_FIELDS.builds,
          },
        }),
    },
    {
      name: "asc_builds_get",
      description: "Get one build by id.",
      inputSchema: z.object({
        buildId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ buildId, include }) =>
        client.request(`/builds/${buildId}`, { query: { include } }),
    },
    {
      name: "asc_builds_get_beta_details",
      description: "Get TestFlight beta details for a build.",
      inputSchema: z.object({ buildId: z.string() }),
      handler: async ({ buildId }) => client.request(`/builds/${buildId}/buildBetaDetail`),
    },
    {
      name: "asc_builds_list_beta_localizations",
      description: "List per-locale 'What to Test' notes for a build.",
      inputSchema: z.object({
        buildId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ buildId, limit }) =>
        client.request(`/builds/${buildId}/betaBuildLocalizations`, { query: { limit: limit ?? 50 } }),
    },
    {
      name: "asc_builds_get_beta_localization",
      description: "Get a single beta build localization by id.",
      inputSchema: z.object({ localizationId: z.string() }),
      handler: async ({ localizationId }) =>
        client.request(`/betaBuildLocalizations/${localizationId}`),
    },
    {
      name: "asc_builds_get_pre_release_version",
      description: "Get the pre-release version (TestFlight grouping) for a build.",
      inputSchema: z.object({ buildId: z.string() }),
      handler: async ({ buildId }) => client.request(`/builds/${buildId}/preReleaseVersion`),
    },
    {
      name: "asc_builds_get_beta_review_submission",
      description: "Get the Beta App Review submission record for a build.",
      inputSchema: z.object({ buildId: z.string() }),
      handler: async ({ buildId }) => client.request(`/builds/${buildId}/betaAppReviewSubmission`),
    },

    // ---- WRITES: Phase 2 ----
    {
      name: "asc_builds_update_beta_details",
      description: "Update build beta details (autoNotifyEnabled for external testers).",
      inputSchema: z.object({
        buildBetaDetailId: z.string().describe("ID of the buildBetaDetail resource (not the build id)"),
        autoNotifyEnabled: z.boolean(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ buildBetaDetailId, autoNotifyEnabled, dryRun }) => {
        const body = patchBody("buildBetaDetails", buildBetaDetailId, { autoNotifyEnabled });
        return maybeSend(client, dryRun, "PATCH", `/buildBetaDetails/${buildBetaDetailId}`, body);
      },
    },
    {
      name: "asc_builds_update_beta_localization",
      description: "Update 'What to Test' text for a build in one locale.",
      inputSchema: z.object({
        localizationId: z.string(),
        whatsNew: z.string().max(4000),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, whatsNew, dryRun }) => {
        const body = patchBody("betaBuildLocalizations", localizationId, { whatsNew });
        return maybeSend(client, dryRun, "PATCH", `/betaBuildLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_builds_create_beta_localization",
      description: "Add a new 'What to Test' localization to a build.",
      inputSchema: z.object({
        buildId: z.string(),
        locale: z.enum(APP_STORE_LOCALES),
        whatsNew: z.string().max(4000),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ buildId, locale, whatsNew, dryRun }) => {
        const body = postBody(
          "betaBuildLocalizations",
          { locale, whatsNew },
          { build: singleRel("builds", buildId) },
        );
        return maybeSend(client, dryRun, "POST", `/betaBuildLocalizations`, body);
      },
    },
    {
      name: "asc_builds_delete_beta_localization",
      description: "Delete a beta build localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/betaBuildLocalizations/${localizationId}`),
    },
    {
      name: "asc_builds_update_expiration",
      description: "Mark a build expired or unexpired.",
      inputSchema: z.object({
        buildId: z.string(),
        expired: z.boolean(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ buildId, expired, dryRun }) => {
        const body = patchBody("builds", buildId, { expired });
        return maybeSend(client, dryRun, "PATCH", `/builds/${buildId}`, body);
      },
    },

    // ---- WRITES: Phase 3 (export compliance + ITC bypass) ----
    {
      name: "asc_builds_update_export_compliance",
      description:
        "Set the build's usesNonExemptEncryption flag (Export Compliance). Required before submitting if not declared in Info.plist.",
      inputSchema: z.object({
        buildId: z.string(),
        usesNonExemptEncryption: z.boolean(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ buildId, usesNonExemptEncryption, dryRun }) => {
        const body = patchBody("builds", buildId, { usesNonExemptEncryption });
        return maybeSend(client, dryRun, "PATCH", `/builds/${buildId}`, body);
      },
    },
  ];
}
