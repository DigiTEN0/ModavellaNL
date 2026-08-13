import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { normalizeCatalog } from "../scrape/shopify.js";
import { runSeoEngine } from "../seo/engine.js";
import { buildShopifyCsv, SHOPIFY_COLUMNS } from "../export/shopifyCsv.js";
import { buildCollectionsCsv } from "../export/collectionsCsv.js";
import { buildProductJsonLd } from "../seo/jsonld.js";
import { buildBatchJsonl, applyBatchOutput } from "../seo/claudeBatch.js";
import { buildReport } from "../report.js";
import type { AppConfig, RawShopifyCollection, RawShopifyProduct } from "../types.js";

const FIX = resolve(process.cwd(), "fixtures");
const rawProducts = JSON.parse(readFileSync(join(FIX, "products.json"), "utf8")) as RawShopifyProduct[];
const rawCollections = JSON.parse(readFileSync(join(FIX, "collections.json"), "utf8")) as RawShopifyCollection[];
const colProducts = JSON.parse(readFileSync(join(FIX, "collection-products.json"), "utf8")) as Record<string, number[]>;

const config: AppConfig = {
  shopName: "Modavella",
  locale: "nl",
  currency: "EUR",
  vendorName: "Modavella",
  keepSourceVendor: false,
  brandScrub: true,
  sourceBrands: ["Nora Mae"],
  scrapeDelayMs: 0,
  scrapeConcurrency: 3,
  scrapeMaxRetries: 2,
  userAgent: "test",
  trust: { shipping: "Gratis verzending vanaf €50", returns: "30 dagen retour", service: "" },
};

function buildCatalog() {
  const membership = new Map<number, Set<string>>();
  const counts = new Map<string, number>();
  for (const [handle, ids] of Object.entries(colProducts)) {
    counts.set(handle, ids.length);
    for (const id of ids) {
      let s = membership.get(id);
      if (!s) membership.set(id, (s = new Set()));
      s.add(handle);
    }
  }
  const catalog = normalizeCatalog("https://bron.example.com", rawProducts, rawCollections, membership, counts);
  runSeoEngine(catalog, config);
  return catalog;
}

/** Minimal CSV row splitter that respects quoted fields (for assertions). */
function splitCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const body = csv.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").length);
}

test("sanitizer strips scripts/handlers but keeps the size table", () => {
  const cat = buildCatalog();
  const p1 = cat.products.find((p) => p.sourceId === 1001)!;
  assert.ok(!/<script/i.test(p1.originalBodyHtml), "no <script>");
  assert.ok(!/onclick/i.test(p1.originalBodyHtml), "no onclick handler");
  assert.ok(!/alert\(/i.test(p1.originalBodyHtml), "no alert() body left");
  assert.ok(/<table/i.test(p1.originalBodyHtml), "size table preserved");
  assert.ok(!/style=/i.test(p1.originalBodyHtml), "inline style stripped");
});

test("facets extract colours, sizes and materials from real data", () => {
  const cat = buildCatalog();
  const p1 = cat.products.find((p) => p.sourceId === 1001)!;
  assert.deepEqual(p1.facets.colors, ["Wit", "Zwart"]);
  assert.deepEqual(p1.facets.sizes, ["38", "39", "40"]);
  const p3 = cat.products.find((p) => p.sourceId === 1003)!;
  assert.ok(p3.facets.materials.includes("wol"));
  assert.ok(p3.facets.materials.includes("polyester"));
  assert.equal(p3.facets.priceMin, "199.95");
});

test("rebrand: vendor overridden to shop, source brand scrubbed from copy", () => {
  const cat = buildCatalog();
  // Vendor override on every product (source was "Nora-Mae").
  for (const p of cat.products) assert.equal(p.vendor, "Modavella");
  // Brand mention removed/replaced in the description, image URLs untouched.
  const p3 = cat.products.find((p) => p.sourceId === 1003)!;
  assert.ok(!/Nora[\s-]?Mae/i.test(p3.seo!.bodyHtml), "brand scrubbed from body");
  assert.ok(/Ontworpen door Modavella/i.test(p3.seo!.bodyHtml), "brand replaced with shop name");
  assert.ok(p3.images.every((i) => i.src.startsWith("https://cdn.example.com/")), "image URLs intact");
  // No "Merk: Nora-Mae" leaking into any enhanced description.
  for (const p of cat.products) assert.ok(!/Nora/i.test(p.seo!.bodyHtml), "no brand leak in features");
});

test("collection membership becomes tags (category preserved)", () => {
  const cat = buildCatalog();
  const p1 = cat.products.find((p) => p.sourceId === 1001)!;
  assert.ok(p1.tags.includes("collectie:dames-schoenen"));
  assert.ok(p1.tags.includes("collectie:sale"));
  assert.ok(p1.tags.includes("Dames Schoenen"));
  assert.ok(p1.tags.includes("Sale"));
  assert.deepEqual(new Set(p1.collectionHandles), new Set(["dames-schoenen", "sale"]));
});

test("SEO: handles unique, titles within limit, meta unique and in window", () => {
  const cat = buildCatalog();
  const handles = cat.products.map((p) => p.seo!.handle);
  assert.equal(new Set(handles).size, handles.length, "handles unique");
  for (const p of cat.products) {
    assert.ok(p.seo!.seoTitle.length <= 62, `title <=62: ${p.seo!.seoTitle}`);
    assert.ok(p.seo!.seoTitle.endsWith("| Modavella"), "brand suffix");
    assert.ok(p.seo!.metaDescription.length <= 160, `meta <=160 (${p.seo!.metaDescription.length})`);
    assert.ok(p.seo!.metaDescription.length >= 110, `meta not tiny (${p.seo!.metaDescription.length})`);
  }
  const metas = cat.products.map((p) => p.seo!.metaDescription);
  assert.equal(new Set(metas).size, metas.length, "meta descriptions unique");
});

test("enhanced description: thin source gets intro + features; rich source is kept", () => {
  const cat = buildCatalog();
  const p2 = cat.products.find((p) => p.sourceId === 1002)!; // thin
  assert.ok(p2.seo!.bodyHtml.includes("<h3>Kenmerken</h3>"), "features block");
  assert.ok(/Chelsea Boots Noir/i.test(p2.seo!.bodyHtml), "intro mentions product");
  const p3 = cat.products.find((p) => p.sourceId === 1003)!; // rich
  assert.ok(p3.seo!.bodyHtml.includes("garderobe-klassieker"), "original copy retained");
});

test("Shopify CSV: correct header, multi-row variants+images, SEO cells", () => {
  const cat = buildCatalog();
  const csv = buildShopifyCsv(cat);
  const rows = splitCsvRows(csv);
  assert.deepEqual(rows[0], SHOPIFY_COLUMNS, "header matches");
  const idx = Object.fromEntries(SHOPIFY_COLUMNS.map((c, i) => [c, i]));
  const p1Rows = rows.slice(1).filter((r) => r[idx["Handle"]!] === "dames-sneaker-bloom-white");
  // product1: max(3 variants, 2 images) = 3 rows
  assert.equal(p1Rows.length, 3, "3 rows for product 1");
  const primary = p1Rows[0]!;
  assert.ok(primary[idx["SEO Title"]!]!.length > 0, "SEO title present on primary row");
  assert.ok(primary[idx["SEO Description"]!]!.length > 0, "SEO description present");
  assert.equal(primary[idx["Image Position"]!], "1");
  assert.equal(primary[idx["Option1 Value"]!], "Wit");
  assert.equal(p1Rows[1]![idx["Image Position"]!], "2", "second image row");
  // additional variant rows must NOT repeat the title
  assert.equal(p1Rows[1]![idx["Title"]!], "", "no repeated product title");
});

test("smart-collections CSV: one rule per non-empty collection, empties excluded", () => {
  const cat = buildCatalog();
  const csv = buildCollectionsCsv(cat, config);
  assert.ok(csv.includes("collectie:dames-schoenen"));
  assert.ok(csv.includes("collectie:dames-jassen"));
  assert.ok(csv.includes("collectie:sale"));
  assert.ok(!csv.includes("lege-collectie"), "empty collection excluded");
  assert.ok(csv.includes("Smart"), "smart collection type");
});

test("JSON-LD: AggregateOffer with real prices and currency", () => {
  const cat = buildCatalog();
  const p1 = cat.products.find((p) => p.sourceId === 1001)!;
  const ld = buildProductJsonLd(p1, cat.source.baseUrl, config) as any;
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.offers["@type"], "Offer"); // all variants 89.95 → single Offer
  assert.equal(ld.offers.priceCurrency, "EUR");
  const p3 = cat.products.find((p) => p.sourceId === 1003)!;
  const ld3 = buildProductJsonLd(p3, cat.source.baseUrl, config) as any;
  assert.equal(ld3.offers.price ?? ld3.offers.lowPrice, "199.95");
});

test("Claude batch: export lines == products; apply merges + sanitizes", () => {
  const cat = buildCatalog();
  const jsonl = buildBatchJsonl(cat);
  const lines = jsonl.trim().split("\n");
  assert.equal(lines.length, cat.products.length);

  const dir = mkdtempSync(join(tmpdir(), "mv-"));
  const outPath = join(dir, "out.jsonl");
  writeFileSync(
    outPath,
    JSON.stringify({
      id: 1001,
      seoTitle: "Handgemaakte Leren Sneaker | Modavella",
      metaDescription: "Premium leren dames sneaker, wit en zwart, maat 38 t/m 40. Gratis verzending vanaf 50 euro en 30 dagen retour bij Modavella.",
      bodyHtml: "<p>Premium sneaker.</p><script>evil()</script><h3>Kenmerken</h3><ul><li>Leer</li></ul>",
    }) + "\n",
    "utf8",
  );
  const applied = applyBatchOutput(cat, outPath);
  assert.equal(applied, 1);
  const p1 = cat.products.find((p) => p.sourceId === 1001)!;
  assert.equal(p1.seo!.source, "claude");
  assert.ok(p1.seo!.seoTitle.startsWith("Handgemaakte"));
  assert.ok(!/<script/i.test(p1.seo!.bodyHtml), "applied HTML sanitized");
});

test("report: zero duplicate handles, correct counts", () => {
  const cat = buildCatalog();
  const r = buildReport(cat);
  assert.equal(r.products, 3);
  assert.equal(r.seo.duplicateHandles, 0);
  assert.equal(r.orphanProducts, 0);
  assert.equal(r.collections, 4);
  assert.equal(r.collectionsWithProducts, 3);
  assert.equal(r.variants, 10);
});
