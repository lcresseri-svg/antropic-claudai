import { describe, it, expect } from 'vitest';
import { parseDate, parseAmount, parseType, col, norm } from './importParsing';

describe('parseDate', () => {
  it('parses DD/MM/YYYY with various separators', () => {
    expect(parseDate('05/03/2026')).toBe('2026-03-05');
    expect(parseDate('5.3.2026')).toBe('2026-03-05');
    expect(parseDate('5-3-2026')).toBe('2026-03-05');
  });

  it('parses ISO dates', () => {
    expect(parseDate('2026-03-05')).toBe('2026-03-05');
  });

  it('parses Excel serial numbers', () => {
    // 45992 ≈ 2025-12-31 in the Excel 1900 system
    const r = parseDate(45992);
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects impossible and malformed dates', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('99/99/2026')).toBeNull();
    expect(parseDate('non una data')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('parses comma and dot decimals as a positive number', () => {
    expect(parseAmount('1234,56')).toBeCloseTo(1234.56);
    expect(parseAmount('1234.56')).toBeCloseTo(1234.56);
    expect(parseAmount('€ 12,00')).toBeCloseTo(12);
  });

  it('takes the absolute value of negatives', () => {
    expect(parseAmount('-50')).toBeCloseTo(50);
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount(null)).toBeNaN();
  });
});

describe('parseType', () => {
  it('recognizes the four transaction types from Italian text', () => {
    expect(parseType('entrata')).toEqual({ type: 'income', recognized: true });
    expect(parseType('Uscita')).toEqual({ type: 'expense', recognized: true });
    expect(parseType('investimento ETF')).toEqual({ type: 'investment', recognized: true });
    expect(parseType('bonifico')).toEqual({ type: 'transfer', recognized: true });
  });

  it('defaults empty to expense (recognized)', () => {
    expect(parseType('')).toEqual({ type: 'expense', recognized: true });
  });

  it('flags unknown values as guessed expense', () => {
    expect(parseType('xyz')).toEqual({ type: 'expense', recognized: false });
  });
});

describe('col / norm', () => {
  it('normalizes header keys', () => {
    expect(norm('  Conto Destinazione ')).toBe('conto_destinazione');
  });

  it('matches a column case- and space-insensitively by any alias', () => {
    const row = { 'Data Operazione': '2026-01-01', 'Importo €': '10' };
    expect(col(row, 'data_operazione')).toBe('2026-01-01');
    expect(col(row, 'data', 'importo_€')).toBe('10');
    expect(col(row, 'inesistente')).toBeUndefined();
  });
});
