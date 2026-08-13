/* RFC 4180 CSV writer, dependency-free. Handles quoting/escaping correctly for
 * Shopify's importer (commas, quotes, newlines all survive). */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  // Normalize Windows newlines inside cells to \n; Shopify accepts them quoted.
  s = s.replace(/\r\n/g, "\n");
  const mustQuote = /[",\n]/.test(s);
  if (mustQuote) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Serialize an array of row-objects into a CSV string using a fixed column
 * order. Missing keys become empty cells. Uses CRLF line endings (Excel/Shopify
 * friendly) and a UTF-8 BOM so accented characters render correctly on import.
 */
export function toCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
  opts: { bom?: boolean } = {},
): string {
  const header = columns.map(escapeCell).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCell(row[col])).join(","),
  );
  const body = [header, ...lines].join("\r\n") + "\r\n";
  return (opts.bom === false ? "" : "﻿") + body;
}
