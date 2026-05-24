import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { patchBody, postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { uploadAsset, uploadScreenshotFolder, SCREENSHOT_DISPLAY_TYPES } from "../lib/upload.js";

export function screenshotsTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_screenshots_list_sets",
      description: "List screenshot sets for a version localization (one set per display type per locale).",
      inputSchema: z.object({
        localizationId: z.string().describe("App Store Version Localization id"),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ localizationId, limit }) =>
        client.request(
          `/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`,
          { query: { limit: limit ?? 50 } },
        ),
    },
    {
      name: "asc_screenshots_get_set",
      description: "Get one screenshot set by id.",
      inputSchema: z.object({
        setId: z.string(),
        include: z.array(z.string()).optional().describe("e.g. appScreenshots"),
      }),
      handler: async ({ setId, include }) =>
        client.request(`/appScreenshotSets/${setId}`, { query: { include } }),
    },
    {
      name: "asc_screenshots_list_assets",
      description: "List screenshots in a set.",
      inputSchema: z.object({
        setId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ setId, limit }) =>
        client.request(`/appScreenshotSets/${setId}/appScreenshots`, {
          query: { limit: limit ?? 50 },
        }),
    },
    {
      name: "asc_screenshots_get_asset",
      description: "Get one screenshot asset by id (incl. image URLs).",
      inputSchema: z.object({ assetId: z.string() }),
      handler: async ({ assetId }) =>
        client.request(`/appScreenshots/${assetId}`),
    },
    {
      name: "asc_previews_list_sets",
      description: "List app preview (video) sets for a version localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ localizationId, limit }) =>
        client.request(
          `/appStoreVersionLocalizations/${localizationId}/appPreviewSets`,
          { query: { limit: limit ?? 50 } },
        ),
    },
    {
      name: "asc_previews_get_set",
      description: "Get one app preview set by id.",
      inputSchema: z.object({
        setId: z.string(),
        include: z.array(z.string()).optional().describe("e.g. appPreviews"),
      }),
      handler: async ({ setId, include }) =>
        client.request(`/appPreviewSets/${setId}`, { query: { include } }),
    },
    {
      name: "asc_previews_list_assets",
      description: "List previews in a set.",
      inputSchema: z.object({
        setId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ setId, limit }) =>
        client.request(`/appPreviewSets/${setId}/appPreviews`, {
          query: { limit: limit ?? 50 },
        }),
    },
    {
      name: "asc_previews_get_asset",
      description: "Get one preview asset by id.",
      inputSchema: z.object({ assetId: z.string() }),
      handler: async ({ assetId }) => client.request(`/appPreviews/${assetId}`),
    },

    // ---- WRITES: Phase 6 (sets, single upload, folder upload, reorder, delete) ----
    {
      name: "asc_screenshots_create_set",
      description: "Create a screenshot set for a display type on a version localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        displayType: z.enum(SCREENSHOT_DISPLAY_TYPES),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, displayType, dryRun }) => {
        const body = postBody(
          "appScreenshotSets",
          { screenshotDisplayType: displayType },
          { appStoreVersionLocalization: singleRel("appStoreVersionLocalizations", localizationId) },
        );
        return maybeSend(client, dryRun, "POST", `/appScreenshotSets`, body);
      },
    },
    {
      name: "asc_screenshots_delete_set",
      description: "Delete a screenshot set (and all its assets).",
      inputSchema: z.object({
        setId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ setId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appScreenshotSets/${setId}`),
    },
    {
      name: "asc_screenshots_upload_one",
      description:
        "Upload a single screenshot into a set: reserves the asset, uploads bytes, commits with MD5 checksum.",
      inputSchema: z.object({
        setId: z.string(),
        filePath: z.string().describe("Absolute path to the image file"),
        fileName: z.string().optional().describe("Override file name reported to ASC"),
      }),
      handler: async ({ setId, filePath, fileName }) =>
        uploadAsset(client, {
          assetType: "appScreenshots",
          setType: "appScreenshotSets",
          setId,
          filePath,
          fileName,
        }),
    },
    {
      name: "asc_screenshots_upload_folder",
      description:
        "Walk a folder organized as `<displayType>/<locale>/*.{png,jpg}` and upload everything to the version. Creates missing sets. Supports dryRun.",
      inputSchema: z.object({
        versionId: z.string(),
        folder: z.string().describe("Absolute path to the screenshots root"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, folder, dryRun }) =>
        uploadScreenshotFolder(client, { versionId, folder, dryRun }),
    },
    {
      name: "asc_screenshots_reorder_set",
      description: "Reorder screenshots in a set. Pass the asset ids in the desired order.",
      inputSchema: z.object({
        setId: z.string(),
        assetIds: z.array(z.string()).min(1),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ setId, assetIds, dryRun }) => {
        const body = { data: assetIds.map((id: string) => ({ type: "appScreenshots", id })) };
        return maybeSend(client, dryRun, "PATCH", `/appScreenshotSets/${setId}/relationships/appScreenshots`, body);
      },
    },
    {
      name: "asc_screenshots_delete_asset",
      description: "Delete a screenshot asset.",
      inputSchema: z.object({
        assetId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ assetId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appScreenshots/${assetId}`),
    },

    // App Previews (videos)
    {
      name: "asc_previews_create_set",
      description: "Create a preview (video) set on a version localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        previewType: z.string().describe("e.g. IPHONE_69, IPAD_PRO_3GEN_129"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, previewType, dryRun }) => {
        const body = postBody(
          "appPreviewSets",
          { previewType },
          { appStoreVersionLocalization: singleRel("appStoreVersionLocalizations", localizationId) },
        );
        return maybeSend(client, dryRun, "POST", `/appPreviewSets`, body);
      },
    },
    {
      name: "asc_previews_delete_set",
      description: "Delete a preview set.",
      inputSchema: z.object({
        setId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ setId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appPreviewSets/${setId}`),
    },
    {
      name: "asc_previews_upload_one",
      description: "Upload a single app preview video into a preview set.",
      inputSchema: z.object({
        setId: z.string(),
        filePath: z.string(),
        fileName: z.string().optional(),
      }),
      handler: async ({ setId, filePath, fileName }) =>
        uploadAsset(client, {
          assetType: "appPreviews",
          setType: "appPreviewSets",
          setId,
          filePath,
          fileName,
        }),
    },
    {
      name: "asc_previews_reorder_set",
      description: "Reorder previews in a set.",
      inputSchema: z.object({
        setId: z.string(),
        assetIds: z.array(z.string()).min(1),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ setId, assetIds, dryRun }) => {
        const body = { data: assetIds.map((id: string) => ({ type: "appPreviews", id })) };
        return maybeSend(client, dryRun, "PATCH", `/appPreviewSets/${setId}/relationships/appPreviews`, body);
      },
    },
    {
      name: "asc_previews_delete_asset",
      description: "Delete a preview asset.",
      inputSchema: z.object({
        assetId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ assetId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/appPreviews/${assetId}`),
    },
    {
      name: "asc_previews_update_metadata",
      description: "Update preview metadata (mimeType, previewFrameTimeCode).",
      inputSchema: z.object({
        assetId: z.string(),
        attributes: z
          .object({
            mimeType: z.string().optional(),
            previewFrameTimeCode: z.string().optional().describe("HH:MM:SS:FF"),
          })
          .refine((a) => Object.keys(a).length > 0),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ assetId, attributes, dryRun }) => {
        const body = patchBody("appPreviews", assetId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/appPreviews/${assetId}`, body);
      },
    },
  ];
}
