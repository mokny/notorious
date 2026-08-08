/** Applied to every external `<a>` we render (rich text, bookmark blocks, url properties). */
export interface ExternalLinkAttrs {
  href: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
}

/**
 * Same-origin links (e.g. a URL to this Notorious instance pasted as rich
 * text, instead of a proper object link/SubObjectBlock) navigate normally in
 * the same tab. Anything else - including unparsable/relative-without-base
 * URLs - is treated as external.
 */
export function isExternalUrl(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname !== window.location.hostname;
  } catch {
    return false;
  }
}

/** Routes an external URL through the referrer-stripping redirect proxy - see server modules/linkOut. */
export function buildLinkOutHref(url: string): string {
  return `/api/v1/link-out?url=${encodeURIComponent(url)}`;
}

/** href/target/rel to actually render for a given link's original URL - external gets proxied + new tab, internal is left untouched. */
export function externalLinkAttrs(href: string): ExternalLinkAttrs {
  if (!isExternalUrl(href)) return { href };
  return { href: buildLinkOutHref(href), target: "_blank", rel: "noopener noreferrer" };
}
