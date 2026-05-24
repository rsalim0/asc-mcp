import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { AscClient } from "../client.js";
import { postBody, patchBody } from "./jsonapi-write.js";

export interface UploadOperation {
  method: string;
  url: string;
  length: number;
  offset: number;
  requestHeaders: Array<{ name: string; value: string }>;
}

export interface ReservedAsset {
  id: string;
  type: string;
  attributes: { uploadOperations: UploadOperation[]; fileName: string; fileSize: number };
}

/** Reserve an asset (screenshot or preview), upload bytes, commit. */
export async function uploadAsset(
  client: AscClient,
  params: {
    assetType: "appScreenshots" | "appPreviews";
    setId: string;
    setType: "appScreenshotSets" | "appPreviewSets";
    filePath: string;
    fileName?: string;
  },
): Promise<unknown> {
  const fileSize = statSync(params.filePath).size;
  const fileName = params.fileName ?? basename(params.filePath);
  const reserveBody = postBody(
    params.assetType,
    { fileName, fileSize },
    { [params.setType.slice(0, -1)]: { data: { type: params.setType, id: params.setId } } },
  );
  const reserved = await client.request<{ data: ReservedAsset }>(`/${params.assetType}`, {
    method: "POST",
    body: reserveBody,
  });

  const assetId = reserved.data.id;
  const operations = reserved.data.attributes.uploadOperations;
  const bytes = readFileSync(params.filePath);

  for (const op of operations) {
    const slice = bytes.subarray(op.offset, op.offset + op.length);
    const headers: Record<string, string> = {};
    for (const h of op.requestHeaders) headers[h.name] = h.value;
    const res = await fetch(op.url, {
      method: op.method,
      headers,
      body: slice,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Upload chunk failed (${res.status}) at offset ${op.offset}: ${txt}`);
    }
  }

  const checksum = createHash("md5").update(bytes).digest("hex");
  const commitBody = patchBody(params.assetType, assetId, {
    uploaded: true,
    sourceFileChecksum: checksum,
  });
  return client.request(`/${params.assetType}/${assetId}`, {
    method: "PATCH",
    body: commitBody,
  });
}

export const SCREENSHOT_DISPLAY_TYPES = [
  "APP_IPHONE_69",
  "APP_IPHONE_67",
  "APP_IPHONE_65",
  "APP_IPHONE_61",
  "APP_IPHONE_58",
  "APP_IPHONE_55",
  "APP_IPHONE_47",
  "APP_IPHONE_40",
  "APP_IPHONE_35",
  "APP_IPAD_PRO_3GEN_129",
  "APP_IPAD_PRO_3GEN_11",
  "APP_IPAD_PRO_129",
  "APP_IPAD_105",
  "APP_IPAD_97",
  "APP_DESKTOP",
  "APP_WATCH_ULTRA",
  "APP_WATCH_SERIES_10",
  "APP_WATCH_SERIES_7",
  "APP_WATCH_SERIES_4",
  "APP_WATCH_SERIES_3",
  "APP_APPLE_TV",
  "APP_APPLE_VISION_PRO",
] as const;

/**
 * Walk a folder structured as `<displayType>/<locale>/*.{png,jpg}` and upload everything.
 * Returns a per-file result list.
 */
export async function uploadScreenshotFolder(
  client: AscClient,
  params: {
    versionId: string;
    folder: string;
    dryRun?: boolean;
  },
): Promise<unknown> {
  if (!existsSync(params.folder)) throw new Error(`Folder not found: ${params.folder}`);

  const locResp = await client.request<{ data: Array<{ id: string; attributes: { locale: string } }> }>(
    `/appStoreVersions/${params.versionId}/appStoreVersionLocalizations`,
    { query: { limit: 200 } },
  );
  const locsByCode = new Map(locResp.data.map((l) => [l.attributes.locale, l.id]));

  const planned: Array<{ displayType: string; locale: string; file: string; localizationId?: string; setId?: string }> = [];
  for (const dt of readdirSync(params.folder)) {
    const dtPath = join(params.folder, dt);
    if (!statSync(dtPath).isDirectory()) continue;
    const displayType = dt.toUpperCase();
    for (const loc of readdirSync(dtPath)) {
      const locPath = join(dtPath, loc);
      if (!statSync(locPath).isDirectory()) continue;
      for (const f of readdirSync(locPath)) {
        if (!/\.(png|jpe?g)$/i.test(f)) continue;
        planned.push({ displayType, locale: loc, file: join(locPath, f), localizationId: locsByCode.get(loc) });
      }
    }
  }

  if (params.dryRun) return { dryRun: true, planned };

  const results: Array<{ file: string; result: unknown; error?: string }> = [];
  const setCache = new Map<string, string>();

  for (const item of planned) {
    if (!item.localizationId) {
      results.push({ file: item.file, result: null, error: `No localization for ${item.locale}` });
      continue;
    }
    const setKey = `${item.localizationId}:${item.displayType}`;
    let setId = setCache.get(setKey);
    if (!setId) {
      const sets = await client.request<{ data: Array<{ id: string; attributes: { screenshotDisplayType?: string; previewType?: string } }> }>(
        `/appStoreVersionLocalizations/${item.localizationId}/appScreenshotSets`,
        { query: { limit: 200 } },
      );
      const found = sets.data.find((s) => s.attributes.screenshotDisplayType === item.displayType);
      if (found) {
        setId = found.id;
      } else {
        const created = await client.request<{ data: { id: string } }>(`/appScreenshotSets`, {
          method: "POST",
          body: postBody(
            "appScreenshotSets",
            { screenshotDisplayType: item.displayType },
            { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: item.localizationId } } },
          ),
        });
        setId = created.data.id;
      }
      setCache.set(setKey, setId);
    }
    try {
      const result = await uploadAsset(client, {
        assetType: "appScreenshots",
        setId,
        setType: "appScreenshotSets",
        filePath: item.file,
      });
      results.push({ file: item.file, result });
    } catch (err) {
      results.push({ file: item.file, result: null, error: (err as Error).message });
    }
  }

  return { uploaded: results.length, results };
}
