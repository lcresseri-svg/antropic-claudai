import { describe, it, expect } from 'vitest';
import {
  normalizeMerchant,
  buildMerchantIndex,
  recognizeCategory,
  RECOGNITION_THRESHOLD,
  type Candidate,
  type IndexableTransaction,
} from './categoryRecognition';

// Expense-type candidates the form would pass (already filtered by type).
const EXPENSE: Candidate[] = [
  { id: 'spesa', label: 'Spesa' },
  { id: 'casa', label: 'Casa' },
  { id: 'ristoranti', label: 'Ristoranti' },
  { id: 'trasporti', label: 'Trasporti' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'altro', label: 'Altro' },
];

const tx = (description: string, category: string, date = '2026-01-01'): IndexableTransaction =>
  ({ description, category, date });

describe('normalizeMerchant', () => {
  it('strips POS / date / numbers / location noise to the merchant', () => {
    expect(normalizeMerchant('PAGAMENTO POS 12/06 ESSELUNGA MILANO')).toBe('esselunga');
  });

  it('drops street and city words, keeping the merchant', () => {
    expect(normalizeMerchant('ESSELUNGA VIA ROMA')).toBe('esselunga');
  });

  it('is stable for the bare merchant name', () => {
    expect(normalizeMerchant('Esselunga')).toBe('esselunga');
  });
});

describe('recognizeCategory — L2 keyword scoring (corrected)', () => {
  it('regression: "benzina gasolio" → trasporti, NOT casa', () => {
    const r = recognizeCategory({ description: 'benzina gasolio', candidates: EXPENSE, index: {} });
    expect(r?.categoryId).toBe('trasporti');
    expect(r?.categoryId).not.toBe('casa');
    expect(r!.confidence).toBeGreaterThanOrEqual(RECOGNITION_THRESHOLD);
  });

  it('word boundaries: "barbiere" does not match the "bar" keyword (ristoranti)', () => {
    const r = recognizeCategory({ description: 'barbiere', candidates: EXPENSE, index: {} });
    expect(r).toBeNull();
  });

  it('word boundaries: "gasata" does not match the "gas" keyword (casa)', () => {
    const r = recognizeCategory({ description: 'gasata', candidates: EXPENSE, index: {} });
    expect(r).toBeNull();
  });

  it('benefits a renamed/custom category resolved by label', () => {
    // 'trasporti' renamed to a custom id but keeping the default label.
    const custom: Candidate[] = [
      { id: 'spesa', label: 'Spesa' },
      { id: 'cat_x9', label: 'Trasporti' },
      { id: 'altro', label: 'Altro' },
    ];
    const r = recognizeCategory({ description: 'benzina autostrada', candidates: custom, index: {} });
    expect(r?.categoryId).toBe('cat_x9');
  });
});

describe('recognizeCategory — L1 historical memory', () => {
  it('suggests the most-used category for a known merchant, with high confidence', () => {
    const index = buildMerchantIndex([
      tx('Esselunga', 'spesa', '2026-01-02'),
      tx('Esselunga', 'spesa', '2026-02-02'),
      tx('Esselunga', 'spesa', '2026-03-02'),
      tx('Esselunga', 'spesa', '2026-04-02'),
    ]);
    const r = recognizeCategory({ description: 'ESSELUNGA VIA ROMA', candidates: EXPENSE, index });
    expect(r?.categoryId).toBe('spesa');
    // L1 (≈0.99) clears a height that the single-keyword L2 path (≈0.62) could not.
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('is restricted to candidates: a merchant historicised on a non-candidate category is not suggested', () => {
    // 'Notaio Bianchi' has no L2 keyword; its only signal is history on 'shopping'.
    const index = buildMerchantIndex([
      tx('Notaio Bianchi', 'shopping'),
      tx('Notaio Bianchi', 'shopping'),
      tx('Notaio Bianchi', 'shopping'),
    ]);
    const candidatesNoShopping: Candidate[] = [
      { id: 'spesa', label: 'Spesa' },
      { id: 'ristoranti', label: 'Ristoranti' },
      { id: 'trasporti', label: 'Trasporti' },
      { id: 'altro', label: 'Altro' },
    ];
    const r = recognizeCategory({ description: 'NOTAIO BIANCHI', candidates: candidatesNoShopping, index });
    expect(r).toBeNull();
  });
});

describe('recognizeCategory — confidence threshold', () => {
  it('exposes a sane threshold in (0,1)', () => {
    expect(RECOGNITION_THRESHOLD).toBeGreaterThan(0);
    expect(RECOGNITION_THRESHOLD).toBeLessThan(1);
  });

  it('a lone clear keyword clears the threshold', () => {
    const r = recognizeCategory({ description: 'benzina', candidates: EXPENSE, index: {} });
    expect(r?.categoryId).toBe('trasporti');
    expect(r!.confidence).toBeGreaterThanOrEqual(RECOGNITION_THRESHOLD);
  });

  it('an ambiguous tie stays below the threshold (would not auto-apply)', () => {
    // 'pizza' → ristoranti, 'amazon' → shopping: a 1–1 tie.
    const r = recognizeCategory({ description: 'pizza amazon', candidates: EXPENSE, index: {} });
    expect(r).not.toBeNull();
    expect(r!.confidence).toBeLessThan(RECOGNITION_THRESHOLD);
  });

  it('returns null when nothing scores', () => {
    const r = recognizeCategory({ description: 'qwerty zzz', candidates: EXPENSE, index: {} });
    expect(r).toBeNull();
  });
});
