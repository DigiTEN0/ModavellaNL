import { readFileSync, existsSync } from "node:fs";
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

## Merk & toon-of-voice — ${shop}
${shop} is een premium maar toegankelijk fashion-merk dat rust, kwaliteit en betrouwbaarheid
uitstraalt. Schrijf consequent zo (dit geldt voor élk product):
- **Rustig, zelfverzekerd, concreet.** Korte, krachtige zinnen. Toon in plaats van roep.
- **Klantgericht:** benoem wat de klant merkt — pasvorm, draagcomfort, materiaalgevoel,
  gelegenheid en combineerbaarheid — in plaats van holle bijvoeglijke naamwoorden.
- **Vertrouwd & gevestigd:** schrijf alsof het merk al jaren bestaat; kalm en verzorgd.
- ${lang}, vlot en natuurlijk, in de je/jij-vorm.
- **Verboden clichés** (nooit gebruiken): "hoogwaardige kwaliteit", "een echte must-have",
  "perfect voor elke gelegenheid", "of je nu ... of ...", "look no further", holle
  superlatieven en uitroeptekens-spam. Geen merknamen van derden — alleen ${shop}.

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
6. **Strip bronruis & corrigeer fouten.** Neem NOOIT nep-urgentie of garantie-spam over
   ("uitverkoop eindigt vanavond", "wees er snel bij", "op=op", aftelklokken, "geld terug",
   "100% garantie"). Gebruik altijd de échte productnaam uit \`title\` — niet een naam die
   per ongeluk in \`sourceText\` staat (bronwinkels maken copy-paste-fouten). Leid materiaal
   alleen af als het écht het materiaal is, niet uit styling-tips ("combineer met jeans").

## Werkwijze — ALLE producten, hervatbaar
Het doel is om **elk** product in \`seo-batch.jsonl\` te verwerken, niet een selectie.

1. Lees zo nodig eerst \`seo-batch.out.jsonl\` (als die bestaat) en verzamel de \`id\`'s die
   al gedaan zijn. **Sla die over** — zo is het proces hervatbaar en dubbel-veilig.
2. Verwerk de resterende regels in blokken van ~40 tegelijk.
3. **Append** je resultaten regel-voor-regel aan \`seo-batch.out.jsonl\` (niet overschrijven).
4. Ga door met het volgende blok tot er niets meer resteert.
5. Controleer voortgang met: \`npm run cli -- seo:status --in ./output\`

Als de sessie tussentijds stopt: start deze opdracht simpelweg opnieuw. Dankzij stap 1
pakt hij automatisch verder waar hij gebleven was.

Klaar (0 resterend)? Draai dan:
\`npm run cli -- seo:apply --in ./output --batch ./output/seo-batch.out.jsonl\`
`;
}

/** Collect the set of product ids present in a JSONL file (one object/line). */
function idsInJsonl(path: string): Set<number> {
  const ids = new Set<number>();
  if (!existsSync(path)) return ids;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as { id?: number };
      if (typeof obj.id === "number") ids.add(obj.id);
    } catch {
      /* skip malformed line */
    }
  }
  return ids;
}

export interface BatchStatus {
  total: number;
  done: number;
  remaining: number;
  remainingIds: number[];
}

/** Compare the input batch against the output file to report progress. */
export function batchStatus(batchPath: string, outPath: string): BatchStatus {
  const total = idsInJsonl(batchPath);
  const done = idsInJsonl(outPath);
  const remainingIds: number[] = [];
  for (const id of total) if (!done.has(id)) remainingIds.push(id);
  return {
    total: total.size,
    done: [...done].filter((id) => total.has(id)).length,
    remaining: remainingIds.length,
    remainingIds,
  };
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
