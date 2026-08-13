import { toCsv } from "../util/csv.js";
import type { Catalog, NormalizedProduct } from "../types.js";

/* Produces a NATIVE Shopify product-import CSV. This imports directly in
 * Shopify (Products → Import) with no third-party app required, and is also
 * fully compatible with Matrixify. Variants and images use Shopify's multi-row
 * convention. Collections are preserved via Tags (see smart-collections CSV). */

export const SHOPIFY_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Variant Image",
  "Variant Weight Unit",
  "Status",
];

const TRUE = "TRUE";
const FALSE = "FALSE";

function productRows(p: NormalizedProduct): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const handle = p.seo?.handle ?? p.originalHandle;
  const variantCount = Math.max(1, p.variants.length);
  const imageCount = p.images.length;
  const rowCount = Math.max(variantCount, imageCount);

  const optionNames = p.options.map((o) => o.name);

  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, unknown> = { Handle: handle };
    const variant = p.variants[r];

    // Product-level fields only on the first row.
    if (r === 0) {
      row["Title"] = p.title;
      row["Body (HTML)"] = p.seo?.bodyHtml ?? p.originalBodyHtml;
      row["Vendor"] = p.vendor;
      row["Type"] = p.productType;
      row["Tags"] = p.tags.join(", ");
      row["Published"] = TRUE;
      row["Gift Card"] = FALSE;
      row["SEO Title"] = p.seo?.seoTitle ?? "";
      row["SEO Description"] = p.seo?.metaDescription ?? "";
      row["Status"] = "active";
      row["Option1 Name"] = optionNames[0] ?? "Title";
      row["Option2 Name"] = optionNames[1] ?? "";
      row["Option3 Name"] = optionNames[2] ?? "";
    }

    // Variant fields (rows that correspond to a variant).
    if (variant) {
      const values = variant.optionValues.length ? variant.optionValues : ["Default Title"];
      row["Option1 Value"] = values[0] ?? "Default Title";
      row["Option2 Value"] = values[1] ?? "";
      row["Option3 Value"] = values[2] ?? "";
      row["Variant SKU"] = variant.sku;
      row["Variant Grams"] = variant.grams || "";
      row["Variant Inventory Tracker"] = ""; // untracked → sellable on import
      row["Variant Inventory Qty"] = "";
      row["Variant Inventory Policy"] = "deny";
      row["Variant Fulfillment Service"] = "manual";
      row["Variant Price"] = variant.price;
      row["Variant Compare At Price"] = variant.compareAtPrice || "";
      row["Variant Requires Shipping"] = variant.requiresShipping ? TRUE : FALSE;
      row["Variant Taxable"] = variant.taxable ? TRUE : FALSE;
      row["Variant Barcode"] = variant.barcode;
      row["Variant Weight Unit"] = variant.grams ? "g" : "";
      if (variant.variantImageSrc) row["Variant Image"] = variant.variantImageSrc;
    }

    // Gallery image for this row (interleaved, plus extra image-only rows).
    const image = p.images[r];
    if (image) {
      row["Image Src"] = image.src;
      row["Image Position"] = r + 1;
      row["Image Alt Text"] = image.alt || p.title;
    }

    rows.push(row);
  }

  return rows;
}

export function buildShopifyCsv(catalog: Catalog): string {
  const rows: Array<Record<string, unknown>> = [];
  for (const p of catalog.products) rows.push(...productRows(p));
  return toCsv(SHOPIFY_COLUMNS, rows);
}
