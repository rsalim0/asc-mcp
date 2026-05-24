import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";
import { patchBody, postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { APP_STORE_LOCALES } from "../lib/locales.js";

const BETA_APP_LOC_FIELDS = ["description", "feedbackEmail", "marketingUrl", "tvOsPrivacyPolicy", "privacyPolicyUrl"] as const;

export function testflightTools(client: AscClient): ToolDef[] {
  return [
    // ---- READS ----
    {
      name: "asc_testflight_list_groups",
      description: "List Beta Groups, optionally scoped to one app.",
      inputSchema: z.object({
        appId: z.string().optional(),
        isInternal: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, isInternal, limit }) =>
        client.request("/betaGroups", {
          query: {
            "filter[app]": appId,
            "filter[isInternalGroup]": isInternal !== undefined ? String(isInternal) : undefined,
            limit: limit ?? 50,
            "fields[betaGroups]": DEFAULT_FIELDS.betaGroups,
          },
        }),
    },
    {
      name: "asc_testflight_get_group",
      description: "Get one Beta Group by id.",
      inputSchema: z.object({
        groupId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ groupId, include }) =>
        client.request(`/betaGroups/${groupId}`, { query: { include } }),
    },
    {
      name: "asc_testflight_list_testers",
      description: "List Beta Testers, optionally scoped to a group, app, or filtered by email.",
      inputSchema: z.object({
        groupId: z.string().optional(),
        appId: z.string().optional(),
        email: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ groupId, appId, email, limit }) => {
        const path = groupId ? `/betaGroups/${groupId}/betaTesters` : "/betaTesters";
        return client.request(path, {
          query: {
            "filter[apps]": appId,
            "filter[email]": email,
            limit: limit ?? 100,
            "fields[betaTesters]": DEFAULT_FIELDS.betaTesters,
          },
        });
      },
    },
    {
      name: "asc_testflight_get_tester",
      description: "Get one Beta Tester by id.",
      inputSchema: z.object({
        testerId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ testerId, include }) =>
        client.request(`/betaTesters/${testerId}`, { query: { include } }),
    },
    {
      name: "asc_testflight_list_app_localizations",
      description: "List TestFlight beta app localizations.",
      inputSchema: z.object({
        appId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, limit }) =>
        client.request(`/apps/${appId}/betaAppLocalizations`, { query: { limit: limit ?? 50 } }),
    },
    {
      name: "asc_testflight_get_app_localization",
      description: "Get one TestFlight beta app localization by id.",
      inputSchema: z.object({ localizationId: z.string() }),
      handler: async ({ localizationId }) =>
        client.request(`/betaAppLocalizations/${localizationId}`),
    },
    {
      name: "asc_testflight_get_beta_review_detail",
      description: "Get Beta App Review details for an app.",
      inputSchema: z.object({ appId: z.string() }),
      handler: async ({ appId }) => client.request(`/apps/${appId}/betaAppReviewDetail`),
    },
    {
      name: "asc_testflight_get_beta_license_agreement",
      description: "Get the TestFlight beta license agreement for an app.",
      inputSchema: z.object({ appId: z.string() }),
      handler: async ({ appId }) => client.request(`/apps/${appId}/betaLicenseAgreement`),
    },
    // NOTE: ASC does not allow GET on the feedback submission collections — only GET by id and DELETE.
    // Feedback ids must be obtained from the App Store Connect UI or a webhook/notification flow.
    {
      name: "asc_testflight_get_feedback_screenshot",
      description: "Get one beta feedback screenshot submission by id. (ASC does not support listing — id must be known from the UI.)",
      inputSchema: z.object({
        feedbackId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ feedbackId, include }) =>
        client.request(`/betaFeedbackScreenshotSubmissions/${feedbackId}`, { query: { include } }),
    },
    {
      name: "asc_testflight_get_feedback_crash",
      description: "Get one beta feedback crash submission by id. (ASC does not support listing — id must be known from the UI.)",
      inputSchema: z.object({
        feedbackId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ feedbackId, include }) =>
        client.request(`/betaFeedbackCrashSubmissions/${feedbackId}`, { query: { include } }),
    },
    {
      name: "asc_testflight_delete_feedback_screenshot",
      description: "Delete a beta feedback screenshot submission.",
      inputSchema: z.object({
        feedbackId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ feedbackId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/betaFeedbackScreenshotSubmissions/${feedbackId}`),
    },
    {
      name: "asc_testflight_delete_feedback_crash",
      description: "Delete a beta feedback crash submission.",
      inputSchema: z.object({
        feedbackId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ feedbackId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/betaFeedbackCrashSubmissions/${feedbackId}`),
    },

    // ---- WRITES: Phase 2 (beta app localizations) ----
    {
      name: "asc_testflight_update_app_localization",
      description: "Update a single field on a TestFlight beta app localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        field: z.enum(BETA_APP_LOC_FIELDS),
        value: z.string().nullable(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, field, value, dryRun }) => {
        const body = patchBody("betaAppLocalizations", localizationId, { [field]: value });
        return maybeSend(client, dryRun, "PATCH", `/betaAppLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_testflight_create_app_localization",
      description: "Add a new locale to TestFlight beta app metadata.",
      inputSchema: z.object({
        appId: z.string(),
        locale: z.enum(APP_STORE_LOCALES),
        attributes: z.object({
          description: z.string().nullable().optional(),
          feedbackEmail: z.string().nullable().optional(),
          marketingUrl: z.string().nullable().optional(),
          privacyPolicyUrl: z.string().nullable().optional(),
          tvOsPrivacyPolicy: z.string().nullable().optional(),
        }),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, locale, attributes, dryRun }) => {
        const body = postBody(
          "betaAppLocalizations",
          { locale, ...attributes },
          { app: singleRel("apps", appId) },
        );
        return maybeSend(client, dryRun, "POST", `/betaAppLocalizations`, body);
      },
    },
    {
      name: "asc_testflight_delete_app_localization",
      description: "Delete a TestFlight beta app localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/betaAppLocalizations/${localizationId}`),
    },

    // ---- WRITES: Phase 4 (group + tester + submission management) ----
    {
      name: "asc_testflight_create_group",
      description: "Create a Beta Group (external by default; set isInternalGroup=true for internal).",
      inputSchema: z.object({
        appId: z.string(),
        name: z.string(),
        publicLinkEnabled: z.boolean().optional(),
        publicLinkLimitEnabled: z.boolean().optional(),
        publicLinkLimit: z.number().int().optional(),
        isInternalGroup: z.boolean().optional(),
        feedbackEnabled: z.boolean().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, name, dryRun, ...attrs }) => {
        const body = postBody(
          "betaGroups",
          { name, ...attrs },
          { app: singleRel("apps", appId) },
        );
        return maybeSend(client, dryRun, "POST", `/betaGroups`, body);
      },
    },
    {
      name: "asc_testflight_update_group",
      description: "Update Beta Group attributes (name, public link settings, feedbackEnabled).",
      inputSchema: z.object({
        groupId: z.string(),
        attributes: z
          .object({
            name: z.string().optional(),
            publicLinkEnabled: z.boolean().optional(),
            publicLinkLimitEnabled: z.boolean().optional(),
            publicLinkLimit: z.number().int().nullable().optional(),
            feedbackEnabled: z.boolean().optional(),
          })
          .refine((a) => Object.keys(a).length > 0, "Provide at least one field"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, attributes, dryRun }) => {
        const body = patchBody("betaGroups", groupId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/betaGroups/${groupId}`, body);
      },
    },
    {
      name: "asc_testflight_delete_group",
      description: "Delete a Beta Group.",
      inputSchema: z.object({
        groupId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/betaGroups/${groupId}`),
    },
    {
      name: "asc_testflight_regenerate_public_link",
      description: "Regenerate the public TestFlight invite link for a group (invalidates the old URL).",
      inputSchema: z.object({
        groupId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, dryRun }) => {
        const body = patchBody("betaGroups", groupId, { publicLinkEnabled: true });
        return maybeSend(client, dryRun, "PATCH", `/betaGroups/${groupId}`, body);
      },
    },
    {
      name: "asc_testflight_add_tester_to_group",
      description: "Create a new beta tester and add them to a group.",
      inputSchema: z.object({
        groupId: z.string(),
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, email, firstName, lastName, dryRun }) => {
        const body = postBody(
          "betaTesters",
          { email, firstName, lastName },
          { betaGroups: { data: [{ type: "betaGroups", id: groupId }] } },
        );
        return maybeSend(client, dryRun, "POST", `/betaTesters`, body);
      },
    },
    {
      name: "asc_testflight_add_testers_bulk",
      description: "Add multiple existing testers to a group by tester id (relationships endpoint).",
      inputSchema: z.object({
        groupId: z.string(),
        testerIds: z.array(z.string()).min(1).max(200),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, testerIds, dryRun }) => {
        const body = { data: testerIds.map((id: string) => ({ type: "betaTesters", id })) };
        return maybeSend(client, dryRun, "POST", `/betaGroups/${groupId}/relationships/betaTesters`, body);
      },
    },
    {
      name: "asc_testflight_remove_testers_from_group",
      description: "Remove testers from a group (does not delete them from the app).",
      inputSchema: z.object({
        groupId: z.string(),
        testerIds: z.array(z.string()).min(1).max(200),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, testerIds, dryRun }) => {
        const body = { data: testerIds.map((id: string) => ({ type: "betaTesters", id })) };
        return maybeSend(client, dryRun, "DELETE", `/betaGroups/${groupId}/relationships/betaTesters`, body);
      },
    },
    {
      name: "asc_testflight_delete_tester",
      description: "Delete a beta tester entirely (removes them from all groups + app).",
      inputSchema: z.object({
        testerId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ testerId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/betaTesters/${testerId}`),
    },
    {
      name: "asc_testflight_add_build_to_group",
      description: "Add a build to a Beta Group (makes it available to that group's testers).",
      inputSchema: z.object({
        groupId: z.string(),
        buildIds: z.array(z.string()).min(1),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, buildIds, dryRun }) => {
        const body = { data: buildIds.map((id: string) => ({ type: "builds", id })) };
        return maybeSend(client, dryRun, "POST", `/betaGroups/${groupId}/relationships/builds`, body);
      },
    },
    {
      name: "asc_testflight_remove_build_from_group",
      description: "Remove builds from a Beta Group.",
      inputSchema: z.object({
        groupId: z.string(),
        buildIds: z.array(z.string()).min(1),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, buildIds, dryRun }) => {
        const body = { data: buildIds.map((id: string) => ({ type: "builds", id })) };
        return maybeSend(client, dryRun, "DELETE", `/betaGroups/${groupId}/relationships/builds`, body);
      },
    },
    {
      name: "asc_testflight_submit_for_beta_review",
      description: "Submit a build for Beta App Review (required before external testers can install).",
      inputSchema: z.object({
        buildId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ buildId, dryRun }) => {
        const body = postBody(
          "betaAppReviewSubmissions",
          undefined,
          { build: singleRel("builds", buildId) },
        );
        return maybeSend(client, dryRun, "POST", `/betaAppReviewSubmissions`, body);
      },
    },
    {
      name: "asc_testflight_update_beta_review_detail",
      description: "Update Beta App Review contact info / demo / notes for an app.",
      inputSchema: z.object({
        detailId: z.string().describe("betaAppReviewDetail resource id"),
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
      handler: async ({ detailId, attributes, dryRun }) => {
        const body = patchBody("betaAppReviewDetails", detailId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/betaAppReviewDetails/${detailId}`, body);
      },
    },
    {
      name: "asc_testflight_update_license_agreement",
      description: "Update the TestFlight beta license agreement text for an app.",
      inputSchema: z.object({
        agreementId: z.string(),
        agreementText: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ agreementId, agreementText, dryRun }) => {
        const body = patchBody("betaLicenseAgreements", agreementId, { agreementText });
        return maybeSend(client, dryRun, "PATCH", `/betaLicenseAgreements/${agreementId}`, body);
      },
    },
  ];
}
