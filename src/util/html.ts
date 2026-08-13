/* Dependency-free HTML utilities.
 *
 * sanitizeHtml(): allowlist-based cleaner. Source descriptions can contain
 * anything (tracking pixels, <script>, inline event handlers, junk styling).
 * We KEEP the useful structural content — including <table> size charts — but
 * strip anything executable or unsafe. This is a real security control: the
 * scraped HTML is untrusted input, and we never let script/iframe/on* survive.
 *
 * htmlToText(): flatten HTML to readable plain text for SEO summaries.
 */

/** Tags whose entire contents we drop. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "canvas",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "link",
  "meta",
  "head",
]);

/** Tags we keep (structure that matters for product content & size charts). */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "span", "div", "section", "article",
  "strong", "b", "em", "i", "u", "small", "sup", "sub", "mark", "del", "ins",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption", "blockquote",
]);

/** Per-tag allowed attributes. Everything else is stripped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};

function isSafeUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u.startsWith("http://") || u.startsWith("https://")) return true;
  if (u.startsWith("mailto:") || u.startsWith("tel:")) return true;
  if (u.startsWith("//")) return true; // protocol-relative — fine for images
  if (u.startsWith("/") || u.startsWith("#")) return true; // relative/anchor
  // Reject javascript:, data:, vbscript:, file:, etc.
  return false;
}

function filterAttributes(tag: string, attrString: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const out: string[] = [];
  // Match name="value" | name='value' | name=value | name
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrString)) !== null) {
    const name = m[1]!.toLowerCase();
    if (name.startsWith("on")) continue; // event handlers — never
    if (!allowed.has(name)) continue;
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    if ((name === "href" || name === "src") && value && !isSafeUrl(value)) continue;
    if (value === "") out.push(name);
    else out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }
  return out.length ? " " + out.join(" ") : "";
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);

  // Remove comments (may contain conditional-comment scripts).
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Remove drop-with-content blocks entirely.
  for (const tag of DROP_WITH_CONTENT) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi");
    html = html.replace(re, "");
    // Also self-closing / unclosed variants
    html = html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "");
  }

  // Walk remaining tags and rebuild them from the allowlist.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, rawName, attrs) => {
    const name = String(rawName).toLowerCase();
    const closing = full.startsWith("</");
    if (!ALLOWED_TAGS.has(name)) return ""; // strip tag, keep inner text
    if (closing) return `</${name}>`;
    const selfClose = name === "br" || name === "hr" || name === "img" || name === "col";
    const cleanedAttrs = filterAttributes(name, String(attrs));
    return selfClose ? `<${name}${cleanedAttrs}>` : `<${name}${cleanedAttrs}>`;
  });

  // Collapse excessive whitespace between tags.
  html = html.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return html;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&eacute;": "é", "&egrave;": "è",
  "&euml;": "ë", "&uuml;": "ü", "&ouml;": "ö", "&auml;": "ä",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-zA-Z#0-9]+;/g, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

/** Flatten HTML to clean, single-spaced plain text. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|br|table)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** True if the HTML contains what looks like a size/measurement table. */
export function hasSizeTable(html: string): boolean {
  if (!/<table/i.test(html)) return false;
  const text = htmlToText(html).toLowerCase();
  return /(maat|size|cm|inch|lengte|breedte|borst|taille|heup|chest|waist|hip|length)/.test(
    text,
  );
}
