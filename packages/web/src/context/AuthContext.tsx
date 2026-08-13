import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import { SUPPORTED_LOCALES, type User } from "@notorious/shared";
import { authApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";

/**
 * Matches a browser `navigator.language`/`navigator.languages[0]` tag (e.g.
 * `"de-AT"`, `"en-US"`) against `SUPPORTED_LOCALES` - exact match first, then
 * just the language subtag before any `-REGION` suffix. Returns null if
 * nothing supported matches, in which case the caller leaves the language
 * alone (stays on the English default) rather than guessing.
 */
function matchBrowserLocale(): string | null {
  const candidates = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
    const prefix = candidate.split("-")[0]?.toLowerCase();
    const prefixMatch = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === prefix);
    if (prefixMatch) return prefixMatch;
  }
  return null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  // Once per session (not once per `data` change - a later profile-settings
  // language change shouldn't retrigger this): if the logged-in user has an
  // explicit `locale`, switch the UI to it. Otherwise, try a one-time
  // browser-language detection - if it finds a supported match, persist it
  // (so this doesn't run again next session) and switch immediately.
  // Deliberately does nothing (stays on the English default) when no
  // supported match is found, rather than writing an empty/incorrect guess.
  const detectionRanRef = useRef(false);
  useEffect(() => {
    if (!data || detectionRanRef.current) return;
    detectionRanRef.current = true;

    if (data.locale) {
      void i18n.changeLanguage(data.locale);
      return;
    }

    const detected = matchBrowserLocale();
    if (!detected) return;
    void i18n.changeLanguage(detected);
    void authApi.updateLocale({ locale: detected }).then(() => {
      queryClient.setQueryData(["me"], (previous: User | null | undefined) => (previous ? { ...previous, locale: detected } : previous));
    });
  }, [data, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      refetch: async () => {
        const result = await refetch();
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        return result;
      },
    }),
    [data, isLoading, refetch, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
