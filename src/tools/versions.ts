import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";
import { patchBody, postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { METADATA_CHAR_LIMITS, APP_STORE_LOCALES } from "../lib/locales.js";

const VERSION_LOCALIZATION_FIELDS = [
  "description",
  "keywords",
  "marketingUrl",
  "promotionalText",
  "supportUrl",
  "whatsNew",
] as const;

const PLATFORMS = ["IOS", "MAC_OS", "TV_OS", "VISION_OS"] as const;
const RELEASE_TYPES = ["MANUAL", "AFTER_APPROVAL", "SCHEDULED"] as const;
const PHASED_RELEASE_STATES = ["INACTIVE", "ACTIVE", "PAUSED", "COMPLETE"] as const;

function enforceCharLimit(field: string, value: unknown): void {
  if (typeof value !== "string") return;
  const limit = (METADATA_CHAR_LIMITS as Record<string, number | undefined>)[field];
  if (limit && value.length > limit) {
    throw new Error(`Field "${field}" is ${value.length} chars but App Store limit is ${limit}.`);
  }
}

export function versionsTools(client: AscClient): ToolDef[] {
  return [
    // ---- READS (Phase 1) ----
    {
      name: "asc_versions_list",
      description: "List App Store Versions for an app.",
      inputSchema: z.object({
        appId: z.string(),
        platform: z.enum(PLATFORMS).optional(),
        versionString: z.string().optional(),
        appStoreState: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, platform, versionString, appStoreState, limit }) =>
        client.request(`/apps/${appId}/appStoreVersions`, {
          query: {
            limit: limit ?? 50,
            "filter[platform]": platform,
            "filter[versionString]": versionString,
            "filter[appStoreState]": appStoreState,
            "fields[appStoreVersions]": DEFAULT_FIELDS.appStoreVersions,
          },
        }),
    },
    {
      name: "asc_versions_get",
      description: "Get one App Store Version by id.",
      inputSchema: z.object({
        versionId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ versionId, include }) =>
        client.request(`/appStoreVersions/${versionId}`, { query: { include } }),
    },
    {
      name: "asc_versions_list_localizations",
      description: "List per-locale metadata for a version.",
      inputSchema: z.object({
        versionId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ versionId, limit }) =>
        client.request(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`, {
          query: {
            limit: limit ?? 50,
            "fields[appStoreVersionLocalizations]": DEFAULT_FIELDS.appStoreVersionLocalizations,
          },
        }),
    },
    {
      name: "asc_versions_get_localization",
      description: "Get one App Store Version Localization by id.",
      inputSchema: z.object({ localizationId: z.string() }),
      handler: async ({ localizationId }) =>
        client.request(`/appStoreVersionLocalizations/${localizationId}`),
    },
    {
      name: "asc_versions_get_submission",
      description: "Get the current v1 submission record for a version.",
      inputSchema: z.object({ versionId: z.string() }),
      handler: async ({ versionId }) =>
        client.request(`/appStoreVersions/${versionId}/appStoreVersionSubmission`),
    },
    {
      name: "asc_versions_get_phased_release",
      description: "Get phased release state for a version.",
      inputSchema: z.object({ versionId: z.string() }),
      handler: async ({ versionId }) =>
        client.request(`/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`),
    },
    {
      name: "asc_versions_get_review_details",
      description: "Get App Store review details (contact, demo, notes) for a version.",
      inputSchema: z.object({ versionId: z.string() }),
      handler: async ({ versionId }) =>
        client.request(`/appStoreVersions/${versionId}/appStoreReviewDetail`),
    },
    {
      name: "asc_versions_get_build",
      description: "Get the build currently attached to a version.",
      inputSchema: z.object({ versionId: z.string() }),
      handler: async ({ versionId }) =>
        client.request(`/appStoreVersions/${versionId}/build`),
    },
    {
      name: "asc_versions_list_v2_submissions",
      description: "List v2 Review Submissions across an app.",
      inputSchema: z.object({
        appId: z.string(),
        state: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, state, limit }) =>
        client.request("/reviewSubmissions", {
          query: {
            "filter[app]": appId,
            "filter[state]": state,
            limit: limit ?? 50,
          },
        }),
    },

    // ---- WRITES: Phase 2 (metadata) ----
    {
      name: "asc_versions_update_localization",
      description: "Update one field on a Version Localization. Char limits enforced.",
      inputSchema: z.object({
        localizationId: z.string(),
        field: z.enum(VERSION_LOCALIZATION_FIELDS),
        value: z.string().nullable(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, field, value, dryRun }) => {
        if (value !== null) enforceCharLimit(field, value);
        const body = patchBody("appStoreVersionLocalizations", localizationId, { [field]: value });
        return maybeSend(client, dryRun, "PATCH", `/appStoreVersionLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_versions_update_localization_bulk",
      description: "Update multiple fields on a Version Localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        attributes: z
          .object({
            description: z.string().nullable().optional(),
            keywords: z.string().nullable().optional(),
            marketingUrl: z.string().nullable().optional(),
            promotionalText: z.string().nullable().optional(),
            supportUrl: z.string().nullable().optional(),
            whatsNew: z.string().nullable().optional(),
          })
          .refine((a) => Object.keys(a).length > 0, "Provide at least one field"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, attributes, dryRun }) => {
        for (const [k, v] of Object.entries(attributes)) {
          if (v !== null && v !== undefined) enforceCharLimit(k, v);
        }
        const body = patchBody("appStoreVersionLocalizations", localizationId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/appStoreVersionLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_versions_create_localization",
      description: "Add a new locale to a version with initial metadata.",
      inputSchema: z.object({
        versionId: z.string(),
        locale: z.enum(APP_STORE_LOCALES),
        attributes: z.object({
          description: z.string().nullable().optional(),
          keywords: z.string().nullable().optional(),
          marketingUrl: z.string().nullable().optional(),
          promotionalText: z.string().nullable().optional(),
          supportUrl: z.string().nullable().optional(),
          whatsNew: z.string().nullable().optional(),
        }),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, locale, attributes, dryRun }) => {
        for (const [k, v] of Object.entries(attributes)) {
          if (v !== null && v !== undefined) enforceCharLimit(k, v);
        }
        const body = postBody(
          "appStoreVersionLocalizations",
          { locale, ...attributes },
          { appStoreVersion: singleRel("appStoreVersions", versionId) },
        );
        return maybeSend(client, dryRun, "POST", `/appStoreVersionLocalizations`, body);
      },
    },
    {
      name: "asc_versions_delete_localization",
      description: "Delete a locale from a version (cannot delete primary).",
      inputSchema: z.object({
        localizationId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appStoreVersionLocalizations/${localizationId}`),
    },

    // ---- WRITES: Phase 3 (lifecycle) ----
    {
      name: "asc_versions_create",
      description: "Create a new App Store Version for an app.",
      inputSchema: z.object({
        appId: z.string(),
        platform: z.enum(PLATFORMS),
        versionString: z.string().describe("e.g. '1.2.3'"),
        copyright: z.string().optional(),
        releaseType: z.enum(RELEASE_TYPES).optional(),
        earliestReleaseDate: z.string().optional().describe("ISO 8601 for SCHEDULED releases"),
        buildId: z.string().optional().describe("Attach this build at creation"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, platform, versionString, copyright, releaseType, earliestReleaseDate, buildId, dryRun }) => {
        const attributes: Record<string, unknown> = { platform, versionString };
        if (copyright !== undefined) attributes.copyright = copyright;
        if (releaseType !== undefined) attributes.releaseType = releaseType;
        if (earliestReleaseDate !== undefined) attributes.earliestReleaseDate = earliestReleaseDate;
        const relationships: Record<string, { data: { type: string; id: string } | null }> = {
          app: { data: { type: "apps", id: appId } },
        };
        if (buildId) relationships.build = { data: { type: "builds", id: buildId } };
        const body = postBody("appStoreVersions", attributes, relationships);
        return maybeSend(client, dryRun, "POST", `/appStoreVersions`, body);
      },
    },
    {
      name: "asc_versions_delete",
      description: "Delete an App Store Version (only allowed while editable).",
      inputSchema: z.object({
        versionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appStoreVersions/${versionId}`),
    },
    {
      name: "asc_versions_update",
      description: "Update version attributes (copyright, releaseType, earliestReleaseDate, versionString, downloadable).",
      inputSchema: z.object({
        versionId: z.string(),
        attributes: z
          .object({
            copyright: z.string().nullable().optional(),
            releaseType: z.enum(RELEASE_TYPES).optional(),
            earliestReleaseDate: z.string().nullable().optional(),
            versionString: z.string().optional(),
            downloadable: z.boolean().optional(),
            usesIdfa: z.boolean().optional(),
          })
          .refine((a) => Object.keys(a).length > 0, "Provide at least one field"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, attributes, dryRun }) => {
        const body = patchBody("appStoreVersions", versionId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/appStoreVersions/${versionId}`, body);
      },
    },
    {
      name: "asc_versions_attach_build",
      description: "Attach a build to a version (replaces any existing build).",
      inputSchema: z.object({
        versionId: z.string(),
        buildId: z.string().nullable().describe("null to detach"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, buildId, dryRun }) => {
        const body = { data: buildId ? { type: "builds", id: buildId } : null };
        return maybeSend(client, dryRun, "PATCH", `/appStoreVersions/${versionId}/relationships/build`, body);
      },
    },
    {
      name: "asc_versions_submit_for_review_v1",
      description: "Submit a version for App Review (v1 API; one version at a time, no IAP bundle).",
      inputSchema: z.object({
        versionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, dryRun }) => {
        const body = postBody(
          "appStoreVersionSubmissions",
          undefined,
          { appStoreVersion: singleRel("appStoreVersions", versionId) },
        );
        return maybeSend(client, dryRun, "POST", `/appStoreVersionSubmissions`, body);
      },
    },
    {
      name: "asc_versions_cancel_submission_v1",
      description: "Cancel a v1 version submission.",
      inputSchema: z.object({
        submissionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ submissionId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appStoreVersionSubmissions/${submissionId}`),
    },

    // Phased release lifecycle
    {
      name: "asc_versions_create_phased_release",
      description: "Enable phased release for a version (starts at INACTIVE; set ACTIVE to begin).",
      inputSchema: z.object({
        versionId: z.string(),
        phasedReleaseState: z.enum(PHASED_RELEASE_STATES).default("INACTIVE"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, phasedReleaseState, dryRun }) => {
        const body = postBody(
          "appStoreVersionPhasedReleases",
          { phasedReleaseState },
          { appStoreVersion: singleRel("appStoreVersions", versionId) },
        );
        return maybeSend(client, dryRun, "POST", `/appStoreVersionPhasedReleases`, body);
      },
    },
    {
      name: "asc_versions_update_phased_release",
      description: "Change phased release state (ACTIVE / PAUSED / COMPLETE).",
      inputSchema: z.object({
        phasedReleaseId: z.string(),
        phasedReleaseState: z.enum(PHASED_RELEASE_STATES),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ phasedReleaseId, phasedReleaseState, dryRun }) => {
        const body = patchBody("appStoreVersionPhasedReleases", phasedReleaseId, { phasedReleaseState });
        return maybeSend(client, dryRun, "PATCH", `/appStoreVersionPhasedReleases/${phasedReleaseId}`, body);
      },
    },
    {
      name: "asc_versions_delete_phased_release",
      description: "End / disable phased release.",
      inputSchema: z.object({
        phasedReleaseId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ phasedReleaseId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appStoreVersionPhasedReleases/${phasedReleaseId}`),
    },

    // Review details
    {
      name: "asc_versions_create_review_details",
      description: "Create App Store Review Detail (contact, demo, notes) for a version.",
      inputSchema: z.object({
        versionId: z.string(),
        attributes: z.object({
          contactFirstName: z.string().optional(),
          contactLastName: z.string().optional(),
          contactPhone: z.string().optional(),
          contactEmail: z.string().optional(),
          demoAccountName: z.string().optional(),
          demoAccountPassword: z.string().optional(),
          demoAccountRequired: z.boolean().optional(),
          notes: z.string().optional(),
        }),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, attributes, dryRun }) => {
        const body = postBody(
          "appStoreReviewDetails",
          attributes,
          { appStoreVersion: singleRel("appStoreVersions", versionId) },
        );
        return maybeSend(client, dryRun, "POST", `/appStoreReviewDetails`, body);
      },
    },
    {
      name: "asc_versions_update_review_details",
      description: "Update App Store Review Detail attributes.",
      inputSchema: z.object({
        reviewDetailId: z.string(),
        attributes: z.object({
          contactFirstName: z.string().optional(),
          contactLastName: z.string().optional(),
          contactPhone: z.string().optional(),
          contactEmail: z.string().optional(),
          demoAccountName: z.string().nullable().optional(),
          demoAccountPassword: z.string().nullable().optional(),
          demoAccountRequired: z.boolean().optional(),
          notes: z.string().nullable().optional(),
        }),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ reviewDetailId, attributes, dryRun }) => {
        const body = patchBody("appStoreReviewDetails", reviewDetailId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/appStoreReviewDetails/${reviewDetailId}`, body);
      },
    },

    // Age rating (scoped to App Info, not App Store Version, in current ASC API)
    {
      name: "asc_versions_update_age_rating_declaration",
      description: "Update an Age Rating Declaration (questionnaire answers).",
      inputSchema: z.object({
        declarationId: z.string(),
        attributes: z.record(z.string(), z.unknown()),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ declarationId, attributes, dryRun }) => {
        const body = patchBody("ageRatingDeclarations", declarationId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/ageRatingDeclarations/${declarationId}`, body);
      },
    },

    // v2 Review submissions (preferred — supports IAP/version bundles)
    {
      name: "asc_review_submissions_create",
      description: "Create a v2 Review Submission for an app (then add items, then submit).",
      inputSchema: z.object({
        appId: z.string(),
        platform: z.enum(PLATFORMS),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, platform, dryRun }) => {
        const body = postBody(
          "reviewSubmissions",
          { platform },
          { app: singleRel("apps", appId) },
        );
        return maybeSend(client, dryRun, "POST", `/reviewSubmissions`, body);
      },
    },
    {
      name: "asc_review_submissions_add_item",
      description: "Add an item (App Store Version, IAP, or subscription) to a Review Submission.",
      inputSchema: z.object({
        submissionId: z.string(),
        itemType: z.enum(["appStoreVersions", "inAppPurchases", "subscriptions"]),
        itemId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ submissionId, itemType, itemId, dryRun }) => {
        const relName = itemType === "appStoreVersions" ? "appStoreVersion" : itemType === "inAppPurchases" ? "appCustomProductPageVersion" : "subscription";
        // ASC uses the item-specific rel name; fallback to a generic one if needed.
        const body = postBody(
          "reviewSubmissionItems",
          undefined,
          {
            reviewSubmission: singleRel("reviewSubmissions", submissionId),
            [relName]: singleRel(itemType, itemId),
          },
        );
        return maybeSend(client, dryRun, "POST", `/reviewSubmissionItems`, body);
      },
    },
    {
      name: "asc_review_submissions_submit",
      description: "Submit a Review Submission for review (sets state to SUBMITTED).",
      inputSchema: z.object({
        submissionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ submissionId, dryRun }) => {
        const body = patchBody("reviewSubmissions", submissionId, { submitted: true });
        return maybeSend(client, dryRun, "PATCH", `/reviewSubmissions/${submissionId}`, body);
      },
    },
    {
      name: "asc_review_submissions_cancel",
      description: "Cancel a Review Submission.",
      inputSchema: z.object({
        submissionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ submissionId, dryRun }) => {
        const body = patchBody("reviewSubmissions", submissionId, { canceled: true });
        return maybeSend(client, dryRun, "PATCH", `/reviewSubmissions/${submissionId}`, body);
      },
    },
  ];
}
