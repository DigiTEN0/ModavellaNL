import { slugify } from "../util/text.js";

/** Generates unique, clean handles across the whole catalogue.
 * SEO-friendly: keyword-forward, readable, deduplicated with -2, -3 suffixes. */
export class SlugRegistry {
  private used = new Set<string>();

  /** Number of unique handles registered so far. */
  get size(): number {
    return this.used.size;
  }

  make(title: string, hintCategory?: string): string {
    let base = slugify(title, 60);
    // If the title is very generic/short, enrich with a category keyword.
    if (base.length < 6 && hintCategory) {
      base = slugify(`${title}-${hintCategory}`, 60);
    }
    if (!this.used.has(base)) {
      this.used.add(base);
      return base;
    }
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base}-${i}`;
      if (!this.used.has(candidate)) {
        this.used.add(candidate);
        return candidate;
      }
    }
    // Fallback (essentially never reached)
    const fallback = `${base}-${Date.now()}`;
    this.used.add(fallback);
    return fallback;
  }
}
