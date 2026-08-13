/* Tiny leveled logger with no dependencies. Writes to stderr so that stdout
 * can be used for machine-readable output when piping. */

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const log = {
  info: (msg: string) => process.stderr.write(`${c("36", "›")} ${msg}\n`),
  step: (msg: string) => process.stderr.write(`${c("35", "▸")} ${c("1", msg)}\n`),
  ok: (msg: string) => process.stderr.write(`${c("32", "✓")} ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`${c("33", "!")} ${msg}\n`),
  error: (msg: string) => process.stderr.write(`${c("31", "✗")} ${msg}\n`),
  plain: (msg: string) => process.stderr.write(`${msg}\n`),
};

/** Simple in-place progress line (only when attached to a TTY). */
export function progress(current: number, total: number, label: string): void {
  if (!process.stderr.isTTY) return;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const width = 24;
  const filled = Math.round((pct / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  process.stderr.write(`\r  ${bar} ${pct}%  ${label}${" ".repeat(8)}`);
  if (current >= total) process.stderr.write("\n");
}
