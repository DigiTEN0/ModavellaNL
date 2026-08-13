import { htmlToText } from "../util/html.js";
import { humanList, pick } from "../util/text.js";
import { summarizeSizes } from "./meta.js";
import { hasCareInfo } from "./facets.js";
import type { AppConfig, NormalizedProduct } from "../types.js";

/* Builds an enhanced, professional product description.
 *
 * Principles:
 *  - Never fabricate. Bullets are only added when the underlying fact exists.
 *  - Preserve the original descriptive content (including <table> size charts),
 *    already sanitized upstream.
 *  - Add structure: an intro (only when the source is thin), a "Kenmerken"
 *    facts list, size availability, and an optional trust block.
 */

interface Labels {
  features: string;
  material: string;
  colours: string;
  sizes: string;
  brand: string;
  category: string;
  care: string;
  sizeGuide: string;
  availableSizes: string;
  trustHeading: string;
}

const LABELS: Record<"nl" | "en", Labels> = {
  nl: {
    features: "Kenmerken",
    material: "Materiaal",
    colours: "Kleuren",
    sizes: "Maten",
    brand: "Merk",
    category: "Categorie",
    care: "Verzorging",
    sizeGuide: "Maattabel",
    availableSizes: "Beschikbaar in",
    trustHeading: "Waarom bij ons bestellen",
  },
  en: {
    features: "Features",
    material: "Material",
    colours: "Colours",
    sizes: "Sizes",
    brand: "Brand",
    category: "Category",
    care: "Care",
    sizeGuide: "Size guide",
    availableSizes: "Available in",
    trustHeading: "Why order with us",
  },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildIntro(p: NormalizedProduct, config: AppConfig): string {
  const nl = config.locale === "nl";
  const seed = p.originalHandle || p.title;
  const cat = p.productType ? p.productType.toLowerCase() : nl ? "item" : "piece";
  const material = p.facets.materials[0];
  const openers = nl
    ? [
        `De <strong>${esc(p.title)}</strong> combineert stijl met draagcomfort`,
        `Maak kennis met de <strong>${esc(p.title)}</strong>`,
        `De <strong>${esc(p.title)}</strong> is een tijdloze aanvulling op je garderobe`,
      ]
    : [
        `The <strong>${esc(p.title)}</strong> blends style with everyday comfort`,
        `Meet the <strong>${esc(p.title)}</strong>`,
        `The <strong>${esc(p.title)}</strong> is a timeless addition to your wardrobe`,
      ];
  let s = pick(seed + "intro", openers);
  if (material) {
    s += nl
      ? `. Uitgevoerd in ${esc(material.toLowerCase())} voor een prettige pasvorm`
      : `. Crafted in ${esc(material.toLowerCase())} for a comfortable fit`;
  }
  s += ".";
  return `<p>${s}</p>`;
}

function buildFeatureList(p: NormalizedProduct, config: AppConfig): string {
  const L = LABELS[config.locale];
  const items: string[] = [];

  if (p.productType) items.push(`<li><strong>${L.category}:</strong> ${esc(p.productType)}</li>`);
  if (p.vendor && p.vendor.toLowerCase() !== config.shopName.toLowerCase()) {
    items.push(`<li><strong>${L.brand}:</strong> ${esc(p.vendor)}</li>`);
  }
  if (p.facets.materials.length) {
    items.push(`<li><strong>${L.material}:</strong> ${esc(humanList(p.facets.materials.map(cap), config.locale))}</li>`);
  }
  if (p.facets.colors.length) {
    const shown = p.facets.colors.slice(0, 8);
    items.push(`<li><strong>${L.colours}:</strong> ${esc(humanList(shown, config.locale))}</li>`);
  }
  const sizeStr = summarizeSizes(p.facets.sizes, config.locale);
  if (sizeStr) items.push(`<li><strong>${L.sizes}:</strong> ${esc(sizeStr.replace(/^maat\s+/i, "").replace(/^sizes?\s+/i, ""))}</li>`);
  if (hasCareInfo(p.originalBodyHtml)) {
    items.push(`<li><strong>${L.care}:</strong> ${config.locale === "nl" ? "zie verzorgingsinstructies" : "see care instructions"}</li>`);
  }

  if (items.length === 0) return "";
  return `<h3>${L.features}</h3>\n<ul>\n${items.join("\n")}\n</ul>`;
}

function buildTrustBlock(config: AppConfig): string {
  const L = LABELS[config.locale];
  const bits = [config.trust.shipping, config.trust.returns, config.trust.service].filter(Boolean);
  if (bits.length === 0) return "";
  const items = bits.map((b) => `<li>${esc(b)}</li>`).join("\n");
  return `<h3>${L.trustHeading}</h3>\n<ul>\n${items}\n</ul>`;
}

export function buildEnhancedDescription(p: NormalizedProduct, config: AppConfig): { html: string; summary: string } {
  const original = p.originalBodyHtml.trim();
  const originalText = htmlToText(original);
  const isThin = originalText.length < 200;

  const parts: string[] = [];
  parts.push(`<div class="mv-product-description">`);

  if (isThin) {
    // Source has little/no copy — generate a grounded intro then keep whatever
    // original content exists (e.g. a lone size table).
    parts.push(buildIntro(p, config));
    if (original) parts.push(original);
  } else {
    // Source has real copy — lead with it, don't duplicate with a generated intro.
    parts.push(original);
  }

  const features = buildFeatureList(p, config);
  if (features) parts.push(features);

  const trust = buildTrustBlock(config);
  if (trust) parts.push(trust);

  parts.push(`</div>`);

  const html = parts.filter(Boolean).join("\n");
  const summary = htmlToText(html).slice(0, 400);
  return { html, summary };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
