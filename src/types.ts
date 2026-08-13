/**
 * Type definitions for the Modavella catalog importer.
 *
 * There are two layers:
 *  1. "Raw" types that mirror exactly what Shopify's public JSON endpoints
 *     return (/products.json, /collections.json). We keep these faithful so
 *     nothing is lost in translation — this is what gives us high accuracy.
 *  2. "Normalized" types: our clean internal model that the SEO engine and
 *     exporters operate on. Every raw field we care about is carried through.
 */

/* ───────────────────────── Raw Shopify shapes ───────────────────────── */

export interface RawShopifyImage {
  id: number;
  product_id: number;
  position: number;
  src: string;
  width?: number;
  height?: number;
  alt?: string | null;
  variant_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface RawShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  sku?: string | null;
  requires_shipping?: boolean;
  taxable?: boolean;
  featured_image?: RawShopifyImage | null;
  available?: boolean;
  price: string;
  grams?: number;
  compare_at_price?: string | null;
  position?: number;
  barcode?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RawShopifyOption {
  name: string;
  position: number;
  values: string[];
}

export interface RawShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  variants: RawShopifyVariant[];
  images: RawShopifyImage[];
  options: RawShopifyOption[];
}

export interface RawShopifyCollection {
  id: number;
  title: string;
  handle: string;
  description?: string;
  published_at?: string | null;
  updated_at?: string;
  image?: { src: string; alt?: string | null } | null;
  products_count?: number;
}

/* ───────────────────────── Normalized model ───────────────────────── */

export interface NormalizedImage {
  src: string;
  position: number;
  alt: string;
  width?: number;
  height?: number;
  /** Source variant ids this image is attached to (for Variant Image mapping). */
  variantIds: number[];
}

export interface NormalizedVariant {
  sourceId: number;
  title: string;
  /** Option values in order (matches product.options). */
  optionValues: string[];
  sku: string;
  price: string;
  compareAtPrice: string;
  grams: number;
  available: boolean;
  requiresShipping: boolean;
  taxable: boolean;
  barcode: string;
  /** Image src attached to this specific variant, if any. */
  variantImageSrc: string;
}

export interface SeoFields {
  /** URL handle / slug (clean, unique). */
  handle: string;
  /** <title> / meta title. */
  seoTitle: string;
  /** meta description. */
  metaDescription: string;
  /** Enhanced, sanitized product description HTML. */
  bodyHtml: string;
  /** Plain-text summary derived from the description (for batch review). */
  summaryText: string;
  /** How this SEO was produced: 'engine' (deterministic) or 'claude' (batch). */
  source: "engine" | "claude";
}

export interface NormalizedProduct {
  sourceId: number;
  /** Original handle from the source store (kept for reference/redirects). */
  originalHandle: string;
  title: string;
  vendor: string;
  productType: string;
  /** Original body HTML from the source (sanitized, before enhancement). */
  originalBodyHtml: string;
  tags: string[];
  options: { name: string; values: string[] }[];
  variants: NormalizedVariant[];
  images: NormalizedImage[];
  publishedAt: string;
  /** Handles of source collections this product belongs to. */
  collectionHandles: string[];
  /** Derived facets used by the SEO engine (colors, sizes, materials, ...). */
  facets: ProductFacets;
  /** Populated by the SEO engine. */
  seo?: SeoFields;
}

export interface ProductFacets {
  colors: string[];
  sizes: string[];
  materials: string[];
  /** Lowest and highest variant price, formatted. */
  priceMin: string;
  priceMax: string;
  currencyGuess: string;
  inStock: boolean;
}

export interface NormalizedCollection {
  sourceId: number;
  handle: string;
  title: string;
  description: string;
  /** number of products we actually captured for this collection */
  productCount: number;
  /** the tag we assign to member products so a smart collection can rebuild it */
  tag: string;
}

export interface Catalog {
  source: {
    baseUrl: string;
    scrapedAt: string;
    platform: "shopify";
  };
  products: NormalizedProduct[];
  collections: NormalizedCollection[];
}

export interface AppConfig {
  shopName: string;
  locale: "nl" | "en";
  currency: string;
  scrapeDelayMs: number;
  scrapeConcurrency: number;
  scrapeMaxRetries: number;
  userAgent: string;
  trust: {
    shipping: string;
    returns: string;
    service: string;
  };
}
