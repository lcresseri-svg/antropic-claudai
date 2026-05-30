import { describe, it, expect } from 'vitest';
import { formatCurrency, capitalize, guessCategory } from './utils';

describe('formatCurrency', () => {
  it('formats amounts in EUR it-IT with comma decimals', () => {
    // Assert comma decimals + euro symbol. The thousands separator depends on
    // the runtime's ICU data (full in browsers, reduced in some Node builds),
    // so we don't assert on it here.
    const out = formatCurrency(1234.5);
    expect(out).toContain('€');
    expect(out).toContain(',50');
  });

  it('renders negative amounts with a minus glyph', () => {
    expect(formatCurrency(-10)).toMatch(/^−/);
  });

  it('adds an explicit sign when requested', () => {
    expect(formatCurrency(10, { sign: true })).toMatch(/^\+/);
    expect(formatCurrency(-10, { sign: true })).toMatch(/^−/);
    expect(formatCurrency(0, { sign: true })).toMatch(/^\+/);
  });
});

describe('capitalize', () => {
  it('uppercases the first character only', () => {
    expect(capitalize('maggio')).toBe('Maggio');
    expect(capitalize('a')).toBe('A');
  });
  it('leaves an empty string untouched', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('guessCategory', () => {
  const candidates = [
    { id: 'spesa', label: 'Spesa' },
    { id: 'trasporti', label: 'Trasporti' },
    { id: 'ristoranti', label: 'Ristoranti' },
    { id: 'altro', label: 'Altro' },
  ];

  it('matches a keyword to its category', () => {
    expect(guessCategory('Esselunga via Roma', candidates)).toBe('spesa');
    expect(guessCategory('benzina autostrada', candidates)).toBe('trasporti');
    expect(guessCategory('cena pizzeria', candidates)).toBe('ristoranti');
  });

  it('only returns categories present among the candidates', () => {
    // 'netflix' maps to abbonamenti, which is not a candidate here
    expect(guessCategory('netflix', candidates)).toBeNull();
  });

  it('returns null for empty input or no candidates', () => {
    expect(guessCategory('', candidates)).toBeNull();
    expect(guessCategory('qualcosa', [])).toBeNull();
  });

  it('falls back to a label match for a custom category with no keywords', () => {
    const custom = [...candidates, { id: 'animali', label: 'Animali' }];
    expect(guessCategory('animali domestici', custom)).toBe('animali');
  });

  it('never returns the generic "altro" via label match', () => {
    expect(guessCategory('altro', candidates)).toBeNull();
  });
});
