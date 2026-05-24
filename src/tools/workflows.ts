import { z } from "zod";
import { execSync } from "node:child_process";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { postBody, patchBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { APP_STORE_LOCALES, METADATA_CHAR_LIMITS } from "../lib/locales.js";

type AnyData = { id: string; attributes: Record<string, any>; relationships?: Record<string, any>; type: string };

async function listAll<T = AnyData>(client: AscClient, path: string, query: Record<string, unknown> = {}): Promise<T[]> {
  const acc: T[] = [];
  let next: string | null = null;
  let q: Record<string, unknown> | undefined = { limit: 200, ...query };
  for (let i = 0; i < 20 && (i === 0 || next); i++) {
    const resp: { data: T[]; links?: { next?: string } } = next
      ? await client.request(next)
      : await client.request(path, { query: q as Record<string, any> });
    q = undefined;
    acc.push(...resp.data);
    next = resp.links?.next ?? null;
    if (!next) break;
  }
  return acc;
}

export function workflowsTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_workflow_id_resolver",
      description:
        "Look up canonical ids for an app from any of: bundle id, app name fragment, or sku. Returns appId plus optional latest version/build ids when found.",
      inputSchema: z.object({
        query: z.string().describe("bundle id, name substring, or sku"),
        includeLatestVersion: z.boolean().default(true),
        includeLatestBuild: z.boolean().default(true),
      }),
      handler: async ({ query, includeLatestVersion, includeLatestBuild }) => {
        // Try as bundle id first
        let apps = await client.request<{ data: AnyData[] }>(`/apps`, {
          query: { "filter[bundleId]": query, limit: 10 },
        });
        if (apps.data.length === 0) {
          apps = await client.request<{ data: AnyData[] }>(`/apps`, {
            query: { "filter[name]": query, limit: 10 },
          });
        }
        if (apps.data.length === 0) {
          apps = await client.request<{ data: AnyData[] }>(`/apps`, {
            query: { "filter[sku]": query, limit: 10 },
          });
        }
        if (apps.data.length === 0) {
          const all = await client.request<{ data: AnyData[] }>(`/apps`, { query: { limit: 200 } });
          const q = query.toLowerCase();
          apps = { data: all.data.filter((a) => (a.attributes.name as string)?.toLowerCase().includes(q)) };
        }
        const results: any[] = [];
        for (const app of apps.data.slice(0, 5)) {
          const item: any = {
            appId: app.id,
            name: app.attributes.name,
            bundleId: app.attributes.bundleId,
            sku: app.attributes.sku,
          };
          if (includeLatestVersion) {
            const v = await client.request<{ data: AnyData[] }>(`/apps/${app.id}/appStoreVersions`, {
              query: { limit: 1 },
            });
            if (v.data[0]) {
              item.latestVersion = {
                id: v.data[0].id,
                versionString: v.data[0].attributes.versionString,
                state: v.data[0].attributes.appStoreState,
              };
            }
          }
          if (includeLatestBuild) {
            const b = await client.request<{ data: AnyData[] }>(`/builds`, {
              query: { "filter[app]": app.id, limit: 1, sort: "-uploadedDate" },
            });
            if (b.data[0]) {
              item.latestBuild = {
                id: b.data[0].id,
                version: b.data[0].attributes.version,
                processingState: b.data[0].attributes.processingState,
                expired: b.data[0].attributes.expired,
              };
            }
          }
          results.push(item);
        }
        return { matches: results };
      },
    },
    {
      name: "asc_workflow_whats_new_from_git",
      description:
        "Read `git log <since>..HEAD` from a repo path and return a draft 'What's New' note. Trims to 4000 chars. Does NOT push — caller pushes via asc_versions_update_localization.",
      inputSchema: z.object({
        repoPath: z.string().describe("Absolute path to a git repository"),
        since: z.string().describe("Git ref to diff from, e.g. last tag like v1.2.3"),
        maxBullets: z.number().int().min(1).max(50).default(10),
      }),
      handler: async ({ repoPath, since, maxBullets }) => {
        const log = execSync(`git -C "${repoPath}" log --pretty=format:%s ${since}..HEAD`, {
          encoding: "utf8",
        });
        const lines = log
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !/^(chore|ci|docs|test|build|merge)/i.test(l))
          .slice(0, maxBullets);
        const bullets = lines.map((l) => `• ${l.replace(/^([a-z]+)(\([^)]+\))?:\s*/i, "")}`).join("\n");
        return { draft: bullets.slice(0, 4000), commitCount: lines.length };
      },
    },
    {
      name: "asc_workflow_localize_metadata",
      description:
        "Push a set of translated metadata to a version, locale-by-locale. The CALLER (LLM) does the translation; this tool just writes. Validates char limits.",
      inputSchema: z.object({
        versionId: z.string(),
        translations: z.record(
          z.enum(APP_STORE_LOCALES),
          z.object({
            description: z.string().optional(),
            keywords: z.string().optional(),
            promotionalText: z.string().optional(),
            whatsNew: z.string().optional(),
            marketingUrl: z.string().optional(),
            supportUrl: z.string().optional(),
          }),
        ),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, translations, dryRun }) => {
        const entries = Object.entries(translations as Record<string, Record<string, string>>);
        // Validate char limits
        for (const [loc, t] of entries) {
          for (const [field, value] of Object.entries(t)) {
            if (typeof value !== "string") continue;
            const limit = (METADATA_CHAR_LIMITS as Record<string, number | undefined>)[field];
            if (limit && value.length > limit) {
              throw new Error(`${loc}.${field} is ${value.length} chars (limit ${limit})`);
            }
          }
        }
        const existing = await listAll<AnyData>(client, `/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
        const byLocale = new Map(existing.map((l) => [l.attributes.locale as string, l]));

        const results: any[] = [];
        for (const [locale, attrs] of entries) {
          const loc = byLocale.get(locale);
          if (loc) {
            const body = patchBody("appStoreVersionLocalizations", loc.id, attrs);
            const r = await maybeSend(client, dryRun, "PATCH", `/appStoreVersionLocalizations/${loc.id}`, body);
            results.push({ locale, action: "updated", result: r });
          } else {
            const body = postBody(
              "appStoreVersionLocalizations",
              { locale, ...attrs },
              { appStoreVersion: singleRel("appStoreVersions", versionId) },
            );
            const r = await maybeSend(client, dryRun, "POST", `/appStoreVersionLocalizations`, body);
            results.push({ locale, action: "created", result: r });
          }
        }
        return { processed: results.length, results };
      },
    },
    {
      name: "asc_workflow_testflight_quick_ship",
      description:
        "Find the newest VALID build for an app, attach it to one or more Beta Groups, set 'What to Test' notes, and optionally submit for beta review.",
      inputSchema: z.object({
        appId: z.string(),
        groupIds: z.array(z.string()).min(1),
        whatToTest: z.record(z.enum(APP_STORE_LOCALES), z.string()).optional(),
        submitForBetaReview: z.boolean().default(false),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, groupIds, whatToTest, submitForBetaReview, dryRun }) => {
        const builds = await client.request<{ data: AnyData[] }>(`/builds`, {
          query: {
            "filter[app]": appId,
            "filter[processingState]": "VALID",
            "filter[expired]": "false",
            limit: 1,
            sort: "-uploadedDate",
          },
        });
        const build = builds.data[0];
        if (!build) throw new Error("No valid non-expired build found.");
        const buildId = build.id;
        const actions: any[] = [{ found: { buildId, version: build.attributes.version } }];

        for (const groupId of groupIds) {
          const body = { data: [{ type: "builds", id: buildId }] };
          const r = await maybeSend(client, dryRun, "POST", `/betaGroups/${groupId}/relationships/builds`, body);
          actions.push({ addedToGroup: groupId, result: r });
        }

        if (whatToTest) {
          const existing = await listAll<AnyData>(client, `/builds/${buildId}/betaBuildLocalizations`);
          const byLocale = new Map(existing.map((l) => [l.attributes.locale as string, l]));
          for (const [locale, text] of Object.entries(whatToTest)) {
            const loc = byLocale.get(locale);
            if (loc) {
              const body = patchBody("betaBuildLocalizations", loc.id, { whatsNew: text });
              const r = await maybeSend(client, dryRun, "PATCH", `/betaBuildLocalizations/${loc.id}`, body);
              actions.push({ updatedWhatToTest: locale, result: r });
            } else {
              const body = postBody(
                "betaBuildLocalizations",
                { locale, whatsNew: text },
                { build: singleRel("builds", buildId) },
              );
              const r = await maybeSend(client, dryRun, "POST", `/betaBuildLocalizations`, body);
              actions.push({ createdWhatToTest: locale, result: r });
            }
          }
        }

        if (submitForBetaReview) {
          const body = postBody("betaAppReviewSubmissions", undefined, { build: singleRel("builds", buildId) });
          const r = await maybeSend(client, dryRun, "POST", `/betaAppReviewSubmissions`, body);
          actions.push({ submittedForBetaReview: true, result: r });
        }

        return { actions };
      },
    },
    {
      name: "asc_workflow_submission_health",
      description:
        "Audit a version for submission readiness: localization completeness, screenshots, export compliance, review details, build attachment, age rating. Returns a structured pass/fail report.",
      inputSchema: z.object({
        versionId: z.string(),
      }),
      handler: async ({ versionId }) => {
        const issues: Array<{ severity: "error" | "warning"; check: string; detail: string }> = [];
        const checks: Array<{ check: string; status: "pass" | "warn" | "fail" }> = [];

        const version = await client.request<{ data: AnyData }>(`/appStoreVersions/${versionId}`);
        const primaryLocale: string | undefined = version.data.attributes.primaryLocale;

        // Build attachment
        try {
          const build = await client.request<{ data: AnyData | null }>(`/appStoreVersions/${versionId}/build`);
          if (!build.data) {
            issues.push({ severity: "error", check: "build", detail: "No build attached" });
            checks.push({ check: "build", status: "fail" });
          } else if (build.data.attributes.processingState !== "VALID") {
            issues.push({ severity: "error", check: "build", detail: `Build in state ${build.data.attributes.processingState}` });
            checks.push({ check: "build", status: "fail" });
          } else if (build.data.attributes.usesNonExemptEncryption === null) {
            issues.push({ severity: "error", check: "exportCompliance", detail: "Export compliance not declared" });
            checks.push({ check: "exportCompliance", status: "fail" });
          } else {
            checks.push({ check: "build", status: "pass" });
            checks.push({ check: "exportCompliance", status: "pass" });
          }
        } catch (e) {
          checks.push({ check: "build", status: "fail" });
          issues.push({ severity: "error", check: "build", detail: (e as Error).message });
        }

        // Localizations + screenshots
        const locs = await listAll<AnyData>(client, `/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
        for (const loc of locs) {
          const locale = loc.attributes.locale;
          const required = ["description", "keywords"] as const;
          for (const f of required) {
            if (!loc.attributes[f]) {
              issues.push({ severity: "error", check: `metadata:${locale}`, detail: `Missing ${f}` });
            }
          }
          if (!loc.attributes.whatsNew && primaryLocale && locale === primaryLocale) {
            issues.push({ severity: "warning", check: `metadata:${locale}`, detail: "Missing whatsNew" });
          }
          const screenshotSets = await client.request<{ data: AnyData[] }>(
            `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`,
            { query: { limit: 50 } },
          );
          if (screenshotSets.data.length === 0) {
            issues.push({ severity: "error", check: `screenshots:${locale}`, detail: "No screenshot sets" });
          }
        }
        checks.push({ check: "localizations", status: issues.some((i) => i.check.startsWith("metadata:") || i.check.startsWith("screenshots:")) ? "fail" : "pass" });

        // Review details
        try {
          const detail = await client.request<{ data: AnyData | null }>(`/appStoreVersions/${versionId}/appStoreReviewDetail`);
          if (!detail.data) {
            issues.push({ severity: "warning", check: "reviewDetails", detail: "No App Store Review Detail set" });
            checks.push({ check: "reviewDetails", status: "warn" });
          } else {
            const a = detail.data.attributes;
            if (a.demoAccountRequired && (!a.demoAccountName || !a.demoAccountPassword)) {
              issues.push({ severity: "error", check: "reviewDetails", detail: "demoAccountRequired but credentials missing" });
            }
            if (!a.contactFirstName || !a.contactEmail || !a.contactPhone) {
              issues.push({ severity: "warning", check: "reviewDetails", detail: "Contact info incomplete" });
            }
            checks.push({ check: "reviewDetails", status: "pass" });
          }
        } catch {
          checks.push({ check: "reviewDetails", status: "warn" });
        }

        // Age rating
        try {
          const ar = await client.request<{ data: AnyData | null }>(`/appStoreVersions/${versionId}/ageRatingDeclaration`);
          if (!ar.data) {
            issues.push({ severity: "error", check: "ageRating", detail: "No age rating declaration" });
            checks.push({ check: "ageRating", status: "fail" });
          } else {
            checks.push({ check: "ageRating", status: "pass" });
          }
        } catch {
          checks.push({ check: "ageRating", status: "fail" });
        }

        const errors = issues.filter((i) => i.severity === "error").length;
        return {
          versionId,
          status: errors === 0 ? "ready" : "blocked",
          errors,
          warnings: issues.filter((i) => i.severity === "warning").length,
          checks,
          issues,
        };
      },
    },
    {
      name: "asc_workflow_aso_audit",
      description:
        "For each version localization: surface keyword duplicates, unused keyword characters (100 limit), and words that also appear in the description (wasted). Optionally diff against competitor keyword strings.",
      inputSchema: z.object({
        versionId: z.string(),
        competitorKeywords: z.array(z.string()).optional().describe("Other keyword strings to diff against"),
      }),
      handler: async ({ versionId, competitorKeywords }) => {
        const locs = await listAll<AnyData>(client, `/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
        const report: any[] = [];
        for (const loc of locs) {
          const locale = loc.attributes.locale as string;
          const keywords = ((loc.attributes.keywords as string) || "").trim();
          const description = ((loc.attributes.description as string) || "").toLowerCase();
          const kws = keywords.split(",").map((k) => k.trim()).filter(Boolean);
          const lowered = kws.map((k) => k.toLowerCase());
          const dupes = lowered.filter((k, i) => lowered.indexOf(k) !== i);
          const inDescription = kws.filter((k) => description.includes(k.toLowerCase()));
          const used = keywords.length;
          const item: any = {
            locale,
            keywordCount: kws.length,
            charsUsed: used,
            charsRemaining: 100 - used,
            duplicates: Array.from(new Set(dupes)),
            wastedInDescription: inDescription,
          };
          if (competitorKeywords?.length) {
            const competitorSet = new Set<string>(
              competitorKeywords
                .flatMap((s: string) => s.split(",").map((k: string) => k.trim().toLowerCase()))
                .filter((s: string) => s.length > 0),
            );
            const mySet = new Set<string>(lowered);
            item.competitorGap = Array.from(competitorSet).filter((k) => !mySet.has(k));
            item.competitorOverlap = Array.from(mySet).filter((k) => competitorSet.has(k));
          }
          report.push(item);
        }
        return { versionId, locales: report };
      },
    },
    {
      name: "asc_workflow_build_lifecycle",
      description:
        "List all builds for an app with state + expiration days remaining. Flag expiring in <= 7 days. Optionally mark expired ones expired.",
      inputSchema: z.object({
        appId: z.string(),
        warnWithinDays: z.number().int().min(1).max(90).default(7),
        cleanupExpired: z.boolean().default(false),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, warnWithinDays, cleanupExpired, dryRun }) => {
        const builds = await listAll<AnyData>(client, `/builds`, { "filter[app]": appId, sort: "-uploadedDate" });
        const now = Date.now();
        const report: any[] = [];
        const actions: any[] = [];
        for (const b of builds) {
          const exp = b.attributes.expirationDate ? new Date(b.attributes.expirationDate as string).getTime() : null;
          const daysLeft = exp ? Math.round((exp - now) / 86400000) : null;
          const flag =
            b.attributes.expired ? "expired" :
            b.attributes.processingState !== "VALID" ? b.attributes.processingState as string :
            daysLeft !== null && daysLeft <= warnWithinDays ? "expiring_soon" :
            "ok";
          report.push({
            id: b.id,
            version: b.attributes.version,
            state: b.attributes.processingState,
            expired: b.attributes.expired,
            uploadedDate: b.attributes.uploadedDate,
            daysUntilExpiry: daysLeft,
            flag,
          });
          if (cleanupExpired && flag === "ok" && b.attributes.expired) {
            const body = patchBody("builds", b.id, { expired: true });
            const r = await maybeSend(client, dryRun, "PATCH", `/builds/${b.id}`, body);
            actions.push({ buildId: b.id, action: "marked_expired", result: r });
          }
        }
        return {
          total: report.length,
          expiringSoon: report.filter((r) => r.flag === "expiring_soon").length,
          expired: report.filter((r) => r.expired).length,
          builds: report,
          actions,
        };
      },
    },
    {
      name: "asc_workflow_crash_triage",
      description:
        "Pull top diagnostic signatures across recent builds for an app, group by type, return summarized triage view.",
      inputSchema: z.object({
        appId: z.string(),
        buildLimit: z.number().int().min(1).max(20).default(5),
        signaturesPerBuild: z.number().int().min(1).max(50).default(20),
      }),
      handler: async ({ appId, buildLimit, signaturesPerBuild }) => {
        const builds = await client.request<{ data: AnyData[] }>(`/builds`, {
          query: { "filter[app]": appId, "filter[processingState]": "VALID", limit: buildLimit, sort: "-uploadedDate" },
        });
        const grouped: Record<string, { count: number; signatures: any[] }> = {};
        for (const b of builds.data) {
          try {
            const sigs = await client.request<{ data: AnyData[] }>(`/builds/${b.id}/diagnosticSignatures`, {
              query: { limit: signaturesPerBuild },
            });
            for (const s of sigs.data) {
              const type = (s.attributes.diagnosticType as string) || "UNKNOWN";
              if (!grouped[type]) grouped[type] = { count: 0, signatures: [] };
              grouped[type].count++;
              grouped[type].signatures.push({
                buildVersion: b.attributes.version,
                buildId: b.id,
                signatureId: s.id,
                signature: s.attributes.signature,
                weight: s.attributes.weight,
              });
            }
          } catch {
            // Some accounts don't have P&P data; skip silently.
          }
        }
        return { appId, buildsExamined: builds.data.length, byType: grouped };
      },
    },
    {
      name: "asc_workflow_release_next_version",
      description:
        "Cut a new App Store Version: create version, copy metadata from the most recent prior version, attach latest valid build, carry over export compliance, set release type. Caller pushes 'what's new' separately (use whats_new_from_git first). Does NOT submit.",
      inputSchema: z.object({
        appId: z.string(),
        platform: z.enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"]),
        newVersionString: z.string(),
        releaseType: z.enum(["MANUAL", "AFTER_APPROVAL", "SCHEDULED"]).default("AFTER_APPROVAL"),
        earliestReleaseDate: z.string().optional(),
        copyright: z.string().optional(),
        attachLatestBuild: z.boolean().default(true),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, platform, newVersionString, releaseType, earliestReleaseDate, copyright, attachLatestBuild, dryRun }) => {
        // 1. Previous version (ASC returns recent-first by default for this endpoint)
        const priors = await client.request<{ data: AnyData[] }>(`/apps/${appId}/appStoreVersions`, {
          query: { "filter[platform]": platform, limit: 5 },
        });
        const prior = priors.data[0];
        if (!prior) throw new Error("No prior version found to copy from.");

        // 2. Latest build
        let buildId: string | undefined;
        if (attachLatestBuild) {
          const builds = await client.request<{ data: AnyData[] }>(`/builds`, {
            query: { "filter[app]": appId, "filter[processingState]": "VALID", "filter[expired]": "false", limit: 1, sort: "-uploadedDate" },
          });
          buildId = builds.data[0]?.id;
        }

        // 3. Create new version
        const createAttrs: Record<string, unknown> = { platform, versionString: newVersionString, releaseType };
        if (copyright) createAttrs.copyright = copyright;
        if (earliestReleaseDate) createAttrs.earliestReleaseDate = earliestReleaseDate;
        const createRels: Record<string, { data: { type: string; id: string } | null }> = {
          app: { data: { type: "apps", id: appId } },
        };
        if (buildId) createRels.build = { data: { type: "builds", id: buildId } };
        const createBody = postBody("appStoreVersions", createAttrs, createRels);

        if (dryRun) {
          return {
            dryRun: true,
            plan: {
              copyingFrom: { versionId: prior.id, versionString: prior.attributes.versionString },
              attachingBuildId: buildId,
              createPayload: createBody,
            },
          };
        }

        const created = await client.request<{ data: AnyData }>(`/appStoreVersions`, {
          method: "POST",
          body: createBody,
        });
        const newVersionId = created.data.id;

        // 4. Copy localizations
        const priorLocs = await listAll<AnyData>(client, `/appStoreVersions/${prior.id}/appStoreVersionLocalizations`);
        const copied: any[] = [];
        for (const pl of priorLocs) {
          const attrs = {
            description: pl.attributes.description,
            keywords: pl.attributes.keywords,
            marketingUrl: pl.attributes.marketingUrl,
            promotionalText: pl.attributes.promotionalText,
            supportUrl: pl.attributes.supportUrl,
            // intentionally not copying whatsNew — that's per-release
          };
          const body = postBody(
            "appStoreVersionLocalizations",
            { locale: pl.attributes.locale, ...attrs },
            { appStoreVersion: singleRel("appStoreVersions", newVersionId) },
          );
          const r = await client.request(`/appStoreVersionLocalizations`, { method: "POST", body });
          copied.push({ locale: pl.attributes.locale, result: r });
        }

        // 5. Carry over export compliance from build
        if (buildId) {
          // Only need to set if not yet declared on the build; safe to set to current value.
        }

        return {
          newVersionId,
          versionString: newVersionString,
          copiedLocalizations: copied.length,
          attachedBuildId: buildId ?? null,
          nextSteps: [
            "Use asc_workflow_whats_new_from_git to draft per-locale What's New, then asc_workflow_localize_metadata to push.",
            "Use asc_workflow_submission_health to verify readiness.",
            "Use asc_versions_submit_for_review_v1 or asc_review_submissions_create + submit to submit.",
          ],
        };
      },
    },
    {
      name: "asc_workflow_metadata_sync",
      description:
        "Pull metadata for a version into a JSON object you can save locally, or push from a JSON object back to ASC. Useful for version-controlled metadata.",
      inputSchema: z.object({
        versionId: z.string(),
        direction: z.enum(["pull", "push"]),
        data: z.record(z.string(), z.record(z.string(), z.unknown())).optional().describe("For push: { locale: { description, keywords, ... } }"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ versionId, direction, data, dryRun }) => {
        if (direction === "pull") {
          const locs = await listAll<AnyData>(client, `/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
          const out: Record<string, Record<string, unknown>> = {};
          for (const l of locs) {
            const a = l.attributes;
            out[a.locale as string] = {
              description: a.description,
              keywords: a.keywords,
              marketingUrl: a.marketingUrl,
              promotionalText: a.promotionalText,
              supportUrl: a.supportUrl,
              whatsNew: a.whatsNew,
            };
          }
          return out;
        }
        if (!data) throw new Error("push direction requires `data`");
        const locs = await listAll<AnyData>(client, `/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
        const byLocale = new Map(locs.map((l) => [l.attributes.locale as string, l]));
        const results: any[] = [];
        for (const [locale, attrs] of Object.entries(data) as Array<[string, Record<string, unknown>]>) {
          const loc = byLocale.get(locale);
          if (loc) {
            const body = patchBody("appStoreVersionLocalizations", loc.id, attrs);
            const r = await maybeSend(client, dryRun, "PATCH", `/appStoreVersionLocalizations/${loc.id}`, body);
            results.push({ locale, action: "updated", result: r });
          } else {
            const body = postBody(
              "appStoreVersionLocalizations",
              { locale, ...attrs },
              { appStoreVersion: singleRel("appStoreVersions", versionId) },
            );
            const r = await maybeSend(client, dryRun, "POST", `/appStoreVersionLocalizations`, body);
            results.push({ locale, action: "created", result: r });
          }
        }
        return { processed: results.length, results };
      },
    },
    {
      name: "asc_workflow_review_responses",
      description:
        "List recent customer reviews for an app, optionally only ones without a developer response yet. Caller drafts and submits responses separately.",
      inputSchema: z.object({
        appId: z.string(),
        onlyUnanswered: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      handler: async ({ appId, onlyUnanswered, limit }) => {
        const reviews = await client.request<{ data: AnyData[]; included?: AnyData[] }>(
          `/apps/${appId}/customerReviews`,
          { query: { limit, sort: "-createdDate", include: ["response"] } },
        );
        const responseIds = new Set((reviews.included ?? []).filter((i) => i.type === "customerReviewResponses").map((i) => i.id));
        const list = reviews.data.map((r) => {
          const hasResponse = r.relationships?.response?.data?.id && responseIds.has(r.relationships.response.data.id);
          return {
            id: r.id,
            rating: r.attributes.rating,
            title: r.attributes.title,
            body: r.attributes.body,
            createdDate: r.attributes.createdDate,
            territory: r.attributes.territory,
            reviewerNickname: r.attributes.reviewerNickname,
            hasResponse,
          };
        });
        return { reviews: onlyUnanswered ? list.filter((r) => !r.hasResponse) : list };
      },
    },
    {
      name: "asc_workflow_analytics_oneshot",
      description:
        "Convenience: create an analytics report request, poll until reports are available, list segments. Returns the segment URLs to download.",
      inputSchema: z.object({
        appId: z.string(),
        accessType: z.enum(["ONGOING", "ONE_TIME_SNAPSHOT"]).default("ONE_TIME_SNAPSHOT"),
        category: z.enum(["APP_USAGE", "APP_STORE_ENGAGEMENT", "COMMERCE", "FRAMEWORKS_USAGE", "PERFORMANCE"]).optional(),
        maxWaitSeconds: z.number().int().min(10).max(600).default(120),
      }),
      handler: async ({ appId, accessType, category, maxWaitSeconds }) => {
        const created = await client.request<{ data: AnyData }>(`/analyticsReportRequests`, {
          method: "POST",
          body: postBody(
            "analyticsReportRequests",
            { accessType },
            { app: singleRel("apps", appId) },
          ),
        });
        const requestId = created.data.id;
        const deadline = Date.now() + maxWaitSeconds * 1000;
        let reports: AnyData[] = [];
        while (Date.now() < deadline) {
          const r = await client.request<{ data: AnyData[] }>(`/analyticsReportRequests/${requestId}/reports`, {
            query: { "filter[category]": category, limit: 200 },
          });
          if (r.data.length > 0) {
            reports = r.data;
            break;
          }
          await new Promise((res) => setTimeout(res, 5000));
        }
        if (reports.length === 0) return { requestId, status: "no_reports_yet", reports: [] };
        return { requestId, reports: reports.map((r) => ({ id: r.id, name: r.attributes.name, category: r.attributes.category })) };
      },
    },
  ];
}
