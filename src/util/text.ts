/* String helpers: transliteration, slugify, truncation, hashing.
 * All dependency-free. */

/** Extra transliterations that NFKD doesn't handle well. */
const SPECIAL: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ø: "o",
  Ø: "o",
  đ: "d",
  Đ: "d",
  ł: "l",
  Ł: "l",
  ð: "d",
  þ: "th",
  "™": "", // trademark/registered marks: drop so slugs don't become "...tm"
  "®": "",
  "©": "",
  "℠": "",
  "&": " en ", // Dutch store default; harmless in English too
};

/** Remove trademark/registered symbols from visible text (titles, etc.). */
export function stripTrademarkSymbols(input: string): string {
  return input.replace(/[™®©℠]/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Remove diacritics and map special glyphs to ASCII. */
export function transliterate(input: string): string {
  let out = "";
  for (const ch of input) {
    if (SPECIAL[ch] !== undefined) {
      out += SPECIAL[ch];
      continue;
    }
    out += ch;
  }
  // Decompose accents then strip the combining marks (U+0300–U+036F).
  const COMBINING = new RegExp(
    "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
    "g",
  );
  return out.normalize("NFKD").replace(COMBINING, "");
}

/**
 * Produce a clean URL slug/handle.
 * lowercase, ascii-only, hyphen-separated, collapsed, length-capped at a word
 * boundary. Shopify handles must match /^[a-z0-9-]+$/.
 */
export function slugify(input: string, maxLen = 60): string {
  let s = transliterate(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (s.length <= maxLen) return s || "product";
  // Cap at last hyphen before maxLen so we don't cut a word in half.
  const clipped = s.slice(0, maxLen);
  const lastDash = clipped.lastIndexOf("-");
  s = lastDash > 12 ? clipped.slice(0, lastDash) : clipped;
  return s.replace(/-+$/g, "") || "product";
}

/**
 * Truncate to a maximum length without cutting a word in half, appending an
 * optional ellipsis-free clean ending. Returns a string <= maxLen.
 */
export function smartTruncate(input: string, maxLen: number): string {
  const s = input.trim().replace(/\s+/g, " ");
  if (s.length <= maxLen) return s;
  const clipped = s.slice(0, maxLen);
  const lastSpace = clipped.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return cut.replace(/[\s,;:.\-–—]+$/g, "");
}

/** Deterministic 32-bit FNV-1a hash → used to vary templates per product. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Pick a deterministic element from a list based on a seed string. */
export function pick<T>(seed: string, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() needs a non-empty list");
  return items[fnv1a(seed) % items.length]!;
}

/** Title-case a single word/phrase conservatively (keeps existing caps). */
export function titleCaseWord(w: string): string {
  if (!w) return w;
  if (w.length <= 3 && w === w.toUpperCase()) return w; // acronyms like "XL"
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Join a list into a natural-language enumeration ("a, b en c"). */
export function humanList(items: string[], locale: "nl" | "en"): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  const and = locale === "nl" ? "en" : "and";
  return `${clean.slice(0, -1).join(", ")} ${and} ${clean[clean.length - 1]}`;
}

/** Deduplicate case-insensitively while preserving first-seen casing/order. */
export function dedupeCI(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
