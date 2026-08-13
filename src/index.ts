#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { log } from "./util/log.js";
import { normalizeBaseUrl, detectShopify, scrapeShopify } from "./scrape/shopify.js";
import { runSeoEngine } from "./seo/engine.js";
import { buildShopifyCsv } from "./export/shopifyCsv.js";
import { buildCollectionsCsv } from "./export/collectionsCsv.js";
import { downloadImages } from "./export/images.js";
import { buildProductJsonLd } from "./seo/jsonld.js";
import { buildBatchJsonl, buildBatchPrompt, applyBatchOutput, batchStatus } from "./seo/claudeBatch.js";
import { buildReport, reportToMarkdown } from "./report.js";
import type { AppConfig, Catalog } from "./types.js";

const HELP = `
Modavella Catalog Importer + SEO Booster

Gebruik:
  modavella <command> [opties]

Commands:
  scrape     --url <winkel-url> [--out ./output]
             Scrape de Shopify-bronwinkel → output/catalog.json

  build      [--in ./output] [--out ./output] [--download-images]
             Draai de SEO-engine + schrijf alle importbestanden.

  all        --url <winkel-url> [--out ./output] [--download-images]
             scrape + build in één keer.

  seo:batch  [--in ./output] [--out ./output]
             Exporteer seo-batch.jsonl + PROMPT.md voor premium copy via Claude Code.

  seo:status [--in ./output]
             Toon voortgang van de Claude-batch (klaar / resterend).

  seo:apply  [--in ./output] --batch <seo-batch.out.jsonl>
             Voeg door Claude geschreven copy terug in en her-exporteer.

  verify     [--in ./output]
             Toon het kwaliteits-/accuratesse-rapport.

Opties:
  --url               URL van de Shopify-bronwinkel (bv. https://voorbeeld.com)
  --in                Map met catalog.json (default ./output)
  --out               Uitvoermap (default ./output)
  --download-images   Download alle afbeeldingen lokaal (optioneel)
  --help              Toon deze hulp

Voorbeeld:
  npm run build && npm run cli -- all --url https://bronwinkel.com --out ./output
`;

async function saveCatalog(catalog: Catalog, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
}

async function loadCatalog(dir: string): Promise<Catalog> {
  const p = join(dir, "catalog.json");
  if (!existsSync(p)) {
    throw new Error(`catalog.json niet gevonden in ${dir}. Draai eerst "scrape".`);
  }
  return JSON.parse(await readFile(p, "utf8")) as Catalog;
}

async function writeExports(catalog: Catalog, outDir: string, config: AppConfig): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "seo"), { recursive: true });

  // 1. Native Shopify product CSV
  await writeFile(join(outDir, "products.csv"), buildShopifyCsv(catalog), "utf8");
  log.ok(`products.csv geschreven (${catalog.products.length} producten)`);

  // 2. Smart-collections CSV (categorie-behoud)
  await writeFile(join(outDir, "smart-collections.csv"), buildCollectionsCsv(catalog, config), "utf8");
  const nonEmpty = catalog.collections.filter((c) => c.productCount > 0).length;
  log.ok(`smart-collections.csv geschreven (${nonEmpty} collecties)`);

  // 3. Structured data (JSON-LD) as NDJSON, keyed by handle
  const jsonldLines = catalog.products
    .map((p) => JSON.stringify({ handle: p.seo?.handle ?? p.originalHandle, jsonld: buildProductJsonLd(p, catalog.source.baseUrl, config) }))
    .join("\n");
  await writeFile(join(outDir, "seo", "structured-data.jsonl"), jsonldLines + "\n", "utf8");
  log.ok(`seo/structured-data.jsonl geschreven`);

  // 4. Report
  const report = buildReport(catalog);
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(outDir, "report.md"), reportToMarkdown(report), "utf8");
  log.ok(`report.md / report.json geschreven`);
}

async function cmdScrape(config: AppConfig, url: string, outDir: string): Promise<Catalog> {
  const base = normalizeBaseUrl(url);
  log.step(`Bron detecteren: ${base}`);
  const det = await detectShopify(base, { userAgent: config.userAgent, maxRetries: config.scrapeMaxRetries });
  if (!det.ok) {
    throw new Error(`Dit lijkt geen scrapebare Shopify-winkel: ${det.reason}`);
  }
  log.ok("Shopify-winkel bevestigd");
  const catalog = await scrapeShopify(base, config);
  await saveCatalog(catalog, outDir);
  log.ok(`catalog.json opgeslagen in ${outDir}`);
  return catalog;
}

async function cmdBuild(config: AppConfig, inDir: string, outDir: string, downloadImagesFlag: boolean): Promise<void> {
  const catalog = await loadCatalog(inDir);
  log.step("SEO-engine draaien");
  const stats = runSeoEngine(catalog, config);
  log.ok(`SEO klaar: ${stats.products} producten, ${stats.uniqueHandles} unieke handles, ${stats.collectionsTagged} met collectie-tags`);
  await saveCatalog(catalog, outDir); // persist with seo fields
  await writeExports(catalog, outDir, config);

  if (downloadImagesFlag) {
    log.step("Afbeeldingen downloaden");
    const res = await downloadImages(catalog, outDir, config);
    log.ok(`Afbeeldingen: ${res.downloaded} gelukt, ${res.failed} mislukt → ${res.manifestPath}`);
  }

  const report = buildReport(catalog);
  if (report.warnings.length) {
    log.warn("Aandachtspunten:");
    for (const w of report.warnings) log.plain("   - " + w);
  }
  log.ok(`Klaar. Importbestanden staan in ${resolve(outDir)}`);
}

async function cmdSeoBatch(config: AppConfig, inDir: string, outDir: string): Promise<void> {
  const catalog = await loadCatalog(inDir);
  if (!catalog.products.some((p) => p.seo)) {
    log.info("Nog geen SEO aanwezig — engine wordt eerst gedraaid.");
    runSeoEngine(catalog, config);
    await saveCatalog(catalog, outDir);
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "seo-batch.jsonl"), buildBatchJsonl(catalog), "utf8");
  await writeFile(join(outDir, "PROMPT.md"), buildBatchPrompt(config), "utf8");
  log.ok(`seo-batch.jsonl (${catalog.products.length} regels) + PROMPT.md geschreven in ${outDir}`);
  log.info("Open een Claude Code-sessie, volg PROMPT.md, schrijf seo-batch.out.jsonl,");
  log.info(`en draai daarna: npm run cli -- seo:apply --in ${outDir} --batch ${join(outDir, "seo-batch.out.jsonl")}`);
}

async function cmdSeoApply(config: AppConfig, inDir: string, outDir: string, batchFile: string): Promise<void> {
  const catalog = await loadCatalog(inDir);
  if (!catalog.products.some((p) => p.seo)) runSeoEngine(catalog, config);
  const applied = applyBatchOutput(catalog, resolve(batchFile));
  log.ok(`${applied} producten bijgewerkt met Claude-copy`);
  await saveCatalog(catalog, outDir);
  await writeExports(catalog, outDir, config);
  log.ok("Her-export voltooid.");
}

async function cmdVerify(inDir: string): Promise<void> {
  const catalog = await loadCatalog(inDir);
  const report = buildReport(catalog);
  process.stdout.write(reportToMarkdown(report) + "\n");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      in: { type: "string" },
      out: { type: "string" },
      batch: { type: "string" },
      "download-images": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  const command = positionals[0];
  if (!command || values.help) {
    process.stdout.write(HELP + "\n");
    return;
  }

  const config = loadConfig();
  const outDir = resolve(values.out ?? "./output");
  const inDir = resolve(values.in ?? values.out ?? "./output");
  const dl = Boolean(values["download-images"]);

  switch (command) {
    case "scrape": {
      if (!values.url) throw new Error("--url is verplicht voor scrape");
      await cmdScrape(config, values.url, outDir);
      break;
    }
    case "build": {
      await cmdBuild(config, inDir, outDir, dl);
      break;
    }
    case "all": {
      if (!values.url) throw new Error("--url is verplicht voor all");
      await cmdScrape(config, values.url, outDir);
      await cmdBuild(config, outDir, outDir, dl);
      break;
    }
    case "seo:batch": {
      await cmdSeoBatch(config, inDir, outDir);
      break;
    }
    case "seo:status": {
      const batchPath = join(inDir, "seo-batch.jsonl");
      const outPath = join(inDir, "seo-batch.out.jsonl");
      if (!existsSync(batchPath)) throw new Error(`seo-batch.jsonl niet gevonden in ${inDir}. Draai eerst "seo:batch".`);
      const st = batchStatus(batchPath, outPath);
      const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
      process.stdout.write(`Voortgang: ${st.done} / ${st.total} klaar (${pct}%) — ${st.remaining} resterend\n`);
      if (st.remaining > 0) {
        const preview = st.remainingIds.slice(0, 10).join(", ");
        process.stdout.write(`Eerste resterende id's: ${preview}${st.remaining > 10 ? " …" : ""}\n`);
      } else {
        process.stdout.write(`Alles klaar! Draai nu: npm run cli -- seo:apply --in ${inDir} --batch ${outPath}\n`);
      }
      break;
    }
    case "seo:apply": {
      if (!values.batch) throw new Error("--batch <bestand> is verplicht voor seo:apply");
      await cmdSeoApply(config, inDir, outDir, values.batch);
      break;
    }
    case "verify": {
      await cmdVerify(inDir);
      break;
    }
    default: {
      log.error(`Onbekend command: ${command}`);
      process.stdout.write(HELP + "\n");
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  log.error((err as Error).message);
  process.exitCode = 1;
});
