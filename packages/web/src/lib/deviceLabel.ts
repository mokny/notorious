import type { TFunction } from "i18next";

/** Very rough user-agent -> "Browser on OS" label - good enough for a device list, no need for a full UA-parsing dependency. Shared by the self-service device list (SecuritySettings.tsx) and the admin panel's instance-wide Sessions tab. */
export function describeUserAgent(userAgent: string | null, t: TFunction): string {
  if (!userAgent) return t("settings.security.unknownDevice");
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /CriOS\//.test(userAgent)
          ? "Chrome"
          : /Firefox\//.test(userAgent)
            ? "Firefox"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : "Unknown browser";
  return `${browser} on ${os}`;
}

export function relativeTime(iso: string | null, t: TFunction): string {
  if (!iso) return t("settings.security.unknown");
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return t("settings.security.justNow");
  if (minutes < 60) return t("settings.security.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("settings.security.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t("settings.security.daysAgo", { count: days });
}
