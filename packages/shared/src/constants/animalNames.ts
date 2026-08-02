/**
 * Pool of animal names used to give an anonymous share-link visitor a
 * default display name ("Anonymous <name>") without ever showing a bare
 * UUID - see `modules/presence/` on the server, which is the only thing
 * that actually calls `defaultAnimalNameForVisitor`. At least 60 (the
 * product requirement was "at least 50") so a handful of concurrent
 * anonymous viewers on the same document rarely collide before the
 * per-object numbering (see `naming.ts`) has to kick in.
 */
export const ANIMAL_NAMES = [
  "Fox",
  "Owl",
  "Panda",
  "Otter",
  "Falcon",
  "Lynx",
  "Badger",
  "Heron",
  "Raven",
  "Koala",
  "Walrus",
  "Gecko",
  "Puffin",
  "Mongoose",
  "Wombat",
  "Narwhal",
  "Pangolin",
  "Ocelot",
  "Toucan",
  "Meerkat",
  "Beaver",
  "Otterhound",
  "Ibis",
  "Jackal",
  "Kestrel",
  "Lemur",
  "Marmot",
  "Newt",
  "Opossum",
  "Peacock",
  "Quokka",
  "Rhino",
  "Serval",
  "Tapir",
  "Urchin",
  "Vulture",
  "Weasel",
  "Xerus",
  "Yak",
  "Zebu",
  "Antelope",
  "Bison",
  "Chinchilla",
  "Dingo",
  "Egret",
  "Ferret",
  "Gazelle",
  "Hedgehog",
  "Iguana",
  "Jaguar",
  "Kudu",
  "Loris",
  "Macaw",
  "Numbat",
  "Ostrich",
  "Platypus",
  "Quail",
  "Raccoon",
  "Salamander",
  "Tamarin",
  "Uakari",
  "Vole",
  "Warthog",
  "Alpaca",
  "Bobcat",
  "Capybara",
] as const;

/** Always shown before an anonymous visitor's animal/custom name - see modules/presence/naming.ts, which is the only place that ever composes this with a name and the only place a rename request is validated against it. Never stripped, never client-trusted as part of a submitted display name. */
export const ANONYMOUS_NAME_PREFIX = "Anonymous";

/** Small, fast, non-cryptographic string hash (djb2) - only needs to spread
 * visitor ids roughly evenly across the name pool, not resist attack. */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Deterministic default animal for a given anonymous visitor id - the same
 * browser (see lib/visitorIdentity.ts on the frontend, which is where this
 * id comes from) sees a stable default animal across reconnects/reloads
 * instead of a new random one every time, without the server needing to
 * remember anything about a visitor it's never seen before.
 */
export function defaultAnimalNameForVisitor(visitorId: string): string {
  return ANIMAL_NAMES[hashString(visitorId) % ANIMAL_NAMES.length]!;
}
