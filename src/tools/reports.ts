import { z } from "zod";
import { gunzipSync } from "node:zlib";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";

function requireVendor(client: AscClient): string {
  if (!client.vendorNumber) {
    throw new Error(
      "APP_STORE_CONNECT_VENDOR_NUMBER must be set for sales/finance reports. Find it under Payments and Financial Reports in App Store Connect.",
    );
  }
  return client.vendorNumber;
}

function parseTsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

export function reportsTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_reports_sales",
      description:
        "Download a sales/trends report. Returns parsed rows (gzipped TSV decoded). Requires APP_STORE_CONNECT_VENDOR_NUMBER.",
      inputSchema: z.object({
        frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
        reportDate: z
          .string()
          .describe("YYYY-MM-DD for DAILY, YYYY-MM-DD (Sunday) for WEEKLY, YYYY-MM for MONTHLY, YYYY for YEARLY"),
        reportType: z
          .enum([
            "SALES",
            "PRE_ORDER",
            "NEWSSTAND",
            "SUBSCRIPTION",
            "SUBSCRIPTION_EVENT",
            "SUBSCRIBER",
            "SUBSCRIPTION_OFFER_CODE_REDEMPTION",
            "INSTALLS",
            "FIRST_ANNUAL",
          ])
          .default("SALES"),
        reportSubType: z.enum(["SUMMARY", "DETAILED", "OPT_IN"]).default("SUMMARY"),
        version: z.string().optional().describe("Report version, e.g. '1_0' for SALES SUMMARY"),
        vendorNumber: z.string().optional(),
        returnRaw: z.boolean().default(false).describe("Return raw decoded TSV instead of parsed rows"),
      }),
      handler: async ({ frequency, reportDate, reportType, reportSubType, version, vendorNumber, returnRaw }) => {
        const vendor = vendorNumber ?? requireVendor(client);
        const buf = await client.request<ArrayBuffer>("/salesReports", {
          query: {
            "filter[frequency]": frequency,
            "filter[reportDate]": reportDate,
            "filter[reportType]": reportType,
            "filter[reportSubType]": reportSubType,
            "filter[vendorNumber]": vendor,
            "filter[version]": version,
          },
          headers: { Accept: "application/a-gzip" },
          expectBinary: true,
        });
        const text = gunzipSync(Buffer.from(buf)).toString("utf8");
        return returnRaw ? text : parseTsv(text);
      },
    },
    {
      name: "asc_reports_finance",
      description: "Download a regional finance report. Requires APP_STORE_CONNECT_VENDOR_NUMBER.",
      inputSchema: z.object({
        reportDate: z.string().describe("YYYY-MM"),
        regionCode: z.string().describe("e.g. US, Z1 (combined Latin America), etc."),
        reportType: z.enum(["FINANCIAL", "FINANCE_DETAIL"]).default("FINANCIAL"),
        vendorNumber: z.string().optional(),
        returnRaw: z.boolean().default(false),
      }),
      handler: async ({ reportDate, regionCode, reportType, vendorNumber, returnRaw }) => {
        const vendor = vendorNumber ?? requireVendor(client);
        const buf = await client.request<ArrayBuffer>("/financeReports", {
          query: {
            "filter[reportDate]": reportDate,
            "filter[regionCode]": regionCode,
            "filter[reportType]": reportType,
            "filter[vendorNumber]": vendor,
          },
          headers: { Accept: "application/a-gzip" },
          expectBinary: true,
        });
        const text = gunzipSync(Buffer.from(buf)).toString("utf8");
        return returnRaw ? text : parseTsv(text);
      },
    },
    {
      name: "asc_analytics_create_request",
      description:
        "Create an Analytics Report Request for an app. Step 1 of the async analytics flow: returns the request id you'll poll.",
      inputSchema: z.object({
        appId: z.string(),
        accessType: z.enum(["ONGOING", "ONE_TIME_SNAPSHOT"]).default("ONE_TIME_SNAPSHOT"),
      }),
      handler: async ({ appId, accessType }) =>
        client.request("/analyticsReportRequests", {
          method: "POST",
          body: {
            data: {
              type: "analyticsReportRequests",
              attributes: { accessType },
              relationships: {
                app: { data: { type: "apps", id: appId } },
              },
            },
          },
        }),
    },
    {
      name: "asc_analytics_list_reports",
      description: "List Analytics Reports available under a request id (step 2).",
      inputSchema: z.object({
        requestId: z.string(),
        category: z
          .enum([
            "APP_USAGE",
            "APP_STORE_ENGAGEMENT",
            "COMMERCE",
            "FRAMEWORKS_USAGE",
            "PERFORMANCE",
          ])
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ requestId, category, limit }) =>
        client.request(`/analyticsReportRequests/${requestId}/reports`, {
          query: {
            "filter[category]": category,
            limit: limit ?? 200,
          },
        }),
    },
    {
      name: "asc_analytics_list_instances",
      description: "List instances of an Analytics Report (step 3).",
      inputSchema: z.object({
        reportId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ reportId, limit }) =>
        client.request(`/analyticsReports/${reportId}/instances`, {
          query: { limit: limit ?? 100 },
        }),
    },
    {
      name: "asc_analytics_list_segments",
      description: "List downloadable segments for an Analytics Report Instance (step 3b).",
      inputSchema: z.object({
        instanceId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ instanceId, limit }) =>
        client.request(`/analyticsReportInstances/${instanceId}/segments`, {
          query: { limit: limit ?? 100 },
        }),
    },
    {
      name: "asc_analytics_download_segment",
      description: "Download a specific Analytics Report segment by its presigned URL (step 4). Returns parsed CSV rows.",
      inputSchema: z.object({
        url: z.string().url(),
        returnRaw: z.boolean().default(false),
      }),
      handler: async ({ url, returnRaw }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Segment download ${res.status}: ${await res.text()}`);
        const text = await res.text();
        return returnRaw ? text : parseTsv(text);
      },
    },
  ];
}
