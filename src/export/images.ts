import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log, progress } from "../util/log.js";
import { slugify } from "../util/text.js";
import type { AppConfig, Catalog } from "../types.js";

/* Optional: download all product images locally so you can self-host them
 * instead of hot-linking the source store. By default the CSV references the
 * original image URLs (Shopify fetches them at import), which is faster and
 * needs no download. Use this when you want full independence from the source.
 *
 * Writes to <outDir>/images/<handle>/<position>-<name> and a manifest.json. */

interface ImageJob {
  url: string;
  dest: string;
  handle: string;
  position: number;
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    return m ? m[0].toLowerCase() : ".jpg";
  } catch {
    return ".jpg";
  }
}

export async function downloadImages(
  catalog: Catalog,
  outDir: string,
  config: AppConfig,
): Promise<{ downloaded: number; failed: number; manifestPath: string }> {
  const jobs: ImageJob[] = [];
  for (const p of catalog.products) {
    const handle = p.seo?.handle ?? p.originalHandle;
    p.images.forEach((img, i) => {
      const ext = extFromUrl(img.src);
      const name = `${String(i + 1).padStart(2, "0")}-${slugify(handle, 40)}${ext}`;
      jobs.push({
        url: img.src,
        dest: join(outDir, "images", slugify(handle, 60), name),
        handle,
        position: i + 1,
      });
    });
  }

  const manifest: Array<{ handle: string; position: number; url: string; file: string; ok: boolean }> = [];
  let downloaded = 0;
  let failed = 0;
  let done = 0;

  const limit = config.scrapeConcurrency;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= jobs.length) return;
      const job = jobs[i]!;
      try {
        await mkdir(join(job.dest, ".."), { recursive: true });
        const res = await fetch(job.url, { headers: { "User-Agent": config.userAgent } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(job.dest, buf);
        downloaded++;
        manifest.push({ handle: job.handle, position: job.position, url: job.url, file: job.dest, ok: true });
      } catch (err) {
        failed++;
        manifest.push({ handle: job.handle, position: job.position, url: job.url, file: job.dest, ok: false });
        log.warn(`Afbeelding mislukt (${job.handle} #${job.position}): ${(err as Error).message}`);
      }
      progress(++done, jobs.length, `afbeeldingen`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));

  const manifestPath = join(outDir, "images", "manifest.json");
  await mkdir(join(outDir, "images"), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { downloaded, failed, manifestPath };
}
