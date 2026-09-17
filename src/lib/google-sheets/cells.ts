// Google Sheets (like Excel) numbers real date cells from 30 Dec 1899 --
// this preserves a historical Lotus 1-2-3 leap-year bug for compatibility,
// but it's a fixed, well-known offset so the conversion is exact.
function excelSerialToISODate(serial: number): string {
  const epochMs = Date.UTC(1899, 11, 30);
  const ms = epochMs + Math.round(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** A Rota date cell is a real Sheets date value (a number), but fall back
 *  to parsing text defensively so one oddly-formatted cell doesn't crash
 *  the whole read. */
export function cellToDateString(value: unknown): string | null {
  if (typeof value === "number") return excelSerialToISODate(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return null;
}

export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function cellToBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return cellToText(value).toUpperCase() === "TRUE";
}
