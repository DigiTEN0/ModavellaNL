import { readFileSync } from "node:fs";
import { htmlToText, sanitizeHtml } from "../util/html.js";
import { log } from "../util/log.js";
import type { AppConfig, Catalog } from "../types.js";

/* Claude-Code batch mode — premium copy WITHOUT an API key.
 *
 * Flow:
 *   1. `export`  → writes seo-batch.jsonl (one product per line) + PROMPT.md.
 *   2. You open a Claude Code session, point it at PROMPT.md + a slice of the
 *      batch, and Claude writes premium copy into seo-batch.out.jsonl.
 *   3. `apply`   → merges that output back onto the catalogue and re-exports.
 *
 * The deterministic engine already filled every field, so this pass is purely
 * an upgrade for the products you choose (e.g. hero/bestsellers first). */

export interface BatchLine {
  id: number;
  handle: string;
  title: string;
  productType: string;
  vendor: string;
  collections: string[];
  colors: string[];
  sizes: string[];
  materials: string[];
  priceMin: string;
  priceMax: string;
  currentSeoTitle: string;
  currentMetaDescription: string;
  sourceText: string;
}

export function buildBatchJsonl(catalog: Catalog): string {
  const lines: string[] = [];
  const byHandle = new Map(catalog.collections.map((c) => [c.handle, c.title]));
  for (const p of catalog.products) {
    const line: BatchLine = {
      id: p.sourceId,
      handle: p.seo?.handle ?? p.originalHandle,
      title: p.title,
      productType: p.productType,
      vendor: p.vendor,
      collections: p.collectionHandles.map((h) => byHandle.get(h) ?? h),
      colors: p.facets.colors,
      sizes: p.facets.sizes,
      materials: p.facets.materials,
      priceMin: p.facets.priceMin,
      priceMax: p.facets.priceMax,
      currentSeoTitle: p.seo?.seoTitle ?? "",
      currentMetaDescription: p.seo?.metaDescription ?? "",
      sourceText: htmlToText(p.originalBodyHtml).slice(0, 1200),
    };
    lines.push(JSON.stringify(line));
  }
  return lines.join("\n") + "\n";
}

export function buildBatchPrompt(config: AppConfig): string {
  const shop = config.shopName;
  const lang = config.locale === "nl" ? "Nederlands" : "English";
  return `# ${shop} — SEO copy opdracht (voor Claude Code)

Je bent seniorcopywriter + SEO-specialist voor **${shop}**, een premium fashion-webshop.
Je herschrijft productteksten zodat de winkel "gevestigd en vertrouwd" oogt en hoger rankt.

## Invoer
Elke regel in \`seo-batch.jsonl\` is één product als JSON met o.a.:
\`id, handle, title, productType, vendor, collections, colors, sizes, materials, priceMin, priceMax, currentSeoTitle, currentMetaDescription, sourceText\`.

## Opdracht
Schrijf per product **nieuwe** velden in ${lang}. Schrijf naar \`seo-batch.out.jsonl\`,
één JSON-object per regel, met exact deze sleutels:

\`\`\`json
{"id": 123, "seoTitle": "...", "metaDescription": "...", "bodyHtml": "..."}
\`\`\`

### Harde regels (niet overtreden)
1. **Geen verzinsels.** Gebruik alléén feiten uit de invoer (materialen, kleuren, maten,
   type). Verzin geen materiaal, herkomst, technologie of keurmerk dat er niet staat.
2. **seoTitle**: max 60 tekens, belangrijkste zoekwoord vooraan, eindig met \` | ${shop}\`.
3. **metaDescription**: 140–158 tekens, uniek per product, actieve tone-of-voice,
   één concrete USP + zachte call-to-action. Geen keyword-stuffing.
4. **bodyHtml**: nette, semantische HTML. Toegestane tags: p, ul, ol, li, strong, em,
   h2, h3, table, thead, tbody, tr, td, th, br. **Geen** \`<script>\`, \`<style>\`,
   \`<iframe>\`, inline \`style=\`, of \`on...=\` handlers.
   - Begin met 1–2 pakkende zinnen (concreet, geen clichés als "hoogwaardige kwaliteit").
   - Voeg een \`<h3>Kenmerken</h3>\` met \`<ul>\` toe op basis van de feiten.
   - Behoud een eventuele maattabel uit \`sourceText\` als \`<table>\`.
   - Schrijf verkopend maar eerlijk; premium, rustig, zelfverzekerd.
5. **Toon**: geen AI-clichés, geen overdrijving, geen uitroeptekens-spam. Denk aan een
   gevestigd merk dat rustig zijn kwaliteit laat zien.

## Werkwijze
- Verwerk in batches (bijv. 25–50 regels tegelijk) zodat het beheersbaar blijft.
- Begin met de belangrijkste producten (bestsellers/hero's), de rest kan later.
- Producten die je niet herschrijft, houden automatisch de sterke deterministische
  SEO uit de engine — je hoeft dus niet alles te doen.

Klaar? Draai daarna: \`npm run cli -- seo:apply --in ./output --batch ./output/seo-batch.out.jsonl\`
`;
}

/** Merge Claude's output back onto the catalogue. Returns count applied. */
export function applyBatchOutput(catalog: Catalog, outFilePath: string): number {
  const raw = readFileSync(outFilePath, "utf8");
  const byId = new Map(catalog.products.map((p) => [p.sourceId, p]));
  let applied = 0;
  let lineNo = 0;
  for (const line of raw.split(/\r?\n/)) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: { id?: number; seoTitle?: string; metaDescription?: string; bodyHtml?: string };
    try {
      obj = JSON.parse(trimmed);
    } catch {
      log.warn(`Regel ${lineNo}: ongeldige JSON, overgeslagen`);
      continue;
    }
    if (obj.id === undefined) {
      log.warn(`Regel ${lineNo}: geen "id", overgeslagen`);
      continue;
    }
    const product = byId.get(obj.id);
    if (!product || !product.seo) {
      log.warn(`Regel ${lineNo}: product id ${obj.id} niet gevonden, overgeslagen`);
      continue;
    }
    if (obj.seoTitle) product.seo.seoTitle = obj.seoTitle.trim();
    if (obj.metaDescription) product.seo.metaDescription = obj.metaDescription.trim();
    if (obj.bodyHtml) {
      // Never trust incoming HTML blindly — sanitize with the same allowlist.
      product.seo.bodyHtml = sanitizeHtml(obj.bodyHtml);
      product.seo.summaryText = htmlToText(product.seo.bodyHtml).slice(0, 400);
    }
    product.seo.source = "claude";
    applied++;
  }
  return applied;
}
