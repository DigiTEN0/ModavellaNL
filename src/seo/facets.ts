import { htmlToText } from "../util/html.js";
import { dedupeCI } from "../util/text.js";
import type { NormalizedVariant, ProductFacets } from "../types.js";

/* Extract structured facts from a product so the SEO engine writes from REAL
 * data instead of inventing things. Nothing here fabricates: a material is only
 * listed if it literally appears in the source. That is what keeps the output
 * "no AI slop" — every claim is grounded. */

const COLOR_OPTION_NAMES = /(kleur|colou?r|farbe)/i;
const SIZE_OPTION_NAMES = /(maat|size|gr[oö]{1,2}?e|taille)/i;

/** Common apparel fabrics in NL + EN. Detected case-insensitively as words. */
const MATERIALS = [
  "katoen", "cotton", "biologisch katoen", "organic cotton",
  "polyester", "elastaan", "elastane", "elastan", "spandex", "lycra",
  "wol", "wool", "merino", "kasjmier", "cashmere", "mohair",
  "leer", "leder", "leather", "suède", "suede", "nubuck",
  "linnen", "linen", "viscose", "rayon", "modal", "lyocell", "tencel",
  "nylon", "polyamide", "acryl", "acrylic", "denim", "jeans",
  "zijde", "silk", "satijn", "satin", "fluweel", "velvet", "corduroy", "ribfluweel",
  "rubber", "canvas", "mesh", "fleece", "jersey", "tricot", "kant", "lace",
];

const CARE_HINTS = /(machine\s*was|handwas|hand\s*wash|niet\s*bleken|do not bleach|stomerij|dry clean|30\s*°|40\s*°)/i;

function extractColors(options: { name: string; values: string[] }[], variants: NormalizedVariant[]): string[] {
  const colors: string[] = [];
  options.forEach((opt, idx) => {
    if (COLOR_OPTION_NAMES.test(opt.name)) {
      colors.push(...opt.values);
    } else if (idx === 0 && options.length === 1 && !SIZE_OPTION_NAMES.test(opt.name)) {
      // single unnamed option that isn't sizes — often colours/styles
    }
  });
  return dedupeCI(colors);
}

function extractSizes(options: { name: string; values: string[] }[]): string[] {
  const sizes: string[] = [];
  for (const opt of options) {
    if (SIZE_OPTION_NAMES.test(opt.name)) sizes.push(...opt.values);
  }
  return dedupeCI(sizes);
}

function extractMaterials(bodyHtml: string): string[] {
  const text = " " + htmlToText(bodyHtml).toLowerCase() + " ";
  const found: string[] = [];
  for (const m of MATERIALS) {
    const re = new RegExp(`(^|[^a-z])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(text)) found.push(m);
  }
  // Collapse EN/NL synonyms to the first (NL-preferred) label seen.
  return dedupeCI(found).slice(0, 4);
}

export function detectCurrency(price: string): string {
  // /products.json prices are numeric strings; currency isn't included there.
  // We keep a neutral guess and let the exporter stay currency-agnostic.
  return "";
}

export function extractFacets(input: {
  options: { name: string; values: string[] }[];
  variants: NormalizedVariant[];
  bodyHtml: string;
  productType: string;
}): ProductFacets {
  const { options, variants, bodyHtml } = input;
  const prices = variants
    .map((v) => Number(v.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;

  return {
    colors: extractColors(options, variants),
    sizes: extractSizes(options),
    materials: extractMaterials(bodyHtml),
    priceMin: priceMin ? priceMin.toFixed(2) : "",
    priceMax: priceMax ? priceMax.toFixed(2) : "",
    currencyGuess: "",
    inStock: variants.some((v) => v.available),
  };
}

export function hasCareInfo(bodyHtml: string): boolean {
  return CARE_HINTS.test(htmlToText(bodyHtml));
}
