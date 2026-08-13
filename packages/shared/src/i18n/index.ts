import en from "../locales/en/common.json" with { type: "json" };
import de from "../locales/de/common.json" with { type: "json" };
import es from "../locales/es/common.json" with { type: "json" };
import fr from "../locales/fr/common.json" with { type: "json" };

/**
 * One entry per `packages/shared/src/locales/<lang>/common.json` - this
 * object (not a hand-maintained list) is the single source of truth for
 * which languages the app supports. Adding a new language means adding a
 * new subdirectory here + importing it below; nothing else needs updating.
 */
export const LOCALE_RESOURCES = {
  en: { common: en },
  de: { common: de },
  es: { common: es },
  fr: { common: fr },
} as const;

/** Auto-derived from `LOCALE_RESOURCES` above - see its doc comment. English is always first/default. */
export const SUPPORTED_LOCALES = Object.keys(LOCALE_RESOURCES) as Array<keyof typeof LOCALE_RESOURCES>;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as string[]).includes(value);
}
