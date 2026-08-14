const IP_LOOKUP_TIMEOUT_MS = 5000;

/** Best-effort public-IP lookup via a third-party service - null on any failure (offline, service down, timeout). Shared by scripts/setupCalls.ts and the admin UI's calls-setup endpoint. */
export async function detectPublicIp(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
    const response = await fetch("https://api.ipify.org", { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return (await response.text()).trim();
  } catch {
    return null;
  }
}
