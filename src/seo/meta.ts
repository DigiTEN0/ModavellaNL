import { humanList, pick, smartTruncate, dedupeCI } from "../util/text.js";
import type { AppConfig, NormalizedProduct } from "../types.js";

const TITLE_MAX = 60; // Google typically shows ~60 chars
const META_MIN = 130;
const META_MAX = 158;

/** Human-readable size range, e.g. "maat 36 t/m 46" or "maat XS t/m XXL". */
export function summarizeSizes(sizes: string[], locale: "nl" | "en"): string {
  const clean = dedupeCI(sizes);
  if (clean.length === 0) return "";
  const word = locale === "nl" ? "maat" : "size";
  const nums = clean.map((s) => Number(s.replace(",", "."))).filter((n) => Number.isFinite(n));
  if (nums.length === clean.length && nums.length > 1) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return locale === "nl" ? `${word} ${min} t/m ${max}` : `${word}s ${min}–${max}`;
  }
  // Alpha sizes: order by a known scale when possible.
  const scale = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];
  const ordered = clean
    .slice()
    .sort((a, b) => scale.indexOf(a.toUpperCase()) - scale.indexOf(b.toUpperCase()));
  const known = ordered.every((s) => scale.includes(s.toUpperCase()));
  if (known && ordered.length > 1) {
    return locale === "nl"
      ? `${word} ${ordered[0]} t/m ${ordered[ordered.length - 1]}`
      : `${word}s ${ordered[0]}–${ordered[ordered.length - 1]}`;
  }
  if (clean.length <= 4) return `${word} ${humanList(clean, locale)}`;
  return locale === "nl" ? `${clean.length} maten beschikbaar` : `${clean.length} sizes available`;
}

/** Build a keyword-forward, brand-suffixed SEO title within ~60 chars. */
export function buildSeoTitle(p: NormalizedProduct, config: AppConfig): string {
  const shop = config.shopName;
  const suffix = ` | ${shop}`;
  const room = TITLE_MAX - suffix.length;

  const title = p.title.replace(/\s+/g, " ").trim();
  const titleLower = title.toLowerCase();

  // Optional differentiator only enriches SHORT/generic titles. Descriptive
  // titles are already strong and shouldn't be padded. We only use a material
  // when it is single/unambiguous (avoids e.g. "Wollen jas – Polyester").
  const material = p.facets.materials.length === 1 ? p.facets.materials[0] : undefined;
  const color = p.facets.colors.length === 1 ? p.facets.colors[0] : undefined;
  const diff = [material, p.productType, color]
    .filter((x): x is string => !!x)
    .filter((x) => !titleLower.includes(x.toLowerCase()))
    .filter((x) => !sharesStem(titleLower, x))[0];

  let core = title;
  if (diff && title.length < 40) {
    const withDiff = `${title} – ${cap(diff)}`;
    if (withDiff.length <= room) core = withDiff;
  }
  if (core.length > room) core = smartTruncate(core, room);
  return core + suffix;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** True if the title already contains the first 4 letters of a word (>=5 chars),
 * so we don't append "Sneakers" to a title that already says "Sneaker". */
function sharesStem(titleLower: string, candidate: string): boolean {
  const c = candidate.toLowerCase();
  if (c.length < 5) return false;
  return titleLower.includes(c.slice(0, 4));
}

/**
 * Build a unique, grounded meta description in the target 130–158 char window.
 * Templates are chosen deterministically per product to avoid a repeated
 * boilerplate pattern across the catalogue (which search engines dislike).
 */
export function buildMetaDescription(p: NormalizedProduct, config: AppConfig): string {
  const nl = config.locale === "nl";
  const seed = p.originalHandle || p.title;
  const shop = config.shopName;

  const materials = p.facets.materials.slice(0, 2).map(cap);
  const colorCount = p.facets.colors.length;
  const sizeStr = summarizeSizes(p.facets.sizes, config.locale);

  // ── Opening clause: what it is ──
  const openers = nl
    ? [
        `${p.title} bij ${shop}.`,
        `Ontdek de ${p.title} bij ${shop}.`,
        `${p.title} — nu online bij ${shop}.`,
      ]
    : [
        `${p.title} at ${shop}.`,
        `Discover the ${p.title} at ${shop}.`,
        `${p.title} — now online at ${shop}.`,
      ];
  const opener = pick(seed + "o", openers);

  // ── Attribute clause: grounded facts only ──
  const attrs: string[] = [];
  if (materials.length) {
    attrs.push(nl ? `Gemaakt van ${humanList(materials, "nl").toLowerCase()}` : `Made from ${humanList(materials, "en").toLowerCase()}`);
  }
  if (colorCount >= 2) {
    attrs.push(nl ? `verkrijgbaar in ${colorCount} kleuren` : `available in ${colorCount} colours`);
  } else if (colorCount === 1 && p.facets.colors[0]) {
    attrs.push(nl ? `in ${p.facets.colors[0].toLowerCase()}` : `in ${p.facets.colors[0].toLowerCase()}`);
  }
  if (sizeStr) attrs.push(sizeStr);
  const attrClause = attrs.length
    ? cap(attrs.join(nl ? ", " : ", ")) + "."
    : "";

  // ── Trust / CTA clauses (each a standalone sentence, packed greedily) ──
  const ensurePeriod = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + ".");
  const trustBits = [config.trust.shipping, config.trust.returns, config.trust.service]
    .filter(Boolean)
    .map(ensurePeriod);
  const cta = pick(seed + "c", nl
    ? ["Bestel vandaag nog online.", "Nu te bestellen in onze webshop.", "Snel in huis besteld."]
    : ["Order online today.", "Shop the collection now.", "Fast delivery available."]);
  const benefit = nl ? "Kwaliteit en stijl, zorgvuldig geselecteerd." : "Quality and style, carefully selected.";

  // Priority order of optional clauses after the (mandatory) opener.
  const optional = [attrClause, ...trustBits, cta, benefit].filter(Boolean);

  // Greedy packing: include each clause while we stay within META_MAX.
  let desc = opener;
  for (const clause of optional) {
    const next = `${desc} ${clause}`.replace(/\s+/g, " ").trim();
    if (next.length <= META_MAX) desc = next;
  }
  desc = desc.replace(/\s+/g, " ").trim();

  // Safety: if the opener alone somehow exceeds the window, trim it.
  if (desc.length > META_MAX) desc = smartTruncate(desc, META_MAX);
  return desc;
}
