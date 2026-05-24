/**
 * Sparse fieldset projections per ASC resource type. Each tool list-call can
 * include `fields[<type>]=…` to keep responses small and model-readable.
 *
 * Populate as resources are added in Phase 1. Tools can override with a custom
 * `fields` arg if they need more.
 */
export const DEFAULT_FIELDS: Record<string, string[]> = {
  apps: ["name", "bundleId", "sku", "primaryLocale"],
  appStoreVersions: [
    "platform",
    "versionString",
    "appStoreState",
    "releaseType",
    "createdDate",
  ],
  appStoreVersionLocalizations: [
    "locale",
    "description",
    "keywords",
    "marketingUrl",
    "promotionalText",
    "supportUrl",
    "whatsNew",
  ],
  builds: [
    "version",
    "uploadedDate",
    "expirationDate",
    "expired",
    "processingState",
    "usesNonExemptEncryption",
  ],
  betaGroups: ["name", "isInternalGroup", "publicLinkEnabled", "publicLink"],
  betaTesters: ["email", "firstName", "lastName", "inviteType", "state"],
  customerReviews: [
    "rating",
    "title",
    "body",
    "reviewerNickname",
    "createdDate",
    "territory",
  ],
  inAppPurchases: ["name", "productId", "inAppPurchaseType", "state"],
  subscriptionGroups: ["referenceName"],
  subscriptions: ["name", "productId", "state", "subscriptionPeriod"],
  bundleIds: ["identifier", "name", "platform"],
  devices: ["name", "platform", "udid", "deviceClass", "status"],
  users: ["username", "firstName", "lastName", "roles"],
};
