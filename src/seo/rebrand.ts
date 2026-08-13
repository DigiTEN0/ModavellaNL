import { dedupeCI } from "../util/text.js";
import type { AppConfig, Catalog } from "../types.js";

/* Rebranding pass — turn a scraped catalogue into YOUR store.
 *
 * Two things happen here:
 *  1. Vendor override: every product's vendor becomes your shop's vendor name
 *     (default = shop name) so the source brand never shows up as "Merk" or in
 *     Shopify's Vendor column. Disable with KEEP_SOURCE_VENDOR=true.
 *  2. Brand scrub: mentions of the source brand in titles, descriptions, image
 *     alt-text and tags are removed (titles/tags) or replaced with your shop
 *     name (body text/alt). Image URLs are never touched, so nothing breaks.
 *
 * Source vendor names are detected automatically; extra aliases come from
 * SOURCE_BRANDS. Runs before the SEO engine so all downstream copy is clean. */

export interface RebrandResult {
  brandAliases: string[];
  vendorName: string;
  productsRebranded: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build tolerant regexes: "Nora Mae" matches "Nora-Mae", "NoraMae", etc. */
function buildBrandRegexes(brands: string[]): RegExp[] {
  const regexes: RegExp[] = [];
  for (const brand of brands) {
    const tokens = brand.trim().split(/[\s-]+/).filter(Boolean).map(escapeRe);
    if (tokens.length === 0) continue;
    // Allow an optional space/hyphen between tokens; require word boundaries.
    const pattern = `\\b${tokens.join("[\\s-]?")}\\b`;
    regexes.push(new RegExp(pattern, "gi"));
  }
  return regexes;
}

function scrubPlain(text: string, regexes: RegExp[], replacement: string): string {
  let out = text;
  for (const re of regexes) out = out.replace(re, replacement);
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Remove the brand from a title, then tidy leftover separators. */
function scrubTitle(title: string, regexes: RegExp[]): string {
  const cleaned = scrubPlain(title, regexes, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|,.:]+/, "")
    .replace(/[\s\-–—|,.:]+$/, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : title; // never blank out a title
}

/** Replace brand mentions in HTML *text nodes only* — never inside tags/URLs. */
function scrubHtmlText(html: string, regexes: RegExp[], replacement: string): string {
  if (!html) return html;
  if (!html.includes("<")) return scrubPlain(html, regexes, replacement);
  // Only touch the text between ">" and "<"; attributes (incl. src/href) are safe.
  return html.replace(/>([^<]+)</g, (_m, text: string) => `>${scrubPlain(text, regexes, replacement)}<`);
}

function isBrandOnlyTag(tag: string, regexes: RegExp[]): boolean {
  const stripped = scrubPlain(tag, regexes, "").trim();
  return stripped.length === 0 && tag.trim().length > 0;
}

export function rebrandCatalog(catalog: Catalog, config: AppConfig): RebrandResult {
  const shopLower = config.shopName.toLowerCase();

  // Auto-detect source vendors (anything that isn't your own shop name).
  const detected: string[] = [];
  for (const p of catalog.products) {
    if (p.vendor && p.vendor.toLowerCase() !== shopLower) detected.push(p.vendor);
  }
  const brands = dedupeCI([...detected, ...config.sourceBrands]).filter(
    (b) => b.toLowerCase() !== shopLower,
  );
  const regexes = config.brandScrub ? buildBrandRegexes(brands) : [];
  const replacement = config.shopName;

  let productsRebranded = 0;
  for (const p of catalog.products) {
    let touched = false;

    if (!config.keepSourceVendor && p.vendor !== config.vendorName) {
      p.vendor = config.vendorName;
      touched = true;
    }

    if (regexes.length) {
      const newTitle = scrubTitle(p.title, regexes);
      if (newTitle !== p.title) { p.title = newTitle; touched = true; }

      const newBody = scrubHtmlText(p.originalBodyHtml, regexes, replacement);
      if (newBody !== p.originalBodyHtml) { p.originalBodyHtml = newBody; touched = true; }

      for (const img of p.images) {
        const newAlt = scrubPlain(img.alt, regexes, replacement).trim();
        if (newAlt !== img.alt) { img.alt = newAlt; touched = true; }
      }

      const keptTags = p.tags.filter((t) => !isBrandOnlyTag(t, regexes));
      if (keptTags.length !== p.tags.length) { p.tags = keptTags; touched = true; }
    }

    if (touched) productsRebranded++;
  }

  return { brandAliases: brands, vendorName: config.vendorName, productsRebranded };
}
