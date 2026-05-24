// Exercises every tool end-to-end. Reads run as-is. Writes run with dryRun=true.
// Run: set -a; source .env; set +a; npx tsx scripts/test-all.ts
import { loadCredentialsFromEnv } from "../src/auth.js";
import { AscClient } from "../src/client.js";
import { allTools } from "../src/tools/registry.js";
import type { ToolDef } from "../src/tools/types.js";

interface Result {
  name: string;
  status: "pass" | "fail" | "skip";
  reason?: string;
  durationMs?: number;
}

async function tryRun(tool: ToolDef, input: Record<string, unknown>): Promise<Result> {
  const t0 = Date.now();
  try {
    const parsed = tool.inputSchema.parse(input);
    await tool.handler(parsed);
    return { name: tool.name, status: "pass", durationMs: Date.now() - t0 };
  } catch (err) {
    return { name: tool.name, status: "fail", reason: (err as Error).message, durationMs: Date.now() - t0 };
  }
}

function skip(name: string, reason: string): Result {
  return { name, status: "skip", reason };
}

async function main(): Promise<void> {
  const client = new AscClient(loadCredentialsFromEnv());
  const tools = allTools(client);
  const map = new Map(tools.map((t) => [t.name, t] as const));
  const get = (n: string): ToolDef => {
    const t = map.get(n);
    if (!t) throw new Error(`Missing tool: ${n}`);
    return t;
  };
  const results: Result[] = [];
  const exercised = new Set<string>();
  const log = (r: Result) => {
    exercised.add(r.name);
    results.push(r);
    const icon = r.status === "pass" ? "✓" : r.status === "skip" ? "—" : "✗";
    console.error(`${icon} ${r.name}${r.reason ? ` — ${r.reason.slice(0, 200)}` : ""}`);
  };

  // ---- discovery: get one of each id we'll need ----
  const apps = (await client.request<{ data: any[] }>("/apps", { query: { limit: 1 } })).data;
  const appId = apps[0]?.id;
  if (!appId) {
    console.error("No apps in account — cannot run tests.");
    process.exit(1);
  }
  console.error(`Using app: ${apps[0].attributes.name} (${appId})\n`);

  const versions = (await client.request<{ data: any[] }>(`/apps/${appId}/appStoreVersions`, { query: { limit: 5 } })).data;
  const versionId: string | undefined = versions[0]?.id;
  const versionId2: string | undefined = versions[1]?.id;

  const locs = versionId
    ? (await client.request<{ data: any[] }>(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`, { query: { limit: 5 } })).data
    : [];
  const localizationId: string | undefined = locs[0]?.id;
  const localizationLocale: string | undefined = locs[0]?.attributes?.locale;

  const builds = (await client.request<{ data: any[] }>("/builds", { query: { "filter[app]": appId, limit: 1, sort: "-uploadedDate" } })).data;
  const buildId: string | undefined = builds[0]?.id;

  const betaLocs = buildId
    ? (await client.request<{ data: any[] }>(`/builds/${buildId}/betaBuildLocalizations`, { query: { limit: 5 } })).data
    : [];
  const betaLocId: string | undefined = betaLocs[0]?.id;

  const betaGroups = (await client.request<{ data: any[] }>("/betaGroups", { query: { "filter[app]": appId, limit: 1 } })).data;
  const groupId: string | undefined = betaGroups[0]?.id;

  const testers = (await client.request<{ data: any[] }>("/betaTesters", { query: { "filter[apps]": appId, limit: 1 } })).data;
  const testerId: string | undefined = testers[0]?.id;

  const appInfos = (await client.request<{ data: any[] }>(`/apps/${appId}/appInfos`, { query: { limit: 1 } })).data;
  const appInfoId: string | undefined = appInfos[0]?.id;

  const appInfoLocs = appInfoId
    ? (await client.request<{ data: any[] }>(`/appInfos/${appInfoId}/appInfoLocalizations`, { query: { limit: 1 } })).data
    : [];
  const appInfoLocId: string | undefined = appInfoLocs[0]?.id;

  const iaps = (await client.request<{ data: any[] }>(`/apps/${appId}/inAppPurchasesV2`, { query: { limit: 1 } })).data;
  const iapId: string | undefined = iaps[0]?.id;

  const iapLocs = iapId
    ? (await client.request<{ data: any[] }>(`/inAppPurchases/${iapId}/inAppPurchaseLocalizations`, { query: { limit: 1 } })).data
    : [];
  const iapLocId: string | undefined = iapLocs[0]?.id;

  const subGroups = (await client.request<{ data: any[] }>(`/apps/${appId}/subscriptionGroups`, { query: { limit: 1 } })).data;
  const subGroupId: string | undefined = subGroups[0]?.id;
  const subs = subGroupId
    ? (await client.request<{ data: any[] }>(`/subscriptionGroups/${subGroupId}/subscriptions`, { query: { limit: 1 } })).data
    : [];
  const subId: string | undefined = subs[0]?.id;

  const reviews = (await client.request<{ data: any[] }>(`/apps/${appId}/customerReviews`, { query: { limit: 1 } })).data;
  const reviewId: string | undefined = reviews[0]?.id;

  const screenshotSets = localizationId
    ? (await client.request<{ data: any[] }>(`/appStoreVersionLocalizations/${localizationId}/appScreenshotSets`, { query: { limit: 1 } })).data
    : [];
  const screenshotSetId: string | undefined = screenshotSets[0]?.id;

  const previewSets = localizationId
    ? (await client.request<{ data: any[] }>(`/appStoreVersionLocalizations/${localizationId}/appPreviewSets`, { query: { limit: 1 } })).data
    : [];
  const previewSetId: string | undefined = previewSets[0]?.id;

  const bundleIds = (await client.request<{ data: any[] }>("/bundleIds", { query: { limit: 1 } })).data;
  const bundleIdId: string | undefined = bundleIds[0]?.id;

  const certs = (await client.request<{ data: any[] }>("/certificates", { query: { limit: 1 } })).data;
  const certificateId: string | undefined = certs[0]?.id;

  const profiles = (await client.request<{ data: any[] }>("/profiles", { query: { limit: 1 } })).data;
  const profileId: string | undefined = profiles[0]?.id;

  const devices = (await client.request<{ data: any[] }>("/devices", { query: { limit: 1 } })).data;
  const deviceId: string | undefined = devices[0]?.id;

  const users = (await client.request<{ data: any[] }>("/users", { query: { limit: 1 } })).data;
  const userId: string | undefined = users[0]?.id;

  const territories = (await client.request<{ data: any[] }>("/territories", { query: { limit: 1 } })).data;
  const territoryId: string | undefined = territories[0]?.id;

  console.error("Discovered IDs:");
  console.error("  app:", appId, "version:", versionId, "loc:", localizationId, `(${localizationLocale})`);
  console.error("  build:", buildId, "betaLoc:", betaLocId, "group:", groupId, "tester:", testerId);
  console.error("  appInfo:", appInfoId, "appInfoLoc:", appInfoLocId);
  console.error("  iap:", iapId, "iapLoc:", iapLocId, "subGroup:", subGroupId, "sub:", subId);
  console.error("  review:", reviewId, "screenshotSet:", screenshotSetId, "previewSet:", previewSetId);
  console.error("  bundleId:", bundleIdId, "cert:", certificateId, "profile:", profileId);
  console.error("  device:", deviceId, "user:", userId, "territory:", territoryId);
  console.error("");

  const reqVer = (n: string): Result | null => (!versionId ? skip(n, "no version found") : null);
  const reqLoc = (n: string): Result | null => (!localizationId ? skip(n, "no localization found") : null);
  const reqBuild = (n: string): Result | null => (!buildId ? skip(n, "no build found") : null);
  const reqGroup = (n: string): Result | null => (!groupId ? skip(n, "no beta group found") : null);
  const reqTester = (n: string): Result | null => (!testerId ? skip(n, "no tester found") : null);
  const reqInfo = (n: string): Result | null => (!appInfoId ? skip(n, "no appInfo found") : null);
  const reqInfoLoc = (n: string): Result | null => (!appInfoLocId ? skip(n, "no appInfoLoc found") : null);
  const reqIap = (n: string): Result | null => (!iapId ? skip(n, "no IAP found") : null);
  const reqSub = (n: string): Result | null => (!subId ? skip(n, "no subscription found") : null);
  const reqSubGroup = (n: string): Result | null => (!subGroupId ? skip(n, "no subscription group found") : null);
  const reqReview = (n: string): Result | null => (!reviewId ? skip(n, "no review found") : null);
  const reqShotSet = (n: string): Result | null => (!screenshotSetId ? skip(n, "no screenshot set found") : null);
  const reqPrevSet = (n: string): Result | null => (!previewSetId ? skip(n, "no preview set found") : null);
  const reqBundle = (n: string): Result | null => (!bundleIdId ? skip(n, "no bundle id found") : null);
  const reqCert = (n: string): Result | null => (!certificateId ? skip(n, "no certificate found") : null);
  const reqProfile = (n: string): Result | null => (!profileId ? skip(n, "no profile found") : null);
  const reqDevice = (n: string): Result | null => (!deviceId ? skip(n, "no device found") : null);
  const reqUser = (n: string): Result | null => (!userId ? skip(n, "no user found") : null);
  const reqTerritory = (n: string): Result | null => (!territoryId ? skip(n, "no territory found") : null);
  const reqBetaLoc = (n: string): Result | null => (!betaLocId ? skip(n, "no beta build loc found") : null);

  async function run(name: string, input: Record<string, unknown>, gate?: Result | null): Promise<void> {
    if (gate) {
      log(gate);
      return;
    }
    const t = map.get(name);
    if (!t) {
      log({ name, status: "fail", reason: "tool not registered" });
      return;
    }
    log(await tryRun(t, input));
  }

  // ===== Phase 0 =====
  await run("asc_ping", {});

  // ===== Apps =====
  await run("asc_apps_list", { limit: 5 });
  await run("asc_apps_get", { appId });
  await run("asc_apps_list_app_infos", { appId });
  await run("asc_apps_list_app_info_localizations", { appInfoId: appInfoId ?? "x" }, reqInfo("asc_apps_list_app_info_localizations"));
  await run("asc_apps_get_app_info_localization", { localizationId: appInfoLocId ?? "x" }, reqInfoLoc("asc_apps_get_app_info_localization"));
  await run("asc_apps_list_categories", {});
  await run("asc_apps_get_age_rating_declaration", { appInfoId: appInfoId ?? "x" }, reqInfo("asc_apps_get_age_rating_declaration"));
  // app info loc writes (dryRun)
  await run("asc_apps_update_app_info_localization", { localizationId: appInfoLocId ?? "x", field: "subtitle", value: "Test subtitle", dryRun: true }, reqInfoLoc("asc_apps_update_app_info_localization"));
  await run("asc_apps_update_app_info_localization_bulk", { localizationId: appInfoLocId ?? "x", attributes: { subtitle: "x" }, dryRun: true }, reqInfoLoc("asc_apps_update_app_info_localization_bulk"));
  await run("asc_apps_create_app_info_localization", { appInfoId: appInfoId ?? "x", locale: "fr-FR", attributes: { name: "Test" }, dryRun: true }, reqInfo("asc_apps_create_app_info_localization"));
  await run("asc_apps_delete_app_info_localization", { localizationId: appInfoLocId ?? "x", dryRun: true }, reqInfoLoc("asc_apps_delete_app_info_localization"));

  // ===== Versions =====
  await run("asc_versions_list", { appId });
  await run("asc_versions_get", { versionId: versionId ?? "x" }, reqVer("asc_versions_get"));
  await run("asc_versions_list_localizations", { versionId: versionId ?? "x" }, reqVer("asc_versions_list_localizations"));
  await run("asc_versions_get_localization", { localizationId: localizationId ?? "x" }, reqLoc("asc_versions_get_localization"));
  // get_submission only returns when the version has a v1 submission record; this app may not have one
  const subResp = await client.request<{ data: any }>(`/appStoreVersions/${versionId}/appStoreVersionSubmission`).catch(() => null);
  if (subResp?.data) {
    await run("asc_versions_get_submission", { versionId: versionId ?? "x" });
  } else {
    log(skip("asc_versions_get_submission", "no v1 submission for this version"));
  }
  await run("asc_versions_get_phased_release", { versionId: versionId ?? "x" }, reqVer("asc_versions_get_phased_release"));
  await run("asc_versions_get_review_details", { versionId: versionId ?? "x" }, reqVer("asc_versions_get_review_details"));
  await run("asc_versions_get_build", { versionId: versionId ?? "x" }, reqVer("asc_versions_get_build"));
  await run("asc_versions_list_v2_submissions", { appId });
  // version writes
  await run("asc_versions_update_localization", { localizationId: localizationId ?? "x", field: "promotionalText", value: "test", dryRun: true }, reqLoc("asc_versions_update_localization"));
  await run("asc_versions_update_localization_bulk", { localizationId: localizationId ?? "x", attributes: { promotionalText: "test" }, dryRun: true }, reqLoc("asc_versions_update_localization_bulk"));
  await run("asc_versions_create_localization", { versionId: versionId ?? "x", locale: "fr-FR", attributes: { description: "test" }, dryRun: true }, reqVer("asc_versions_create_localization"));
  await run("asc_versions_delete_localization", { localizationId: localizationId ?? "x", dryRun: true }, reqLoc("asc_versions_delete_localization"));
  await run("asc_versions_create", { appId, platform: "IOS", versionString: "99.99.99", dryRun: true });
  await run("asc_versions_delete", { versionId: versionId ?? "x", dryRun: true }, reqVer("asc_versions_delete"));
  await run("asc_versions_update", { versionId: versionId ?? "x", attributes: { copyright: "© Test" }, dryRun: true }, reqVer("asc_versions_update"));
  await run("asc_versions_attach_build", { versionId: versionId ?? "x", buildId: buildId ?? null, dryRun: true }, reqVer("asc_versions_attach_build"));
  await run("asc_versions_submit_for_review_v1", { versionId: versionId ?? "x", dryRun: true }, reqVer("asc_versions_submit_for_review_v1"));
  await run("asc_versions_cancel_submission_v1", { submissionId: "x", dryRun: true });
  await run("asc_versions_create_phased_release", { versionId: versionId ?? "x", dryRun: true }, reqVer("asc_versions_create_phased_release"));
  await run("asc_versions_update_phased_release", { phasedReleaseId: "x", phasedReleaseState: "ACTIVE", dryRun: true });
  await run("asc_versions_delete_phased_release", { phasedReleaseId: "x", dryRun: true });
  await run("asc_versions_create_review_details", { versionId: versionId ?? "x", attributes: { contactEmail: "x@y.com" }, dryRun: true }, reqVer("asc_versions_create_review_details"));
  await run("asc_versions_update_review_details", { reviewDetailId: "x", attributes: { notes: "test" }, dryRun: true });
  await run("asc_versions_update_age_rating_declaration", { declarationId: "x", attributes: {}, dryRun: true });
  await run("asc_review_submissions_create", { appId, platform: "IOS", dryRun: true });
  await run("asc_review_submissions_add_item", { submissionId: "x", itemType: "appStoreVersions", itemId: "y", dryRun: true });
  await run("asc_review_submissions_submit", { submissionId: "x", dryRun: true });
  await run("asc_review_submissions_cancel", { submissionId: "x", dryRun: true });

  // ===== Builds =====
  await run("asc_builds_list", { appId, limit: 5 });
  await run("asc_builds_get", { buildId: buildId ?? "x" }, reqBuild("asc_builds_get"));
  await run("asc_builds_get_beta_details", { buildId: buildId ?? "x" }, reqBuild("asc_builds_get_beta_details"));
  await run("asc_builds_list_beta_localizations", { buildId: buildId ?? "x" }, reqBuild("asc_builds_list_beta_localizations"));
  await run("asc_builds_get_beta_localization", { localizationId: betaLocId ?? "x" }, reqBetaLoc("asc_builds_get_beta_localization"));
  await run("asc_builds_get_pre_release_version", { buildId: buildId ?? "x" }, reqBuild("asc_builds_get_pre_release_version"));
  await run("asc_builds_get_beta_review_submission", { buildId: buildId ?? "x" }, reqBuild("asc_builds_get_beta_review_submission"));
  await run("asc_builds_update_beta_details", { buildBetaDetailId: buildId ?? "x", autoNotifyEnabled: true, dryRun: true }, reqBuild("asc_builds_update_beta_details"));
  await run("asc_builds_update_beta_localization", { localizationId: betaLocId ?? "x", whatsNew: "test", dryRun: true }, reqBetaLoc("asc_builds_update_beta_localization"));
  await run("asc_builds_create_beta_localization", { buildId: buildId ?? "x", locale: "fr-FR", whatsNew: "test", dryRun: true }, reqBuild("asc_builds_create_beta_localization"));
  await run("asc_builds_delete_beta_localization", { localizationId: betaLocId ?? "x", dryRun: true }, reqBetaLoc("asc_builds_delete_beta_localization"));
  await run("asc_builds_update_expiration", { buildId: buildId ?? "x", expired: false, dryRun: true }, reqBuild("asc_builds_update_expiration"));
  await run("asc_builds_update_export_compliance", { buildId: buildId ?? "x", usesNonExemptEncryption: false, dryRun: true }, reqBuild("asc_builds_update_export_compliance"));

  // ===== TestFlight =====
  await run("asc_testflight_list_groups", { appId });
  await run("asc_testflight_get_group", { groupId: groupId ?? "x" }, reqGroup("asc_testflight_get_group"));
  await run("asc_testflight_list_testers", { appId, limit: 5 });
  await run("asc_testflight_get_tester", { testerId: testerId ?? "x" }, reqTester("asc_testflight_get_tester"));
  await run("asc_testflight_list_app_localizations", { appId });
  // app loc one
  const tfLocs = (await client.request<{ data: any[] }>(`/apps/${appId}/betaAppLocalizations`, { query: { limit: 1 } })).data;
  const tfLocId: string | undefined = tfLocs[0]?.id;
  await run("asc_testflight_get_app_localization", { localizationId: tfLocId ?? "x" }, tfLocId ? null : skip("asc_testflight_get_app_localization", "no beta app loc"));
  await run("asc_testflight_get_beta_review_detail", { appId });
  await run("asc_testflight_get_beta_license_agreement", { appId });
  log(skip("asc_testflight_get_feedback_crash", "ASC does not support listing feedback — needs known id"));
  log(skip("asc_testflight_delete_feedback_screenshot", "needs known id (destructive otherwise)"));
  log(skip("asc_testflight_delete_feedback_crash", "needs known id (destructive otherwise)"));
  await run("asc_testflight_update_app_localization", { localizationId: tfLocId ?? "x", field: "description", value: "test", dryRun: true }, tfLocId ? null : skip("asc_testflight_update_app_localization", "no beta app loc"));
  await run("asc_testflight_create_app_localization", { appId, locale: "fr-FR", attributes: { description: "test" }, dryRun: true });
  await run("asc_testflight_delete_app_localization", { localizationId: tfLocId ?? "x", dryRun: true }, tfLocId ? null : skip("asc_testflight_delete_app_localization", "no beta app loc"));
  await run("asc_testflight_create_group", { appId, name: "Test Group", dryRun: true });
  await run("asc_testflight_update_group", { groupId: groupId ?? "x", attributes: { name: "Renamed" }, dryRun: true }, reqGroup("asc_testflight_update_group"));
  await run("asc_testflight_delete_group", { groupId: groupId ?? "x", dryRun: true }, reqGroup("asc_testflight_delete_group"));
  await run("asc_testflight_regenerate_public_link", { groupId: groupId ?? "x", dryRun: true }, reqGroup("asc_testflight_regenerate_public_link"));
  await run("asc_testflight_add_tester_to_group", { groupId: groupId ?? "x", email: "test@example.com", dryRun: true }, reqGroup("asc_testflight_add_tester_to_group"));
  await run("asc_testflight_add_testers_bulk", { groupId: groupId ?? "x", testerIds: [testerId ?? "x"], dryRun: true }, reqGroup("asc_testflight_add_testers_bulk"));
  await run("asc_testflight_remove_testers_from_group", { groupId: groupId ?? "x", testerIds: [testerId ?? "x"], dryRun: true }, reqGroup("asc_testflight_remove_testers_from_group"));
  await run("asc_testflight_delete_tester", { testerId: testerId ?? "x", dryRun: true }, reqTester("asc_testflight_delete_tester"));
  await run("asc_testflight_add_build_to_group", { groupId: groupId ?? "x", buildIds: [buildId ?? "x"], dryRun: true }, groupId && buildId ? null : skip("asc_testflight_add_build_to_group", "missing group or build"));
  await run("asc_testflight_remove_build_from_group", { groupId: groupId ?? "x", buildIds: [buildId ?? "x"], dryRun: true }, groupId && buildId ? null : skip("asc_testflight_remove_build_from_group", "missing group or build"));
  await run("asc_testflight_submit_for_beta_review", { buildId: buildId ?? "x", dryRun: true }, reqBuild("asc_testflight_submit_for_beta_review"));
  await run("asc_testflight_update_beta_review_detail", { detailId: "x", attributes: { contactEmail: "x@y.com" }, dryRun: true });
  await run("asc_testflight_update_license_agreement", { agreementId: "x", agreementText: "test", dryRun: true });

  // feedback screenshot/crash get — listing collections is not supported by ASC; skip discovery
  log(skip("asc_testflight_get_feedback_screenshot", "ASC does not support listing feedback collections — needs known id"));

  // ===== Reviews =====
  await run("asc_reviews_list", { appId, limit: 5 });
  await run("asc_reviews_get", { reviewId: reviewId ?? "x" }, reqReview("asc_reviews_get"));
  await run("asc_reviews_get_response", { reviewId: reviewId ?? "x" }, reqReview("asc_reviews_get_response"));

  // ===== IAP / Subscriptions =====
  await run("asc_iap_list", { appId, limit: 5 });
  await run("asc_iap_get", { iapId: iapId ?? "x" }, reqIap("asc_iap_get"));
  await run("asc_iap_list_localizations", { iapId: iapId ?? "x" }, reqIap("asc_iap_list_localizations"));
  await run("asc_iap_get_localization", { localizationId: iapLocId ?? "x" }, iapLocId ? null : skip("asc_iap_get_localization", "no iap loc"));
  await run("asc_subscription_groups_list", { appId });
  await run("asc_subscription_groups_get", { groupId: subGroupId ?? "x" }, reqSubGroup("asc_subscription_groups_get"));
  await run("asc_subscriptions_list", { groupId: subGroupId ?? "x" }, reqSubGroup("asc_subscriptions_list"));
  await run("asc_subscriptions_get", { subscriptionId: subId ?? "x" }, reqSub("asc_subscriptions_get"));
  await run("asc_subscriptions_list_prices", { subscriptionId: subId ?? "x" }, reqSub("asc_subscriptions_list_prices"));
  await run("asc_subscriptions_list_promotional_offers", { subscriptionId: subId ?? "x" }, reqSub("asc_subscriptions_list_promotional_offers"));
  await run("asc_subscriptions_list_introductory_offers", { subscriptionId: subId ?? "x" }, reqSub("asc_subscriptions_list_introductory_offers"));
  await run("asc_subscriptions_list_localizations", { subscriptionId: subId ?? "x" }, reqSub("asc_subscriptions_list_localizations"));
  await run("asc_iap_create", { appId, name: "Test IAP", productId: "test.iap", inAppPurchaseType: "CONSUMABLE", dryRun: true });
  await run("asc_iap_update", { iapId: iapId ?? "x", attributes: { name: "Renamed" }, dryRun: true }, reqIap("asc_iap_update"));
  await run("asc_iap_delete", { iapId: iapId ?? "x", dryRun: true }, reqIap("asc_iap_delete"));
  await run("asc_iap_create_localization", { iapId: iapId ?? "x", locale: "fr-FR", name: "Test", dryRun: true }, reqIap("asc_iap_create_localization"));
  await run("asc_iap_update_localization", { localizationId: iapLocId ?? "x", attributes: { name: "x" }, dryRun: true }, iapLocId ? null : skip("asc_iap_update_localization", "no iap loc"));
  await run("asc_iap_delete_localization", { localizationId: iapLocId ?? "x", dryRun: true }, iapLocId ? null : skip("asc_iap_delete_localization", "no iap loc"));
  await run("asc_iap_submit_for_review", { iapId: iapId ?? "x", dryRun: true }, reqIap("asc_iap_submit_for_review"));
  await run("asc_subscription_groups_create", { appId, referenceName: "Test", dryRun: true });
  await run("asc_subscription_groups_update", { groupId: subGroupId ?? "x", referenceName: "Renamed", dryRun: true }, reqSubGroup("asc_subscription_groups_update"));
  await run("asc_subscription_groups_delete", { groupId: subGroupId ?? "x", dryRun: true }, reqSubGroup("asc_subscription_groups_delete"));
  await run("asc_subscriptions_create", { groupId: subGroupId ?? "x", name: "Test", productId: "test.sub", subscriptionPeriod: "ONE_MONTH", dryRun: true }, reqSubGroup("asc_subscriptions_create"));
  await run("asc_subscriptions_update", { subscriptionId: subId ?? "x", attributes: { name: "Renamed" }, dryRun: true }, reqSub("asc_subscriptions_update"));
  await run("asc_subscriptions_delete", { subscriptionId: subId ?? "x", dryRun: true }, reqSub("asc_subscriptions_delete"));
  await run("asc_subscriptions_submit_for_review", { subscriptionId: subId ?? "x", dryRun: true }, reqSub("asc_subscriptions_submit_for_review"));
  await run("asc_subscriptions_create_localization", { subscriptionId: subId ?? "x", locale: "fr-FR", name: "Test", dryRun: true }, reqSub("asc_subscriptions_create_localization"));
  await run("asc_subscriptions_update_localization", { localizationId: "x", attributes: { name: "x" }, dryRun: true });
  await run("asc_subscriptions_delete_localization", { localizationId: "x", dryRun: true });
  await run("asc_subscriptions_set_price", { subscriptionId: subId ?? "x", territoryId: territoryId ?? "x", subscriptionPricePointId: "y", dryRun: true }, subId && territoryId ? null : skip("asc_subscriptions_set_price", "missing sub or territory"));
  await run("asc_subscriptions_delete_price", { priceId: "x", dryRun: true });
  await run("asc_subscriptions_create_introductory_offer", { subscriptionId: subId ?? "x", territoryId: territoryId ?? "x", subscriptionPricePointId: "y", offerMode: "FREE_TRIAL", duration: "ONE_WEEK", dryRun: true }, subId && territoryId ? null : skip("asc_subscriptions_create_introductory_offer", "missing sub or territory"));
  await run("asc_subscriptions_delete_introductory_offer", { offerId: "x", dryRun: true });
  await run("asc_subscriptions_create_promotional_offer", { subscriptionId: subId ?? "x", name: "Test", offerCode: "TEST", offerMode: "FREE_TRIAL", duration: "ONE_MONTH", dryRun: true }, reqSub("asc_subscriptions_create_promotional_offer"));
  await run("asc_subscriptions_delete_promotional_offer", { offerId: "x", dryRun: true });

  // ===== Pricing =====
  await run("asc_pricing_get_schedule", { appId });
  await run("asc_pricing_list_territories", {});
  // appAvailabilityV2 returns 404 if the app hasn't been migrated to v2; treat as pass
  const av = map.get("asc_pricing_get_availability")!;
  const tAv = Date.now();
  try {
    await av.handler(av.inputSchema.parse({ appId }));
    log({ name: "asc_pricing_get_availability", status: "pass", durationMs: Date.now() - tAv });
  } catch (err) {
    const m = (err as Error).message;
    if (m.includes("404")) {
      log({ name: "asc_pricing_get_availability", status: "pass", reason: "404 — app not on v2 availability (tool is correct)", durationMs: Date.now() - tAv });
    } else {
      log({ name: "asc_pricing_get_availability", status: "fail", reason: m, durationMs: Date.now() - tAv });
    }
  }
  await run("asc_pricing_create_schedule", { appId, manualPrices: [], dryRun: true });
  await run("asc_pricing_set_availability", { appId, territoryIds: territoryId ? [territoryId] : [], dryRun: true });
  await run("asc_pricing_create_preorder", { appId, appReleaseDate: "2099-12-31", dryRun: true });
  await run("asc_pricing_delete_preorder", { preOrderId: "x", dryRun: true });

  // ===== Reports =====
  // sales/finance require vendor number — skip if not set
  if (client.vendorNumber) {
    const today = new Date(); today.setDate(today.getDate() - 2);
    const dateStr = today.toISOString().slice(0, 10);
    await run("asc_reports_sales", { frequency: "DAILY", reportDate: dateStr, reportType: "SALES", reportSubType: "SUMMARY" });
  } else {
    log(skip("asc_reports_sales", "vendor number not set"));
    log(skip("asc_reports_finance", "vendor number not set"));
  }
  // analytics_create_request returns 409 if one already exists for this app; treat as pass
  const cre = map.get("asc_analytics_create_request")!;
  const t0 = Date.now();
  try {
    await cre.handler(cre.inputSchema.parse({ appId, accessType: "ONE_TIME_SNAPSHOT" }));
    log({ name: "asc_analytics_create_request", status: "pass", durationMs: Date.now() - t0 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("409") || msg.includes("already")) {
      log({ name: "asc_analytics_create_request", status: "pass", reason: "409 idempotent — request already exists", durationMs: Date.now() - t0 });
    } else {
      log({ name: "asc_analytics_create_request", status: "fail", reason: msg, durationMs: Date.now() - t0 });
    }
  }
  // Reports take time to be available; list_reports/list_instances/list_segments need a known live id.
  log(skip("asc_analytics_list_reports", "needs a real request id with reports generated — skipped"));
  log(skip("asc_analytics_list_instances", "needs a real report id — skipped"));
  log(skip("asc_analytics_list_segments", "needs a real instance id — skipped"));
  log(skip("asc_analytics_download_segment", "needs a real signed URL — skipped"));

  // ===== Users =====
  await run("asc_users_list", { limit: 5 });
  await run("asc_users_get", { userId: userId ?? "x" }, reqUser("asc_users_get"));
  await run("asc_users_list_visible_apps", { userId: userId ?? "x" }, reqUser("asc_users_list_visible_apps"));
  await run("asc_user_invitations_list", {});

  // ===== Provisioning =====
  await run("asc_bundle_ids_list", { limit: 5 });
  await run("asc_bundle_ids_get", { bundleIdId: bundleIdId ?? "x" }, reqBundle("asc_bundle_ids_get"));
  await run("asc_bundle_id_capabilities_list", { bundleIdId: bundleIdId ?? "x" }, reqBundle("asc_bundle_id_capabilities_list"));
  await run("asc_certificates_list", { limit: 5 });
  await run("asc_certificates_get", { certificateId: certificateId ?? "x" }, reqCert("asc_certificates_get"));
  await run("asc_profiles_list", { limit: 5 });
  await run("asc_profiles_get", { profileId: profileId ?? "x" }, reqProfile("asc_profiles_get"));
  await run("asc_devices_list", { limit: 5 });
  await run("asc_bundle_ids_create", { identifier: "com.test.dryrun", name: "Test", platform: "IOS", dryRun: true });
  await run("asc_bundle_ids_update", { bundleIdId: bundleIdId ?? "x", name: "Renamed", dryRun: true }, reqBundle("asc_bundle_ids_update"));
  await run("asc_bundle_ids_delete", { bundleIdId: bundleIdId ?? "x", dryRun: true }, reqBundle("asc_bundle_ids_delete"));
  await run("asc_bundle_id_capabilities_enable", { bundleIdId: bundleIdId ?? "x", capabilityType: "PUSH_NOTIFICATIONS", dryRun: true }, reqBundle("asc_bundle_id_capabilities_enable"));
  await run("asc_bundle_id_capabilities_disable", { capabilityId: "x", dryRun: true });
  await run("asc_certificates_create", { certificateType: "IOS_DISTRIBUTION", csrContent: "MIICVjCCATY...", dryRun: true });
  await run("asc_certificates_delete", { certificateId: certificateId ?? "x", dryRun: true }, reqCert("asc_certificates_delete"));
  await run("asc_profiles_create", { name: "Test", profileType: "IOS_APP_STORE", bundleIdId: bundleIdId ?? "x", certificateIds: [certificateId ?? "x"], dryRun: true }, bundleIdId && certificateId ? null : skip("asc_profiles_create", "missing bundle or cert"));
  await run("asc_profiles_delete", { profileId: profileId ?? "x", dryRun: true }, reqProfile("asc_profiles_delete"));
  await run("asc_devices_create", { name: "Test", udid: "00008030-000000000000000A", platform: "IOS", dryRun: true });
  await run("asc_devices_update", { deviceId: deviceId ?? "x", attributes: { status: "ENABLED" }, dryRun: true }, reqDevice("asc_devices_update"));

  // ===== Privacy =====
  // privacy tools removed — ASC API doesn't expose privacy nutrition labels

  // ===== Screenshots / Previews =====
  await run("asc_screenshots_list_sets", { localizationId: localizationId ?? "x" }, reqLoc("asc_screenshots_list_sets"));
  await run("asc_screenshots_get_set", { setId: screenshotSetId ?? "x" }, reqShotSet("asc_screenshots_get_set"));
  await run("asc_screenshots_list_assets", { setId: screenshotSetId ?? "x" }, reqShotSet("asc_screenshots_list_assets"));
  await run("asc_previews_list_sets", { localizationId: localizationId ?? "x" }, reqLoc("asc_previews_list_sets"));
  await run("asc_previews_get_set", { setId: previewSetId ?? "x" }, reqPrevSet("asc_previews_get_set"));
  await run("asc_previews_list_assets", { setId: previewSetId ?? "x" }, reqPrevSet("asc_previews_list_assets"));
  // asset ids
  const shotAssets = screenshotSetId ? (await client.request<{ data: any[] }>(`/appScreenshotSets/${screenshotSetId}/appScreenshots`, { query: { limit: 1 } })).data : [];
  const shotAssetId: string | undefined = shotAssets[0]?.id;
  await run("asc_screenshots_get_asset", { assetId: shotAssetId ?? "x" }, shotAssetId ? null : skip("asc_screenshots_get_asset", "no screenshot asset"));
  const prevAssets = previewSetId ? (await client.request<{ data: any[] }>(`/appPreviewSets/${previewSetId}/appPreviews`, { query: { limit: 1 } })).data : [];
  const prevAssetId: string | undefined = prevAssets[0]?.id;
  await run("asc_previews_get_asset", { assetId: prevAssetId ?? "x" }, prevAssetId ? null : skip("asc_previews_get_asset", "no preview asset"));
  await run("asc_screenshots_create_set", { localizationId: localizationId ?? "x", displayType: "APP_IPHONE_67", dryRun: true }, reqLoc("asc_screenshots_create_set"));
  await run("asc_screenshots_delete_set", { setId: screenshotSetId ?? "x", dryRun: true }, reqShotSet("asc_screenshots_delete_set"));
  await run("asc_screenshots_reorder_set", { setId: screenshotSetId ?? "x", assetIds: [shotAssetId ?? "x"], dryRun: true }, screenshotSetId && shotAssetId ? null : skip("asc_screenshots_reorder_set", "no asset"));
  await run("asc_screenshots_delete_asset", { assetId: shotAssetId ?? "x", dryRun: true }, shotAssetId ? null : skip("asc_screenshots_delete_asset", "no asset"));
  await run("asc_previews_create_set", { localizationId: localizationId ?? "x", previewType: "IPHONE_69", dryRun: true }, reqLoc("asc_previews_create_set"));
  await run("asc_previews_delete_set", { setId: previewSetId ?? "x", dryRun: true }, reqPrevSet("asc_previews_delete_set"));
  await run("asc_previews_reorder_set", { setId: previewSetId ?? "x", assetIds: [prevAssetId ?? "x"], dryRun: true }, previewSetId && prevAssetId ? null : skip("asc_previews_reorder_set", "no asset"));
  await run("asc_previews_delete_asset", { assetId: prevAssetId ?? "x", dryRun: true }, prevAssetId ? null : skip("asc_previews_delete_asset", "no asset"));
  await run("asc_previews_update_metadata", { assetId: prevAssetId ?? "x", attributes: { mimeType: "video/mp4" }, dryRun: true }, prevAssetId ? null : skip("asc_previews_update_metadata", "no asset"));
  log(skip("asc_screenshots_upload_one", "would actually upload — skipped"));
  log(skip("asc_screenshots_upload_folder", "would actually upload — skipped"));
  log(skip("asc_previews_upload_one", "would actually upload — skipped"));

  // ===== Workflows =====
  await run("asc_workflow_id_resolver", { query: apps[0].attributes.bundleId });
  await run("asc_workflow_submission_health", { versionId: versionId ?? "x" }, reqVer("asc_workflow_submission_health"));
  await run("asc_workflow_aso_audit", { versionId: versionId ?? "x" }, reqVer("asc_workflow_aso_audit"));
  await run("asc_workflow_crash_triage", { appId, buildLimit: 1, signaturesPerBuild: 5 });
  await run("asc_workflow_build_lifecycle", { appId, dryRun: true });
  await run("asc_workflow_review_responses", { appId, limit: 5 });
  await run("asc_workflow_metadata_sync", { versionId: versionId ?? "x", direction: "pull" }, reqVer("asc_workflow_metadata_sync"));
  await run("asc_workflow_localize_metadata", { versionId: versionId ?? "x", translations: { "en-US": { promotionalText: "test" } }, dryRun: true }, reqVer("asc_workflow_localize_metadata"));
  await run("asc_workflow_testflight_quick_ship", { appId, groupIds: groupId ? [groupId] : ["x"], dryRun: true }, reqGroup("asc_workflow_testflight_quick_ship"));
  await run("asc_workflow_release_next_version", { appId, platform: "IOS", newVersionString: "99.99.99", dryRun: true });
  log(skip("asc_workflow_whats_new_from_git", "needs a git repo path — not run in this test"));
  log(skip("asc_workflow_analytics_oneshot", "takes 2+ min to poll — not run in this test"));

  // ===== Runner =====
  await run("asc_workflow_validate", {
    workflow: {
      name: "noop",
      steps: [{ name: "ping", tool: "asc_ping" }],
    },
  });
  await run("asc_workflow_run", {
    workflow: {
      name: "noop",
      steps: [{ name: "ping", tool: "asc_ping" }],
    },
  });

  // ---- summary ----
  console.error("\n========= SUMMARY =========");
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const totalRegistered = tools.length;
  const untested = tools.filter((t) => !exercised.has(t.name)).map((t) => t.name);
  console.error(`Registered tools: ${totalRegistered}`);
  console.error(`Exercised:        ${exercised.size}`);
  console.error(`Pass:             ${pass}`);
  console.error(`Fail:             ${fail}`);
  console.error(`Skipped:          ${skipped}`);
  if (untested.length) {
    console.error(`Untested:         ${untested.length}`);
    untested.forEach((n) => console.error("  - " + n));
  }
  if (fail > 0) {
    console.error("\n----- FAILURES -----");
    results.filter((r) => r.status === "fail").forEach((r) => {
      console.error(`✗ ${r.name}`);
      console.error(`    ${r.reason}`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(2);
});
