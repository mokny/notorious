export function isIOS(): boolean {
  // iPadOS 13+ reports as "Macintosh" in the UA string with touch support
  // enabled - the classic UA check alone misses every iPad.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True when running installed as a PWA (standalone display mode), on any platform. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True when the User-Agent isn't a mobile OS (iOS/Android) - regardless of whether this is a plain browser tab or an installed PWA. Used to gate desktop-only UI like the chat new-message sound (see hooks/useChatSound.ts). */
export function isDesktop(): boolean {
  return !/iphone|ipad|ipod|android/i.test(navigator.userAgent) && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
