/**
 * App Store locale codes. Apple uses a fixed list — this is the canonical set
 * the API accepts for App Store Version Localizations as of 2026.
 * Source: https://developer.apple.com/documentation/appstoreconnectapi/applocalecodes
 */
export const APP_STORE_LOCALES = [
  "ar-SA",
  "ca",
  "cs",
  "da",
  "de-DE",
  "el",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-US",
  "es-ES",
  "es-MX",
  "fi",
  "fr-CA",
  "fr-FR",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "nl-NL",
  "no",
  "pl",
  "pt-BR",
  "pt-PT",
  "ro",
  "ru",
  "sk",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh-Hans",
  "zh-Hant",
] as const;

export type AppStoreLocale = (typeof APP_STORE_LOCALES)[number];

/**
 * Character limits enforced by App Store Connect on metadata fields,
 * keyed by the JSON:API attribute name.
 */
export const METADATA_CHAR_LIMITS = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  promotionalText: 170,
  description: 4000,
  whatsNew: 4000,
  privacyPolicyText: 4000,
  marketingUrl: 255,
  supportUrl: 255,
  privacyPolicyUrl: 255,
} as const;

export function isValidLocale(code: string): code is AppStoreLocale {
  return (APP_STORE_LOCALES as readonly string[]).includes(code);
}
