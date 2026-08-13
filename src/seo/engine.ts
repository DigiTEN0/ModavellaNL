import { SlugRegistry } from "./slug.js";
import { buildSeoTitle, buildMetaDescription } from "./meta.js";
import { buildEnhancedDescription } from "./description.js";
import { rebrandCatalog } from "./rebrand.js";
import { dedupeCI } from "../util/text.js";
import type { AppConfig, Catalog, NormalizedProduct } from "../types.js";

/* Runs the deterministic SEO engine across the whole catalogue:
 *  - unique, clean handles
 *  - keyword-forward SEO titles
 *  - grounded, unique meta descriptions
 *  - enhanced description HTML (preserving size charts)
 *  - collection-preserving tags
 *
 * The result is written back onto each product's `seo` field and `tags`. */

export interface SeoStats {
  products: number;
  metaInWindow: number;
  titlesWithinLimit: number;
  uniqueHandles: number;
  uniqueMetaDescriptions: number;
  collectionsTagged: number;
  vendorName: string;
  brandAliasesScrubbed: string[];
  productsRebranded: number;
}

/**
 * Add collection-membership tags so a smart collection can rebuild each
 * category automatically. This is what removes the manual sorting of thousands
 * of products. We add both a machine tag (collectie:<handle>) and the readable
 * collection title as a tag for flexibility.
 */
function applyCollectionTags(product: NormalizedProduct, catalog: Catalog): void {
  const byHandle = new Map(catalog.collections.map((c) => [c.handle, c]));
  const extra: string[] = [];
  for (const handle of product.collectionHandles) {
    const col = byHandle.get(handle);
    if (!col) continue;
    extra.push(col.tag); // collectie:<handle>
    extra.push(col.title); // human-readable
  }
  product.tags = dedupeCI([...product.tags, ...extra]);
}

/** Enrich tags with facet-derived tags (colours, sizes, material, type). */
function applyFacetTags(product: NormalizedProduct): void {
  const extra: string[] = [];
  if (product.productType) extra.push(product.productType);
  for (const c of product.facets.colors) extra.push(c);
  for (const m of product.facets.materials) extra.push(m);
  product.tags = dedupeCI([...product.tags, ...extra]);
}

export function runSeoEngine(catalog: Catalog, config: AppConfig): SeoStats {
  // Rebrand FIRST so titles/descriptions/vendor are yours before SEO is built.
  const rebrand = rebrandCatalog(catalog, config);

  const slugs = new SlugRegistry();
  const metaSeen = new Set<string>();

  let metaInWindow = 0;
  let titlesWithinLimit = 0;
  let uniqueMeta = 0;
  let collectionsTagged = 0;

  for (const product of catalog.products) {
    // Tags first (so downstream can use them); preserves categorisation.
    if (product.collectionHandles.length) collectionsTagged++;
    applyCollectionTags(product, catalog);
    applyFacetTags(product);

    // Handle
    const handle = slugs.make(product.title, product.productType);

    // SEO title & meta description
    const seoTitle = buildSeoTitle(product, config);
    const metaDescription = buildMetaDescription(product, config);

    // Enhanced description
    const { html, summary } = buildEnhancedDescription(product, config);

    product.seo = {
      handle,
      seoTitle,
      metaDescription,
      bodyHtml: html,
      summaryText: summary,
      source: "engine",
    };

    if (metaDescription.length >= 120 && metaDescription.length <= 160) metaInWindow++;
    if (seoTitle.length <= 62) titlesWithinLimit++;
    const key = metaDescription.toLowerCase();
    if (!metaSeen.has(key)) {
      metaSeen.add(key);
      uniqueMeta++;
    }
  }

  return {
    products: catalog.products.length,
    metaInWindow,
    titlesWithinLimit,
    uniqueHandles: slugs.size,
    uniqueMetaDescriptions: uniqueMeta,
    collectionsTagged,
    vendorName: rebrand.vendorName,
    brandAliasesScrubbed: rebrand.brandAliases,
    productsRebranded: rebrand.productsRebranded,
  };
}
