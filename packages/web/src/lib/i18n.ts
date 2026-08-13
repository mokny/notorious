import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { LOCALE_RESOURCES, DEFAULT_LOCALE } from "@notorious/shared";

/**
 * Web i18next instance - resources come from `@notorious/shared` (the same
 * locale JSON the server uses for push notifications), so a translation is
 * only ever added in one place. Starts in the default/English language;
 * AuthContext.tsx switches it once the current user (and their `locale`, or
 * a detected browser-language match) is known - see its doc comment.
 */
void i18next
  .use(initReactI18next)
  .init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    resources: LOCALE_RESOURCES,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18next;
