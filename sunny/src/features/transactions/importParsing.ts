import { TransactionType } from '../../types';

/** Maximum rows accepted in a single import, to avoid abusive payloads. */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Parse a date cell into YYYY-MM-DD.
 * Accepts Excel serial numbers, DD/MM/YYYY (and . or - separators), and ISO.
 * Returns null when the value cannot be parsed into a valid date — callers
 * must treat null as an error rather than importing a malformed date.
 */
export function parseDate(val: unknown): string | null {
  if (typeof val === 'number') {
    if (!isFinite(val) || val <= 0) return null;
    const d = new Date(Math.round((val - 25569) * 86400000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(val ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // Round-trip to reject impossible dates like 31/02
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.getUTCDate() !== day) return null;
    return iso;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Parse an amount cell into a positive number, or NaN when invalid. */
export function parseAmount(val: unknown): number {
  const cleaned = String(val ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  return Math.abs(parseFloat(cleaned));
}

/** Map a free-text type cell to a TransactionType. recognized=false means it was guessed. */
export function parseType(val: unknown): { type: TransactionType; recognized: boolean } {
  const s = String(val ?? '').toLowerCase().trim();
  if (!s) return { type: 'expense', recognized: true };
  if (/entrat|income|ricav|accredit|stipend|salari|rimborso/.test(s)) return { type: 'income', recognized: true };
  if (/invest|etf|azion|fond/.test(s)) return { type: 'investment', recognized: true };
  if (/trasfer|moviment|transfer|bonifico|girocont/.test(s)) return { type: 'transfer', recognized: true };
  if (/uscit|spesa|pagament|expense|cost|acquist|prelievo/.test(s)) return { type: 'expense', recognized: true };
  return { type: 'expense', recognized: false };
}

export const norm = (k: string) => k.toLowerCase().trim().replace(/\s+/g, '_');

/** Find a column value by any of the given normalized header names. */
export function col(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    const k = Object.keys(row).find(x => norm(x) === n);
    if (k !== undefined) return row[k];
  }
  return undefined;
}
