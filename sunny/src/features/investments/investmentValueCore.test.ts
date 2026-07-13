import { describe, it, expect } from 'vitest';
import { CategoryDef } from '../../types';
import {
  desiredValueDelta, planValueChange, applyValueChanges,
} from './investmentValueCore';

const TODAY = '2026-07-12';

const categories = (): CategoryDef[] => [
  { id: 'etf', label: 'ETF', icon: '📈', color: '#fff', kind: 'investment', currentValue: 1000, lastValueUpdate: '2026-07-01', initialBalance: 500, tfrAmount: 200 },
  { id: 'crypto', label: 'Crypto', icon: '🪙', color: '#fff', kind: 'investment' }, // currentValue assente
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#fff', kind: 'expense', currentValue: 999 },
];

const invest = (over: Record<string, unknown> = {}) => ({
  type: 'investment', amount: 100, category: 'etf', ...over,
});

describe('desiredValueDelta', () => {
  it('versamento: +amount (direction assente o in)', () => {
    expect(desiredValueDelta(invest())).toEqual({ category: 'etf', delta: 100 });
    expect(desiredValueDelta(invest({ direction: 'in' }))).toEqual({ category: 'etf', delta: 100 });
  });
  it('prelievo: −amount', () => {
    expect(desiredValueDelta(invest({ direction: 'out' }))).toEqual({ category: 'etf', delta: -100 });
  });
  it('valueDelta esplicito vince su ±amount (leg out del disinvestimento)', () => {
    expect(desiredValueDelta(invest({ direction: 'out', amount: 400, valueDelta: -500 })))
      .toEqual({ category: 'etf', delta: -500 });
  });
  it('mai per template ricorrenti, righe projected, non-investimenti o importi invalidi', () => {
    expect(desiredValueDelta(invest({ recurring: { freq: 'monthly' } }))).toBeNull();
    expect(desiredValueDelta(invest({ projected: true }))).toBeNull();
    expect(desiredValueDelta({ type: 'expense', amount: 100, category: 'spesa' })).toBeNull();
    expect(desiredValueDelta(invest({ amount: 0 }))).toBeNull();
    expect(desiredValueDelta(invest({ amount: NaN }))).toBeNull();
    expect(desiredValueDelta(null)).toBeNull();
  });
});

describe('applyValueChanges', () => {
  it('versamento somma al currentValue e aggiorna lastValueUpdate', () => {
    const r = applyValueChanges(categories(), [{ category: 'etf', delta: 250 }], TODAY);
    const etf = r.categories.find(c => c.id === 'etf')!;
    expect(etf.currentValue).toBe(1250);
    expect(etf.lastValueUpdate).toBe(TODAY);
    expect(r.applied).toEqual([{ category: 'etf', applied: 250 }]);
    expect(r.changed).toBe(true);
    // initialBalance e tfrAmount MAI toccati.
    expect(etf.initialBalance).toBe(500);
    expect(etf.tfrAmount).toBe(200);
  });

  it('prelievo sottrae con clamp a 0 e registra il delta effettivo', () => {
    const r = applyValueChanges(categories(), [{ category: 'etf', delta: -1500 }], TODAY);
    expect(r.categories.find(c => c.id === 'etf')!.currentValue).toBe(0);
    expect(r.applied).toEqual([{ category: 'etf', applied: -1000 }]); // solo quanto applicato
  });

  it('currentValue assente parte da 0', () => {
    const r = applyValueChanges(categories(), [{ category: 'crypto', delta: 300 }], TODAY);
    expect(r.categories.find(c => c.id === 'crypto')!.currentValue).toBe(300);
  });

  it('clamp SEQUENZIALE su più movimenti nella stessa run', () => {
    const r = applyValueChanges(categories(), [
      { category: 'etf', delta: -800 },
      { category: 'etf', delta: -800 }, // restano solo 200
    ], TODAY);
    expect(r.categories.find(c => c.id === 'etf')!.currentValue).toBe(0);
    expect(r.applied).toEqual([
      { category: 'etf', applied: -800 },
      { category: 'etf', applied: -200 },
    ]);
  });

  it('no-op completamente clampato: non materializza un currentValue esplicito', () => {
    const r = applyValueChanges(categories(), [{ category: 'crypto', delta: -100 }], TODAY);
    const crypto = r.categories.find(c => c.id === 'crypto')!;
    expect(crypto.currentValue).toBeUndefined(); // il display resta sul fallback versato
    expect(r.applied).toEqual([{ category: 'crypto', applied: 0 }]);
  });

  it('categorie sconosciute o non-investment: delta 0, nessuna modifica', () => {
    const r = applyValueChanges(categories(), [
      { category: 'ghost', delta: 100 },
      { category: 'spesa', delta: 100 },
    ], TODAY);
    expect(r.changed).toBe(false);
    expect(r.applied.every(a => a.applied === 0)).toBe(true);
    expect(r.categories.find(c => c.id === 'spesa')!.currentValue).toBe(999);
  });
});

describe('planValueChange — ciclo di vita', () => {
  const stamp = { category: 'etf', delta: 100, appliedAt: 1 };

  it('creazione (anche istanza di ricorrenza materializzata): applica e stampiglia', () => {
    const p = planValueChange({ exists: false, next: invest() });
    expect(p).toEqual({ revert: null, request: { category: 'etf', delta: 100 }, stamp: 'set' });
  });

  it('creazione di un template ricorrente: nessun effetto', () => {
    const p = planValueChange({ exists: false, next: invest({ recurring: { freq: 'monthly' } }) });
    expect(p).toEqual({ revert: null, request: null, stamp: 'none' });
  });

  it('modifica di documento gestito: annulla il delta APPLICATO, poi riapplica', () => {
    const p = planValueChange({
      exists: true, priorType: 'investment', priorEffect: stamp,
      next: invest({ amount: 150, direction: 'out', category: 'crypto' }),
    });
    expect(p.revert).toEqual({ category: 'etf', delta: -100 });      // annulla sull'etf
    expect(p.request).toEqual({ category: 'crypto', delta: -150 });  // riapplica sul nuovo
    expect(p.stamp).toBe('set');
  });

  it('modifica che trasforma un investimento gestito in spesa: solo revert', () => {
    const p = planValueChange({
      exists: true, priorType: 'investment', priorEffect: stamp,
      next: { type: 'expense', amount: 100, category: 'spesa' },
    });
    expect(p).toEqual({ revert: { category: 'etf', delta: -100 }, request: null, stamp: 'clear' });
  });

  it('eliminazione: annulla solo ciò che era stato applicato', () => {
    expect(planValueChange({ exists: true, priorType: 'investment', priorEffect: stamp, next: null }))
      .toEqual({ revert: { category: 'etf', delta: -100 }, request: null, stamp: 'none' });
    // documento legacy (senza stamp): l'eliminazione non tocca nulla
    expect(planValueChange({ exists: true, priorType: 'investment', priorEffect: null, next: null }))
      .toEqual({ revert: null, request: null, stamp: 'none' });
  });

  it('legacy: investimento pre-feature resta unmanaged anche se modificato', () => {
    const p = planValueChange({
      exists: true, priorType: 'investment', priorEffect: null,
      next: invest({ amount: 999 }),
    });
    expect(p).toEqual({ revert: null, request: null, stamp: 'none' });
  });

  it('transizione spesa → investimento: diventa gestito', () => {
    const p = planValueChange({
      exists: true, priorType: 'expense', priorEffect: null,
      next: invest(),
    });
    expect(p).toEqual({ revert: null, request: { category: 'etf', delta: 100 }, stamp: 'set' });
  });

  it('doppia esecuzione: revert+riapplica dello stesso stato = effetto netto nullo', () => {
    const p = planValueChange({
      exists: true, priorType: 'investment', priorEffect: stamp, next: invest(),
    });
    const r = applyValueChanges(categories(), [p.revert!, p.request!], TODAY);
    expect(r.categories.find(c => c.id === 'etf')!.currentValue).toBe(1000); // invariato
    expect(r.applied).toEqual([
      { category: 'etf', applied: -100 },
      { category: 'etf', applied: 100 },
    ]);
  });
});

describe('scenari end-to-end (pianifica + applica)', () => {
  it('ricorrenza materializzata: N istanze applicate una volta sola', () => {
    // Tre istanze create dal catch-up: ognuna pianificata come CREATE.
    const plans = [1, 2, 3].map(() => planValueChange({ exists: false, next: invest({ amount: 100 }) }));
    const r = applyValueChanges(categories(), plans.map(p => p.request!), TODAY);
    expect(r.categories.find(c => c.id === 'etf')!.currentValue).toBe(1300);
    // Le istanze ora sono stampigliate: un secondo giro (modifica identica)
    // produce revert+apply nets zero → mai applicate due volte.
    const second = plans.map((_, i) => planValueChange({
      exists: true, priorType: 'investment',
      priorEffect: { category: 'etf', delta: r.applied[i].applied, appliedAt: 1 },
      next: invest({ amount: 100 }),
    }));
    const changes = [
      ...second.map(p => p.revert!),
      ...second.map(p => p.request!),
    ];
    const r2 = applyValueChanges(r.categories, changes, TODAY);
    expect(r2.categories.find(c => c.id === 'etf')!.currentValue).toBe(1300);
  });

  it('disinvestimento della sheet: valueDelta riproduce esattamente newCurrentValue', () => {
    // Posizione: cv 1000, prelievo cash 600 → out leg amount=capRimborsato,
    // valueDelta = −600 → nuovo cv 400 (= max(0, 1000−600)).
    const out = invest({ direction: 'out', amount: 480, valueDelta: -600 });
    const p = planValueChange({ exists: false, next: out });
    const r = applyValueChanges(categories(), [p.request!], TODAY);
    expect(r.categories.find(c => c.id === 'etf')!.currentValue).toBe(400);
  });
});
