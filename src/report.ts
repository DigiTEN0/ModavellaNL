import type { Catalog } from "./types.js";

export interface CatalogReport {
  scrapedAt: string;
  sourceUrl: string;
  products: number;
  variants: number;
  images: number;
  collections: number;
  collectionsWithProducts: number;
  productsInAnyCollection: number;
  orphanProducts: number;
  productsWithoutImages: number;
  productsWithoutPrice: number;
  seo: {
    uniqueHandles: number;
    duplicateHandles: number;
    metaInWindow: number;
    metaTooShort: number;
    metaTooLong: number;
    titlesWithinLimit: number;
    uniqueMetaDescriptions: number;
    enhancedByClaude: number;
  };
  warnings: string[];
}

export function buildReport(catalog: Catalog): CatalogReport {
  const products = catalog.products;
  const handles = new Map<string, number>();
  const metas = new Set<string>();

  let variants = 0;
  let images = 0;
  let inAnyCollection = 0;
  let withoutImages = 0;
  let withoutPrice = 0;
  let metaInWindow = 0;
  let metaShort = 0;
  let metaLong = 0;
  let titlesOk = 0;
  let claudeCount = 0;

  for (const p of products) {
    variants += p.variants.length;
    images += p.images.length;
    if (p.collectionHandles.length > 0) inAnyCollection++;
    if (p.images.length === 0) withoutImages++;
    if (!p.facets.priceMin) withoutPrice++;

    const h = p.seo?.handle ?? p.originalHandle;
    handles.set(h, (handles.get(h) ?? 0) + 1);

    const meta = p.seo?.metaDescription ?? "";
    if (meta) metas.add(meta.toLowerCase());
    const len = meta.length;
    if (len >= 120 && len <= 160) metaInWindow++;
    else if (len < 120) metaShort++;
    else metaLong++;

    if ((p.seo?.seoTitle ?? "").length <= 62) titlesOk++;
    if (p.seo?.source === "claude") claudeCount++;
  }

  const duplicateHandles = [...handles.values()].filter((n) => n > 1).length;
  const collectionsWithProducts = catalog.collections.filter((c) => c.productCount > 0).length;
  const orphanProducts = products.length - inAnyCollection;

  const warnings: string[] = [];
  if (duplicateHandles > 0) warnings.push(`${duplicateHandles} dubbele handles gevonden (zou 0 moeten zijn).`);
  if (withoutImages > 0) warnings.push(`${withoutImages} producten zonder afbeeldingen.`);
  if (withoutPrice > 0) warnings.push(`${withoutPrice} producten zonder prijs.`);
  if (orphanProducts > 0) warnings.push(`${orphanProducts} producten zitten in géén enkele collectie (mogelijk bewust, of de bron toonde ze niet in een collectie).`);
  if (catalog.collections.length === 0) warnings.push(`Geen collecties gevonden — categorie-behoud niet mogelijk voor deze bron.`);

  return {
    scrapedAt: catalog.source.scrapedAt,
    sourceUrl: catalog.source.baseUrl,
    products: products.length,
    variants,
    images,
    collections: catalog.collections.length,
    collectionsWithProducts,
    productsInAnyCollection: inAnyCollection,
    orphanProducts,
    productsWithoutImages: withoutImages,
    productsWithoutPrice: withoutPrice,
    seo: {
      uniqueHandles: handles.size,
      duplicateHandles,
      metaInWindow,
      metaTooShort: metaShort,
      metaTooLong: metaLong,
      titlesWithinLimit: titlesOk,
      uniqueMetaDescriptions: metas.size,
      enhancedByClaude: claudeCount,
    },
    warnings,
  };
}

export function reportToMarkdown(r: CatalogReport): string {
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  return `# Modavella import — rapport

**Bron:** ${r.sourceUrl}
**Gescrapet op:** ${r.scrapedAt}

## Catalogus
| Metric | Waarde |
|---|---|
| Producten | **${r.products}** |
| Varianten | ${r.variants} |
| Afbeeldingen | ${r.images} |
| Collecties (totaal) | ${r.collections} |
| Collecties met producten | ${r.collectionsWithProducts} |
| Producten in ≥1 collectie | ${r.productsInAnyCollection} (${pct(r.productsInAnyCollection, r.products)}) |
| Producten zonder collectie | ${r.orphanProducts} |
| Producten zonder afbeelding | ${r.productsWithoutImages} |
| Producten zonder prijs | ${r.productsWithoutPrice} |

## SEO
| Metric | Waarde |
|---|---|
| Unieke handles | ${r.seo.uniqueHandles} |
| Dubbele handles | ${r.seo.duplicateHandles} |
| Meta description in 120–160 tekens | ${r.seo.metaInWindow} (${pct(r.seo.metaInWindow, r.products)}) |
| Meta te kort (<120) | ${r.seo.metaTooShort} |
| Meta te lang (>160) | ${r.seo.metaTooLong} |
| SEO-titels ≤ 60 tekens | ${r.seo.titlesWithinLimit} (${pct(r.seo.titlesWithinLimit, r.products)}) |
| Unieke meta descriptions | ${r.seo.uniqueMetaDescriptions} (${pct(r.seo.uniqueMetaDescriptions, r.products)}) |
| Verrijkt door Claude-batch | ${r.seo.enhancedByClaude} |

${r.warnings.length ? "## ⚠️ Aandachtspunten\n" + r.warnings.map((w) => `- ${w}`).join("\n") : "✓ Geen waarschuwingen."}
`;
}
