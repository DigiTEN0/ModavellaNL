import { toCsv } from "../util/csv.js";
import { smartTruncate } from "../util/text.js";
import type { AppConfig, Catalog, NormalizedCollection } from "../types.js";

/* Produces a Matrixify-compatible "Collections" CSV describing one SMART
 * collection per source category. Each smart collection's rule is:
 *
 *     Product Tag  Equals  collectie:<handle>
 *
 * Because the product CSV tags every product with its source collection(s),
 * importing these smart collections re-creates the entire category structure
 * automatically — no manual sorting of thousands of products.
 *
 * Import order: import products FIRST, then these smart collections. */

export const COLLECTION_COLUMNS = [
  "Handle",
  "Command",
  "Title",
  "Body HTML",
  "Collection Type",
  "Published",
  "Sort Order",
  "SEO Title",
  "SEO Description",
  "Image Src",
  "Must Match",
  "Rule: Product Column",
  "Rule: Relation",
  "Rule: Condition",
];

function collectionSeo(col: NormalizedCollection, config: AppConfig) {
  const nl = config.locale === "nl";
  const shop = config.shopName;
  const seoTitle = smartTruncate(`${col.title} | ${shop}`, 60);
  const base = nl
    ? `Shop de complete ${col.title.toLowerCase()}-collectie bij ${shop}.`
    : `Shop the complete ${col.title.toLowerCase()} collection at ${shop}.`;
  const trust = [config.trust.shipping, config.trust.returns].filter(Boolean).join(nl ? " · " : " · ");
  const tail = trust
    ? ` ${trust}.`
    : nl
      ? " Nieuwe stijlen, scherpe prijzen."
      : " New styles, sharp prices.";
  const metaDescription = smartTruncate(base + tail, 158);
  return { seoTitle, metaDescription };
}

export function buildCollectionsCsv(catalog: Catalog, config: AppConfig): string {
  const rows: Array<Record<string, unknown>> = [];
  for (const col of catalog.collections) {
    // Skip empty categories (nothing captured) to avoid dead collections.
    if (col.productCount === 0) continue;
    const seo = collectionSeo(col, config);
    rows.push({
      Handle: col.handle,
      Command: "MERGE",
      Title: col.title,
      "Body HTML": col.description || "",
      "Collection Type": "Smart",
      Published: "TRUE",
      "Sort Order": "best-selling",
      "SEO Title": seo.seoTitle,
      "SEO Description": seo.metaDescription,
      "Image Src": "",
      "Must Match": "all conditions",
      "Rule: Product Column": "Tag",
      "Rule: Relation": "Equals",
      "Rule: Condition": col.tag,
    });
  }
  return toCsv(COLLECTION_COLUMNS, rows);
}
