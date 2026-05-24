import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";
import { postBody, patchBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";

const CERT_TYPES = [
  "IOS_DEVELOPMENT",
  "IOS_DISTRIBUTION",
  "MAC_APP_DISTRIBUTION",
  "MAC_INSTALLER_DISTRIBUTION",
  "MAC_APP_DEVELOPMENT",
  "DEVELOPER_ID_KEXT",
  "DEVELOPER_ID_APPLICATION",
  "DEVELOPMENT",
  "DISTRIBUTION",
  "PASS_TYPE_ID",
  "PASS_TYPE_ID_WITH_NFC",
] as const;

const PROFILE_TYPES = [
  "IOS_APP_DEVELOPMENT",
  "IOS_APP_STORE",
  "IOS_APP_ADHOC",
  "IOS_APP_INHOUSE",
  "MAC_APP_DEVELOPMENT",
  "MAC_APP_STORE",
  "MAC_APP_DIRECT",
  "TVOS_APP_DEVELOPMENT",
  "TVOS_APP_STORE",
  "TVOS_APP_ADHOC",
  "TVOS_APP_INHOUSE",
  "MAC_CATALYST_APP_DEVELOPMENT",
  "MAC_CATALYST_APP_STORE",
  "MAC_CATALYST_APP_DIRECT",
] as const;

export function provisioningTools(client: AscClient): ToolDef[] {
  return [
    // Bundle IDs
    {
      name: "asc_bundle_ids_list",
      description: "List registered bundle identifiers.",
      inputSchema: z.object({
        identifier: z.string().optional().describe("Filter by bundle id string"),
        name: z.string().optional(),
        platform: z.enum(["IOS", "MAC_OS", "UNIVERSAL"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        include: z
          .array(z.string())
          .optional()
          .describe("e.g. app, bundleIdCapabilities, profiles"),
        sort: z.enum(["identifier", "-identifier", "name", "-name", "id", "-id"]).optional(),
      }),
      handler: async ({ identifier, name, platform, limit, include, sort }) =>
        client.request("/bundleIds", {
          query: {
            "filter[identifier]": identifier,
            "filter[name]": name,
            "filter[platform]": platform,
            limit: limit ?? 100,
            include,
            sort,
            "fields[bundleIds]": DEFAULT_FIELDS.bundleIds,
          },
        }),
    },
    {
      name: "asc_bundle_ids_get",
      description: "Get one bundle id by id.",
      inputSchema: z.object({
        bundleIdId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ bundleIdId, include }) =>
        client.request(`/bundleIds/${bundleIdId}`, { query: { include } }),
    },
    {
      name: "asc_bundle_id_capabilities_list",
      description: "List capabilities for a bundle id.",
      inputSchema: z.object({
        bundleIdId: z.string(),
      }),
      handler: async ({ bundleIdId }) =>
        client.request(`/bundleIds/${bundleIdId}/bundleIdCapabilities`),
    },

    // Certificates
    {
      name: "asc_certificates_list",
      description: "List signing certificates.",
      inputSchema: z.object({
        certificateType: z
          .enum([
            "IOS_DEVELOPMENT",
            "IOS_DISTRIBUTION",
            "MAC_APP_DISTRIBUTION",
            "MAC_INSTALLER_DISTRIBUTION",
            "MAC_APP_DEVELOPMENT",
            "DEVELOPER_ID_KEXT",
            "DEVELOPER_ID_APPLICATION",
            "DEVELOPMENT",
            "DISTRIBUTION",
            "PASS_TYPE_ID",
            "PASS_TYPE_ID_WITH_NFC",
          ])
          .optional(),
        displayName: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ certificateType, displayName, limit }) =>
        client.request("/certificates", {
          query: {
            "filter[certificateType]": certificateType,
            "filter[displayName]": displayName,
            limit: limit ?? 100,
          },
        }),
    },
    {
      name: "asc_certificates_get",
      description: "Get one certificate by id (includes base64 CER content in attributes).",
      inputSchema: z.object({ certificateId: z.string() }),
      handler: async ({ certificateId }) =>
        client.request(`/certificates/${certificateId}`),
    },

    // Profiles
    {
      name: "asc_profiles_list",
      description: "List provisioning profiles.",
      inputSchema: z.object({
        profileType: z
          .enum([
            "IOS_APP_DEVELOPMENT",
            "IOS_APP_STORE",
            "IOS_APP_ADHOC",
            "IOS_APP_INHOUSE",
            "MAC_APP_DEVELOPMENT",
            "MAC_APP_STORE",
            "MAC_APP_DIRECT",
            "TVOS_APP_DEVELOPMENT",
            "TVOS_APP_STORE",
            "TVOS_APP_ADHOC",
            "TVOS_APP_INHOUSE",
            "MAC_CATALYST_APP_DEVELOPMENT",
            "MAC_CATALYST_APP_STORE",
            "MAC_CATALYST_APP_DIRECT",
          ])
          .optional(),
        profileState: z.enum(["ACTIVE", "INVALID"]).optional(),
        name: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        include: z
          .array(z.string())
          .optional()
          .describe("e.g. bundleId, certificates, devices"),
      }),
      handler: async ({ profileType, profileState, name, limit, include }) =>
        client.request("/profiles", {
          query: {
            "filter[profileType]": profileType,
            "filter[profileState]": profileState,
            "filter[name]": name,
            limit: limit ?? 100,
            include,
          },
        }),
    },
    {
      name: "asc_profiles_get",
      description: "Get one provisioning profile by id (includes base64 mobileprovision content).",
      inputSchema: z.object({
        profileId: z.string(),
        include: z.array(z.string()).optional(),
      }),
      handler: async ({ profileId, include }) =>
        client.request(`/profiles/${profileId}`, { query: { include } }),
    },

    // Devices
    {
      name: "asc_devices_list",
      description: "List registered team devices.",
      inputSchema: z.object({
        name: z.string().optional(),
        platform: z.enum(["IOS", "MAC_OS"]).optional(),
        status: z.enum(["ENABLED", "DISABLED"]).optional(),
        udid: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ name, platform, status, udid, limit }) =>
        client.request("/devices", {
          query: {
            "filter[name]": name,
            "filter[platform]": platform,
            "filter[status]": status,
            "filter[udid]": udid,
            limit: limit ?? 200,
            "fields[devices]": DEFAULT_FIELDS.devices,
          },
        }),
    },

    // ---- WRITES: Phase 9 ----
    {
      name: "asc_bundle_ids_create",
      description: "Register a new bundle identifier.",
      inputSchema: z.object({
        identifier: z.string(),
        name: z.string(),
        platform: z.enum(["IOS", "MAC_OS", "UNIVERSAL"]),
        seedId: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ identifier, name, platform, seedId, dryRun }) => {
        const attrs: Record<string, unknown> = { identifier, name, platform };
        if (seedId) attrs.seedId = seedId;
        const body = postBody("bundleIds", attrs);
        return maybeSend(client, dryRun, "POST", `/bundleIds`, body);
      },
    },
    {
      name: "asc_bundle_ids_update",
      description: "Update a bundle id's name.",
      inputSchema: z.object({
        bundleIdId: z.string(),
        name: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ bundleIdId, name, dryRun }) => {
        const body = patchBody("bundleIds", bundleIdId, { name });
        return maybeSend(client, dryRun, "PATCH", `/bundleIds/${bundleIdId}`, body);
      },
    },
    {
      name: "asc_bundle_ids_delete",
      description: "Delete a bundle id.",
      inputSchema: z.object({
        bundleIdId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ bundleIdId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/bundleIds/${bundleIdId}`),
    },
    {
      name: "asc_bundle_id_capabilities_enable",
      description: "Enable a capability on a bundle id.",
      inputSchema: z.object({
        bundleIdId: z.string(),
        capabilityType: z.string().describe(
          "e.g. ICLOUD, IN_APP_PURCHASE, PUSH_NOTIFICATIONS, GAME_CENTER, ASSOCIATED_DOMAINS, APPLE_PAY, SIGN_IN_WITH_APPLE, HEALTHKIT, HOMEKIT, ACCESS_WIFI_INFORMATION, WIRELESS_ACCESSORY_CONFIGURATION, etc.",
        ),
        settings: z.array(z.record(z.string(), z.unknown())).optional().describe("Optional capability settings"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ bundleIdId, capabilityType, settings, dryRun }) => {
        const attrs: Record<string, unknown> = { capabilityType };
        if (settings) attrs.settings = settings;
        const body = postBody(
          "bundleIdCapabilities",
          attrs,
          { bundleId: singleRel("bundleIds", bundleIdId) },
        );
        return maybeSend(client, dryRun, "POST", `/bundleIdCapabilities`, body);
      },
    },
    {
      name: "asc_bundle_id_capabilities_disable",
      description: "Disable a capability on a bundle id.",
      inputSchema: z.object({
        capabilityId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ capabilityId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/bundleIdCapabilities/${capabilityId}`),
    },
    {
      name: "asc_certificates_create",
      description:
        "Create a new signing certificate. Requires a Certificate Signing Request (PEM CSR, base64-encoded).",
      inputSchema: z.object({
        certificateType: z.enum(CERT_TYPES),
        csrContent: z.string().describe("Base64-encoded PEM CSR (without BEGIN/END lines)"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ certificateType, csrContent, dryRun }) => {
        const body = postBody("certificates", { certificateType, csrContent });
        return maybeSend(client, dryRun, "POST", `/certificates`, body);
      },
    },
    {
      name: "asc_certificates_delete",
      description: "Revoke a certificate.",
      inputSchema: z.object({
        certificateId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ certificateId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/certificates/${certificateId}`),
    },
    {
      name: "asc_profiles_create",
      description: "Create a new provisioning profile.",
      inputSchema: z.object({
        name: z.string(),
        profileType: z.enum(PROFILE_TYPES),
        bundleIdId: z.string(),
        certificateIds: z.array(z.string()).min(1),
        deviceIds: z.array(z.string()).optional().describe("Required for AD_HOC / DEVELOPMENT profiles"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ name, profileType, bundleIdId, certificateIds, deviceIds, dryRun }) => {
        const relationships: Record<string, { data: { type: string; id: string } | Array<{ type: string; id: string }> }> = {
          bundleId: { data: { type: "bundleIds", id: bundleIdId } },
          certificates: { data: certificateIds.map((id: string) => ({ type: "certificates", id })) },
        };
        if (deviceIds && deviceIds.length) {
          relationships.devices = { data: deviceIds.map((id: string) => ({ type: "devices", id })) };
        }
        const body = postBody("profiles", { name, profileType }, relationships);
        return maybeSend(client, dryRun, "POST", `/profiles`, body);
      },
    },
    {
      name: "asc_profiles_delete",
      description: "Delete a provisioning profile.",
      inputSchema: z.object({
        profileId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ profileId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/profiles/${profileId}`),
    },
    {
      name: "asc_devices_create",
      description: "Register a new device.",
      inputSchema: z.object({
        name: z.string(),
        udid: z.string(),
        platform: z.enum(["IOS", "MAC_OS"]),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ name, udid, platform, dryRun }) => {
        const body = postBody("devices", { name, udid, platform });
        return maybeSend(client, dryRun, "POST", `/devices`, body);
      },
    },
    {
      name: "asc_devices_update",
      description: "Update a device (rename or enable/disable).",
      inputSchema: z.object({
        deviceId: z.string(),
        attributes: z
          .object({
            name: z.string().optional(),
            status: z.enum(["ENABLED", "DISABLED"]).optional(),
          })
          .refine((a) => Object.keys(a).length > 0),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ deviceId, attributes, dryRun }) => {
        const body = patchBody("devices", deviceId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/devices/${deviceId}`, body);
      },
    },
  ];
}
