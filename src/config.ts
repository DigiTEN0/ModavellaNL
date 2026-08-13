import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig } from "./types.js";

/**
 * Minimal, dependency-free .env loader. We do NOT pull in `dotenv` to keep the
 * runtime dependency count at zero (security: nothing third-party touches your
 * data). Only KEY=VALUE lines are parsed; existing process.env wins.
 */
function loadDotEnv(cwd = process.cwd()): void {
  const envPath = resolve(cwd, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v;
}

export function loadConfig(): AppConfig {
  loadDotEnv();
  const locale = str("SHOP_LOCALE", "nl").toLowerCase() === "en" ? "en" : "nl";
  return {
    shopName: str("SHOP_NAME", "Modavella"),
    locale,
    currency: str("SHOP_CURRENCY", "EUR"),
    scrapeDelayMs: Math.max(0, num("SCRAPE_DELAY_MS", 600)),
    scrapeConcurrency: Math.min(8, Math.max(1, num("SCRAPE_CONCURRENCY", 3))),
    scrapeMaxRetries: Math.min(8, Math.max(0, num("SCRAPE_MAX_RETRIES", 4))),
    userAgent: str(
      "SCRAPE_USER_AGENT",
      "ModavellaCatalogImporter/1.0 (+https://modavella.nl)",
    ),
    trust: {
      shipping: str("TRUST_SHIPPING", ""),
      returns: str("TRUST_RETURNS", ""),
      service: str("TRUST_SERVICE", ""),
    },
  };
}
