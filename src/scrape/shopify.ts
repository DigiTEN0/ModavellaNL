import { fetchJson, type HttpOptions } from "../util/http.js";
import { log, progress } from "../util/log.js";
import { sanitizeHtml } from "../util/html.js";
import { dedupeCI } from "../util/text.js";
import { extractFacets } from "../seo/facets.js";
import type {
  AppConfig,
  Catalog,
  NormalizedCollection,
  NormalizedImage,
  NormalizedProduct,
  NormalizedVariant,
  RawShopifyCollection,
  RawShopifyProduct,
} from "../types.js";

const PAGE_LIMIT = 250; // Shopify max per page
const SAFETY_MAX_PAGES = 400; // 400 * 250 = 100k products hard ceiling

/** Normalize whatever the user pasted into a clean https origin. */
export function normalizeBaseUrl(input: string): string {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  const u = new URL(raw);
  u.protocol = "https:";
  u.pathname = "";
  u.search = "";
  u.hash = "";
  return u.origin;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Confirm the URL is a reachable Shopify store exposing products.json. */
export async function detectShopify(
  baseUrl: string,
  http: HttpOptions,
): Promise<{ ok: boolean; reason?: string }> {
  const { status, data } = await fetchJson<{ products?: unknown[] }>(
    `${baseUrl}/products.json?limit=1`,
    http,
  );
  if (status === 200 && data && Array.isArray(data.products)) return { ok: true };
  if (status === 404) {
    return { ok: false, reason: "products.json niet gevonden — winkel is mogelijk niet (meer) Shopify of heeft de JSON-endpoint uitgezet." };
  }
  if (status === 401 || status === 403) {
    return { ok: false, reason: `Toegang geweigerd (HTTP ${status}) — de winkel blokkeert publieke JSON-toegang.` };
  }
  return { ok: false, reason: `Onverwachte respons (HTTP ${status}).` };
}

async function fetchPaginated<T>(
  makeUrl: (page: number) => string,
  extract: (payload: unknown) => T[],
  http: HttpOptions,
  delayMs: number,
  label: string,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= SAFETY_MAX_PAGES; page++) {
    const { status, data } = await fetchJson<unknown>(makeUrl(page), http);
    if (status !== 200 || !data) break;
    const batch = extract(data);
    if (batch.length === 0) break;
    all.push(...batch);
    log.info(`${label}: ${all.length} opgehaald (pagina ${page})`);
    if (batch.length < PAGE_LIMIT) break;
    if (delayMs) await sleep(delayMs);
  }
  return all;
}

/** Fetch the full product catalogue via /products.json. */
async function fetchAllProducts(baseUrl: string, http: HttpOptions, delayMs: number) {
  return fetchPaginated<RawShopifyProduct>(
    (page) => `${baseUrl}/products.json?limit=${PAGE_LIMIT}&page=${page}`,
    (p) => (p as { products?: RawShopifyProduct[] }).products ?? [],
    http,
    delayMs,
    "Producten",
  );
}

/** Fetch all published collections via /collections.json. */
async function fetchAllCollections(baseUrl: string, http: HttpOptions, delayMs: number) {
  return fetchPaginated<RawShopifyCollection>(
    (page) => `${baseUrl}/collections.json?limit=${PAGE_LIMIT}&page=${page}`,
    (p) => (p as { collections?: RawShopifyCollection[] }).collections ?? [],
    http,
    delayMs,
    "Collecties",
  );
}

/** Fetch the product ids that belong to one collection (preserves category). */
async function fetchCollectionProductIds(
  baseUrl: string,
  handle: string,
  http: HttpOptions,
  delayMs: number,
): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= SAFETY_MAX_PAGES; page++) {
    const { status, data } = await fetchJson<{ products?: RawShopifyProduct[] }>(
      `${baseUrl}/collections/${encodeURIComponent(handle)}/products.json?limit=${PAGE_LIMIT}&page=${page}`,
      http,
    );
    if (status !== 200 || !data || !Array.isArray(data.products)) break;
    const batch = data.products;
    if (batch.length === 0) break;
    for (const p of batch) ids.push(p.id);
    if (batch.length < PAGE_LIMIT) break;
    if (delayMs) await sleep(delayMs);
  }
  return ids;
}

/** Run async tasks with a fixed concurrency limit. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function toStringTags(tags: RawShopifyProduct["tags"]): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

function normalizeImages(raw: RawShopifyProduct): NormalizedImage[] {
  return (raw.images ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((img) => ({
      src: img.src,
      position: img.position ?? 0,
      alt: (img.alt ?? "").trim(),
      width: img.width,
      height: img.height,
      variantIds: img.variant_ids ?? [],
    }));
}

function normalizeVariants(raw: RawShopifyProduct): NormalizedVariant[] {
  const imgById = new Map<number, string>();
  for (const img of raw.images ?? []) {
    for (const vid of img.variant_ids ?? []) imgById.set(vid, img.src);
  }
  return (raw.variants ?? []).map((v) => {
    const optionValues = [v.option1, v.option2, v.option3]
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    return {
      sourceId: v.id,
      title: v.title,
      optionValues,
      sku: (v.sku ?? "").trim(),
      price: (v.price ?? "0").toString(),
      compareAtPrice: (v.compare_at_price ?? "").toString(),
      grams: v.grams ?? 0,
      available: v.available !== false,
      requiresShipping: v.requires_shipping !== false,
      taxable: v.taxable !== false,
      barcode: (v.barcode ?? "").trim(),
      variantImageSrc: v.featured_image?.src ?? imgById.get(v.id) ?? "",
    };
  });
}

/** Full scrape: products + collections + membership, all normalized. */
export async function scrapeShopify(baseUrl: string, config: AppConfig): Promise<Catalog> {
  const http: HttpOptions = {
    userAgent: config.userAgent,
    maxRetries: config.scrapeMaxRetries,
  };

  log.step("1/3  Producten ophalen");
  const rawProducts = await fetchAllProducts(baseUrl, http, config.scrapeDelayMs);
  log.ok(`${rawProducts.length} producten opgehaald`);

  log.step("2/3  Collecties ophalen");
  const rawCollections = await fetchAllCollections(baseUrl, http, config.scrapeDelayMs);
  log.ok(`${rawCollections.length} collecties gevonden`);

  log.step("3/3  Producten per collectie koppelen (categorie-behoud)");
  // productId -> set of collection handles
  const membership = new Map<number, Set<string>>();
  const collectionCounts = new Map<string, number>();
  let done = 0;
  await mapLimit(rawCollections, config.scrapeConcurrency, async (col) => {
    const ids = await fetchCollectionProductIds(baseUrl, col.handle, http, config.scrapeDelayMs);
    collectionCounts.set(col.handle, ids.length);
    for (const id of ids) {
      let set = membership.get(id);
      if (!set) membership.set(id, (set = new Set()));
      set.add(col.handle);
    }
    progress(++done, rawCollections.length, `collectie: ${col.handle}`);
  });

  return normalizeCatalog(baseUrl, rawProducts, rawCollections, membership, collectionCounts);
}

/**
 * Pure normalization: turns raw Shopify payloads + a membership map into a
 * clean Catalog. Extracted so it can be unit-tested without any network access.
 */
export function normalizeCatalog(
  baseUrl: string,
  rawProducts: RawShopifyProduct[],
  rawCollections: RawShopifyCollection[],
  membership: Map<number, Set<string>>,
  collectionCounts: Map<string, number>,
): Catalog {
  const products: NormalizedProduct[] = rawProducts.map((raw) => {
    const images = normalizeImages(raw);
    const variants = normalizeVariants(raw);
    const options = (raw.options ?? []).map((o) => ({ name: o.name, values: o.values }));
    const cleanBody = sanitizeHtml(raw.body_html);
    const collectionHandles = Array.from(membership.get(raw.id) ?? []);
    const product: NormalizedProduct = {
      sourceId: raw.id,
      originalHandle: raw.handle,
      title: raw.title.trim(),
      vendor: (raw.vendor ?? "").trim(),
      productType: (raw.product_type ?? "").trim(),
      originalBodyHtml: cleanBody,
      tags: dedupeCI(toStringTags(raw.tags)),
      options,
      variants,
      images,
      publishedAt: raw.published_at ?? "",
      collectionHandles,
      facets: extractFacets({ options, variants, bodyHtml: cleanBody, productType: raw.product_type ?? "" }),
    };
    return product;
  });

  const collections: NormalizedCollection[] = rawCollections.map((c) => ({
    sourceId: c.id,
    handle: c.handle,
    title: c.title.trim(),
    description: sanitizeHtml(c.description ?? ""),
    productCount: collectionCounts.get(c.handle) ?? 0,
    tag: `collectie:${c.handle}`,
  }));

  return {
    source: { baseUrl, scrapedAt: new Date().toISOString(), platform: "shopify" },
    products,
    collections,
  };
}
