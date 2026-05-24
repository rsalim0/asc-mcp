import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";
import { DEFAULT_FIELDS } from "../lib/projections.js";
import { patchBody, postBody, singleRel, maybeSend } from "../lib/jsonapi-write.js";
import { APP_STORE_LOCALES } from "../lib/locales.js";

const IAP_TYPES = ["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"] as const;
const SUBSCRIPTION_PERIODS = ["ONE_WEEK", "ONE_MONTH", "TWO_MONTHS", "THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"] as const;
const FAMILY_SHARABLE = z.boolean();

export function iapTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_iap_list",
      description: "List In-App Purchases for an app (v2 API — includes consumables, non-consumables, non-renewing subs).",
      inputSchema: z.object({
        appId: z.string(),
        state: z
          .string()
          .optional()
          .describe("e.g. MISSING_METADATA, READY_TO_SUBMIT, IN_REVIEW, APPROVED, DEVELOPER_REMOVED_FROM_SALE"),
        type: z
          .enum(["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"])
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, state, type, limit }) =>
        client.request(`/apps/${appId}/inAppPurchasesV2`, {
          query: {
            "filter[state]": state,
            "filter[inAppPurchaseType]": type,
            limit: limit ?? 50,
            "fields[inAppPurchases]": DEFAULT_FIELDS.inAppPurchases,
          },
        }),
    },
    {
      name: "asc_iap_get",
      description: "Get one IAP by id.",
      inputSchema: z.object({
        iapId: z.string(),
        include: z
          .array(z.string())
          .optional()
          .describe("e.g. inAppPurchaseLocalizations, pricePoints, content, appStoreReviewScreenshot, promotedPurchase"),
      }),
      handler: async ({ iapId, include }) =>
        client.request(`/inAppPurchases/${iapId}`, { query: { include } }),
    },
    {
      name: "asc_iap_list_localizations",
      description: "List per-locale name + description for an IAP.",
      inputSchema: z.object({
        iapId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ iapId, limit }) =>
        client.request(`/inAppPurchases/${iapId}/inAppPurchaseLocalizations`, {
          query: { limit: limit ?? 50 },
        }),
    },
    {
      name: "asc_iap_get_localization",
      description: "Get one IAP localization by id.",
      inputSchema: z.object({ localizationId: z.string() }),
      handler: async ({ localizationId }) =>
        client.request(`/inAppPurchaseLocalizations/${localizationId}`),
    },
    {
      name: "asc_subscription_groups_list",
      description: "List subscription groups for an app.",
      inputSchema: z.object({
        appId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ appId, limit }) =>
        client.request(`/apps/${appId}/subscriptionGroups`, {
          query: {
            limit: limit ?? 50,
            "fields[subscriptionGroups]": DEFAULT_FIELDS.subscriptionGroups,
          },
        }),
    },
    {
      name: "asc_subscription_groups_get",
      description: "Get one subscription group by id.",
      inputSchema: z.object({
        groupId: z.string(),
        include: z.array(z.string()).optional().describe("e.g. subscriptions, subscriptionGroupLocalizations"),
      }),
      handler: async ({ groupId, include }) =>
        client.request(`/subscriptionGroups/${groupId}`, { query: { include } }),
    },
    {
      name: "asc_subscriptions_list",
      description: "List subscriptions in a group.",
      inputSchema: z.object({
        groupId: z.string(),
        state: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ groupId, state, limit }) =>
        client.request(`/subscriptionGroups/${groupId}/subscriptions`, {
          query: {
            "filter[state]": state,
            limit: limit ?? 50,
            "fields[subscriptions]": DEFAULT_FIELDS.subscriptions,
          },
        }),
    },
    {
      name: "asc_subscriptions_get",
      description: "Get one subscription by id.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        include: z
          .array(z.string())
          .optional()
          .describe("e.g. prices, subscriptionLocalizations, introductoryOffers, promotionalOffers, promotedPurchase, appStoreReviewScreenshot"),
      }),
      handler: async ({ subscriptionId, include }) =>
        client.request(`/subscriptions/${subscriptionId}`, { query: { include } }),
    },
    {
      name: "asc_subscriptions_list_prices",
      description: "List subscription prices (per territory) for a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ subscriptionId, limit }) =>
        client.request(`/subscriptions/${subscriptionId}/prices`, {
          query: { limit: limit ?? 100 },
        }),
    },
    {
      name: "asc_subscriptions_list_promotional_offers",
      description: "List promotional offers for a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ subscriptionId, limit }) =>
        client.request(`/subscriptions/${subscriptionId}/promotionalOffers`, {
          query: { limit: limit ?? 50 },
        }),
    },
    {
      name: "asc_subscriptions_list_introductory_offers",
      description: "List introductory offers for a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ subscriptionId, limit }) =>
        client.request(`/subscriptions/${subscriptionId}/introductoryOffers`, {
          query: { limit: limit ?? 50 },
        }),
    },
    {
      name: "asc_subscriptions_list_localizations",
      description: "List per-locale name + description for a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: async ({ subscriptionId, limit }) =>
        client.request(`/subscriptions/${subscriptionId}/subscriptionLocalizations`, {
          query: { limit: limit ?? 50 },
        }),
    },

    // ---- WRITES: Phase 5 (IAP) ----
    {
      name: "asc_iap_create",
      description: "Create a non-subscription IAP (consumable, non-consumable, non-renewing).",
      inputSchema: z.object({
        appId: z.string(),
        name: z.string().describe("Reference name (max 64)"),
        productId: z.string().describe("Product ID (e.g. com.app.unlock)"),
        inAppPurchaseType: z.enum(IAP_TYPES),
        familySharable: FAMILY_SHARABLE.optional(),
        reviewNote: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, dryRun, ...attrs }) => {
        const body = postBody(
          "inAppPurchases",
          attrs,
          { app: singleRel("apps", appId) },
        );
        return maybeSend(client, dryRun, "POST", `/inAppPurchases`, body);
      },
    },
    {
      name: "asc_iap_update",
      description: "Update IAP attributes (name, familySharable, reviewNote, etc.).",
      inputSchema: z.object({
        iapId: z.string(),
        attributes: z
          .object({
            name: z.string().optional(),
            familySharable: z.boolean().optional(),
            reviewNote: z.string().nullable().optional(),
            availableInAllTerritories: z.boolean().optional(),
          })
          .refine((a) => Object.keys(a).length > 0),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ iapId, attributes, dryRun }) => {
        const body = patchBody("inAppPurchases", iapId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/inAppPurchases/${iapId}`, body);
      },
    },
    {
      name: "asc_iap_delete",
      description: "Delete an IAP (only while in editable state).",
      inputSchema: z.object({
        iapId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ iapId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/inAppPurchases/${iapId}`),
    },
    {
      name: "asc_iap_create_localization",
      description: "Add a locale to an IAP with name + description.",
      inputSchema: z.object({
        iapId: z.string(),
        locale: z.enum(APP_STORE_LOCALES),
        name: z.string(),
        description: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ iapId, locale, name, description, dryRun }) => {
        const body = postBody(
          "inAppPurchaseLocalizations",
          { locale, name, description },
          { inAppPurchaseV2: singleRel("inAppPurchases", iapId) },
        );
        return maybeSend(client, dryRun, "POST", `/inAppPurchaseLocalizations`, body);
      },
    },
    {
      name: "asc_iap_update_localization",
      description: "Update IAP localization name/description.",
      inputSchema: z.object({
        localizationId: z.string(),
        attributes: z
          .object({
            name: z.string().optional(),
            description: z.string().nullable().optional(),
          })
          .refine((a) => Object.keys(a).length > 0),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, attributes, dryRun }) => {
        const body = patchBody("inAppPurchaseLocalizations", localizationId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/inAppPurchaseLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_iap_delete_localization",
      description: "Delete an IAP localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/inAppPurchaseLocalizations/${localizationId}`),
    },
    {
      name: "asc_iap_submit_for_review",
      description: "Submit an IAP for review (v2 — uses inAppPurchaseSubmissions).",
      inputSchema: z.object({
        iapId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ iapId, dryRun }) => {
        const body = postBody(
          "inAppPurchaseSubmissions",
          undefined,
          { inAppPurchaseV2: singleRel("inAppPurchases", iapId) },
        );
        return maybeSend(client, dryRun, "POST", `/inAppPurchaseSubmissions`, body);
      },
    },

    // ---- WRITES: Phase 5 (Subscription groups) ----
    {
      name: "asc_subscription_groups_create",
      description: "Create a subscription group.",
      inputSchema: z.object({
        appId: z.string(),
        referenceName: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ appId, referenceName, dryRun }) => {
        const body = postBody(
          "subscriptionGroups",
          { referenceName },
          { app: singleRel("apps", appId) },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptionGroups`, body);
      },
    },
    {
      name: "asc_subscription_groups_update",
      description: "Update a subscription group's reference name.",
      inputSchema: z.object({
        groupId: z.string(),
        referenceName: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, referenceName, dryRun }) => {
        const body = patchBody("subscriptionGroups", groupId, { referenceName });
        return maybeSend(client, dryRun, "PATCH", `/subscriptionGroups/${groupId}`, body);
      },
    },
    {
      name: "asc_subscription_groups_delete",
      description: "Delete a subscription group (must be empty).",
      inputSchema: z.object({
        groupId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/subscriptionGroups/${groupId}`),
    },

    // ---- WRITES: Phase 5 (Subscriptions) ----
    {
      name: "asc_subscriptions_create",
      description: "Create a subscription in a group.",
      inputSchema: z.object({
        groupId: z.string(),
        name: z.string().describe("Reference name"),
        productId: z.string(),
        subscriptionPeriod: z.enum(SUBSCRIPTION_PERIODS),
        familySharable: FAMILY_SHARABLE.optional(),
        groupLevel: z.number().int().min(1).optional(),
        availableInAllTerritories: z.boolean().optional(),
        reviewNote: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ groupId, dryRun, ...attrs }) => {
        const body = postBody(
          "subscriptions",
          attrs,
          { group: singleRel("subscriptionGroups", groupId) },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptions`, body);
      },
    },
    {
      name: "asc_subscriptions_update",
      description: "Update subscription attributes.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        attributes: z
          .object({
            name: z.string().optional(),
            familySharable: z.boolean().optional(),
            availableInAllTerritories: z.boolean().optional(),
            groupLevel: z.number().int().min(1).optional(),
            subscriptionPeriod: z.enum(SUBSCRIPTION_PERIODS).optional(),
            reviewNote: z.string().nullable().optional(),
          })
          .refine((a) => Object.keys(a).length > 0),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, attributes, dryRun }) => {
        const body = patchBody("subscriptions", subscriptionId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/subscriptions/${subscriptionId}`, body);
      },
    },
    {
      name: "asc_subscriptions_delete",
      description: "Delete a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/subscriptions/${subscriptionId}`),
    },
    {
      name: "asc_subscriptions_submit_for_review",
      description: "Submit a subscription for review.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, dryRun }) => {
        const body = postBody(
          "subscriptionSubmissions",
          undefined,
          { subscription: singleRel("subscriptions", subscriptionId) },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptionSubmissions`, body);
      },
    },

    // ---- WRITES: Phase 5 (Subscription localizations, prices, offers) ----
    {
      name: "asc_subscriptions_create_localization",
      description: "Add a locale to a subscription with name + description.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        locale: z.enum(APP_STORE_LOCALES),
        name: z.string(),
        description: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, locale, name, description, dryRun }) => {
        const body = postBody(
          "subscriptionLocalizations",
          { locale, name, description },
          { subscription: singleRel("subscriptions", subscriptionId) },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptionLocalizations`, body);
      },
    },
    {
      name: "asc_subscriptions_update_localization",
      description: "Update a subscription localization name/description.",
      inputSchema: z.object({
        localizationId: z.string(),
        attributes: z
          .object({
            name: z.string().optional(),
            description: z.string().nullable().optional(),
          })
          .refine((a) => Object.keys(a).length > 0),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, attributes, dryRun }) => {
        const body = patchBody("subscriptionLocalizations", localizationId, attributes);
        return maybeSend(client, dryRun, "PATCH", `/subscriptionLocalizations/${localizationId}`, body);
      },
    },
    {
      name: "asc_subscriptions_delete_localization",
      description: "Delete a subscription localization.",
      inputSchema: z.object({
        localizationId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ localizationId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/subscriptionLocalizations/${localizationId}`),
    },
    {
      name: "asc_subscriptions_set_price",
      description: "Set a subscription price for a territory (creates a SubscriptionPrice).",
      inputSchema: z.object({
        subscriptionId: z.string(),
        territoryId: z.string().describe("Territory code, e.g. USA"),
        subscriptionPricePointId: z.string().describe("Apple-defined price point id"),
        preserveCurrentPrice: z.boolean().optional(),
        startDate: z.string().optional().describe("ISO date"),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, territoryId, subscriptionPricePointId, preserveCurrentPrice, startDate, dryRun }) => {
        const attrs: Record<string, unknown> = {};
        if (preserveCurrentPrice !== undefined) attrs.preserveCurrentPrice = preserveCurrentPrice;
        if (startDate !== undefined) attrs.startDate = startDate;
        const body = postBody(
          "subscriptionPrices",
          attrs,
          {
            subscription: singleRel("subscriptions", subscriptionId),
            territory: singleRel("territories", territoryId),
            subscriptionPricePoint: singleRel("subscriptionPricePoints", subscriptionPricePointId),
          },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptionPrices`, body);
      },
    },
    {
      name: "asc_subscriptions_delete_price",
      description: "Delete a subscription price.",
      inputSchema: z.object({
        priceId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ priceId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/subscriptionPrices/${priceId}`),
    },
    {
      name: "asc_subscriptions_create_introductory_offer",
      description: "Create an introductory offer for a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        territoryId: z.string(),
        subscriptionPricePointId: z.string(),
        offerMode: z.enum(["PAY_AS_YOU_GO", "PAY_UP_FRONT", "FREE_TRIAL"]),
        duration: z.enum(["ONE_DAY", "THREE_DAYS", "ONE_WEEK", "TWO_WEEKS", "ONE_MONTH", "TWO_MONTHS", "THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"]),
        numberOfPeriods: z.number().int().min(1).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, territoryId, subscriptionPricePointId, offerMode, duration, numberOfPeriods, startDate, endDate, dryRun }) => {
        const attrs: Record<string, unknown> = { offerMode, duration };
        if (numberOfPeriods !== undefined) attrs.numberOfPeriods = numberOfPeriods;
        if (startDate !== undefined) attrs.startDate = startDate;
        if (endDate !== undefined) attrs.endDate = endDate;
        const body = postBody(
          "subscriptionIntroductoryOffers",
          attrs,
          {
            subscription: singleRel("subscriptions", subscriptionId),
            territory: singleRel("territories", territoryId),
            subscriptionPricePoint: singleRel("subscriptionPricePoints", subscriptionPricePointId),
          },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptionIntroductoryOffers`, body);
      },
    },
    {
      name: "asc_subscriptions_delete_introductory_offer",
      description: "Delete an introductory offer.",
      inputSchema: z.object({
        offerId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ offerId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/subscriptionIntroductoryOffers/${offerId}`),
    },
    {
      name: "asc_subscriptions_create_promotional_offer",
      description: "Create a promotional offer for a subscription.",
      inputSchema: z.object({
        subscriptionId: z.string(),
        name: z.string(),
        offerCode: z.string().describe("Unique code"),
        offerMode: z.enum(["PAY_AS_YOU_GO", "PAY_UP_FRONT", "FREE_TRIAL"]),
        duration: z.string().describe("e.g. ONE_MONTH"),
        numberOfPeriods: z.number().int().min(1).optional(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ subscriptionId, dryRun, ...attrs }) => {
        const body = postBody(
          "subscriptionPromotionalOffers",
          attrs,
          { subscription: singleRel("subscriptions", subscriptionId) },
        );
        return maybeSend(client, dryRun, "POST", `/subscriptionPromotionalOffers`, body);
      },
    },
    {
      name: "asc_subscriptions_delete_promotional_offer",
      description: "Delete a promotional offer.",
      inputSchema: z.object({
        offerId: z.string(),
        dryRun: z.boolean().optional(),
      }),
      handler: async ({ offerId, dryRun }) =>
        maybeSend(client, dryRun, "DELETE", `/subscriptionPromotionalOffers/${offerId}`),
    },
  ];
}
