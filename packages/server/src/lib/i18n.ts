import i18next, { type TFunction } from "i18next";
import { LOCALE_RESOURCES, DEFAULT_LOCALE } from "@notorious/shared";

let initPromise: Promise<TFunction> | null = null;

/**
 * Core (non-React) i18next instance for server-generated user-facing text -
 * currently just Web Push notification title/body (see modules/push/service.ts
 * call sites). Resources come from the same `@notorious/shared` locale JSON
 * the web client uses (see packages/shared/src/i18n/index.ts), so a
 * translation only ever needs to be added in one place.
 */
async function getT(): Promise<TFunction> {
  if (!initPromise) {
    initPromise = i18next
      .init({
        lng: DEFAULT_LOCALE,
        fallbackLng: DEFAULT_LOCALE,
        defaultNS: "common",
        resources: LOCALE_RESOURCES,
        interpolation: { escapeValue: false },
      })
      .then(() => i18next.t);
  }
  return initPromise;
}

/** Translates `key` for `locale` (falling back to English per-key, and entirely when `locale` is null/unrecognized - see users.locale's doc comment in db/schema.ts). */
export async function translate(locale: string | null, key: string, options?: Record<string, unknown>): Promise<string> {
  const t = await getT();
  return t(key, { lng: locale ?? DEFAULT_LOCALE, ...options });
}
