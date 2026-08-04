export function isIOS(): boolean {
  // iPadOS 13+ reports as "Macintosh" in the UA string with touch support
  // enabled - the classic UA check alone misses every iPad.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
