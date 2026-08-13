import { htmlToText } from "../util/html.js";
import type { AppConfig, NormalizedProduct } from "../types.js";

/* Generate schema.org Product JSON-LD for rich results (price, availability,
 * brand). This is emitted as a separate artefact per product; wire it into your
 * theme's product template (or a metafield) to earn rich snippets in Google.
 *
 * Grounded only: no invented ratings/reviews. Offers use real variant prices. */

export function buildProductJsonLd(
  p: NormalizedProduct,
  storeBaseUrl: string,
  config: AppConfig,
): Record<string, unknown> {
  const handle = p.seo?.handle ?? p.originalHandle;
  const url = `${storeBaseUrl.replace(/\/$/, "")}/products/${handle}`;
  const images = p.images.map((i) => i.src).slice(0, 10);
  const description = (p.seo?.summaryText || htmlToText(p.originalBodyHtml)).slice(0, 5000);

  const prices = p.variants
    .map((v) => Number(v.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  const low = prices.length ? Math.min(...prices) : undefined;
  const high = prices.length ? Math.max(...prices) : undefined;
  const availability = p.facets.inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const offers =
    low !== undefined
      ? low === high
        ? {
            "@type": "Offer",
            price: low.toFixed(2),
            priceCurrency: config.currency,
            availability,
            url,
          }
        : {
            "@type": "AggregateOffer",
            lowPrice: low!.toFixed(2),
            highPrice: high!.toFixed(2),
            priceCurrency: config.currency,
            offerCount: p.variants.length,
            availability,
            url,
          }
      : undefined;

  const jsonld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: p.seo?.seoTitle?.split(" | ")[0] ?? p.title,
    description,
    image: images,
    sku: p.variants[0]?.sku || undefined,
    brand: p.vendor
      ? { "@type": "Brand", name: p.vendor }
      : { "@type": "Brand", name: config.shopName },
    url,
  };
  if (offers) jsonld.offers = offers;
  // Strip undefined for clean output.
  return JSON.parse(JSON.stringify(jsonld));
}

/** A <script type="application/ld+json"> string ready to paste into a theme. */
export function jsonLdScriptTag(obj: Record<string, unknown>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}
