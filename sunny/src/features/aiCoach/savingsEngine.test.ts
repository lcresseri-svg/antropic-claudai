import { describe, it, expect } from 'vitest';
import { Transaction, CategoryDef } from '../../types';
import {
  buildSavingsContext, planPurchase, planCuts, projectGoal, monthsUntil,
  MAX_CUT_SHARE, MIN_CUT_EUR,
} from './savingsEngine';

const TODAY = '2026-08-25';

const CATS: CategoryDef[] = [
  { id: 'casa', label: 'Casa', icon: '🏠', color: '#E6B95C', kind: 'expense' },
  { id: 'rist', label: 'Ristoranti', icon: '🍝', color: '#D4956A', kind: 'expense' },
  { id: 'shop', label: 'Shopping', icon: '🛍️', color: '#B5A8C8', kind: 'expense' },
  { id: 'extra', label: 'Extra', icon: '🔧', color: '#DD5B4F', kind: 'expense' },
  { id: 'stip', label: 'Stipendio', icon: '💼', color: '#8A9270', kind: 'income' },
];

let n = 0;
const tx = (over: Partial<Transaction> & { date: string }): Transaction => ({
  id: `t${n++}`, description: '', amount: 100,
  type: 'expense', category: 'casa', account: 'cc', ...over,
});

/** `count` mesi chiusi all'indietro da `TODAY`; `i` è 1 = mese scorso. */
function months(count: number, build: (ym: string, i: number) => Transaction[]): Transaction[] {
  const out: Transaction[] = [];
  const [y, m] = TODAY.split('-').map(Number);
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(...build(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, i));
  }
  return out;
}

/** `YYYY-MM` del mese chiuso numero `i` (1 = mese scorso). */
function monthKey(i: number): string {
  const [y, m] = TODAY.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - i, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const build = (transactions: Transaction[], over = {}) => buildSavingsContext({
  transactions, categories: CATS, todayISO: TODAY, liquidity: 5000, ...over,
});

/**
 * Sei mesi con 2.000 € di entrate e 1.400 € di uscite: 600 € netti al mese.
 *
 * Casa è identica ogni mese (900 €) — è così che si riconosce un costo fisso.
 * Ristoranti e shopping oscillano attorno a 300 e 200 tenendo il totale del
 * mese costante: è la forma che ha una spesa variabile vera, e senza quella
 * oscillazione il motore le classificherebbe (giustamente) come fisse.
 */
const RIST = [300, 250, 350, 300, 250, 350];
const steady = () => months(6, (ym, i) => [
  tx({ date: `${ym}-01`, type: 'income', category: 'stip', amount: 2000 }),
  tx({ date: `${ym}-10`, category: 'casa', amount: 900 }),
  tx({ date: `${ym}-15`, category: 'rist', amount: RIST[i - 1] }),
  tx({ date: `${ym}-20`, category: 'shop', amount: 500 - RIST[i - 1] }),
]);

describe('contesto', () => {
  it('misura il ritmo sui mesi chiusi, non sul mese in corso', () => {
    const ctx = build([
      ...steady(),
      // Il mese corrente è mezzo: non deve abbassare la media.
      tx({ date: '2026-08-02', category: 'casa', amount: 900 }),
    ]);
    expect(ctx.monthsOfHistory).toBe(6);
    expect(ctx.averages.map(a => a.months)).toEqual([3, 6]);
    expect(ctx.averages[0].net).toBe(600);
    expect(ctx.sustainableMonthly).toBe(600);
  });

  it('il ritmo è il PIÙ BASSO delle medie, non il più recente', () => {
    // Ultimi tre mesi eccezionali, i tre prima normali: un piano costruito
    // sui tre buoni salterebbe al primo mese normale.
    const good = months(3, ym => [tx({ date: `${ym}-01`, type: 'income', category: 'stip', amount: 3000 })]);
    const normal: Transaction[] = [];
    const [y, m] = TODAY.split('-').map(Number);
    for (let i = 4; i <= 6; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      normal.push(tx({ date: `${ym}-01`, type: 'income', category: 'stip', amount: 1000 }));
    }
    const ctx = build([...good, ...normal]);
    expect(ctx.averages.find(a => a.months === 3)!.net).toBe(3000);
    expect(ctx.averages.find(a => a.months === 6)!.net).toBe(2000);
    expect(ctx.sustainableMonthly).toBe(2000);
  });

  it('i previsti e le proiezioni non entrano nelle medie', () => {
    const ctx = build([
      ...steady(),
      tx({ date: '2026-12-01', amount: 5000 }),                    // previsto
      tx({ date: '2026-09-01', amount: 5000, projected: true }),   // proiezione
    ]);
    expect(ctx.sustainableMonthly).toBe(600);
  });

  it('ordina le categorie per peso e marca quelle su cui si può tagliare', () => {
    const ctx = build(steady());
    expect(ctx.categories.map(c => c.id)).toEqual(['casa', 'rist', 'shop']);
    // Casa è 900 € identici ogni mese: costo fisso, riconosciuto dai DATI e
    // non dal nome della categoria.
    const casa = ctx.categories.find(c => c.id === 'casa')!;
    expect(casa.nature).toBe('fixed');
    expect(casa.cuttable).toBe(0);
    expect(casa.fixedReason).toContain('identica ogni mese');
    // Ristoranti oscilla: è lì che un taglio è possibile.
    const rist = ctx.categories.find(c => c.id === 'rist')!;
    expect(rist.nature).toBe('variable');
    expect(rist.typicalMonthly).toBe(300);          // mediana di RIST
    expect(rist.cuttable).toBe(300 * MAX_CUT_SHARE);
  });

  it('una categoria troppo piccola non vale un consiglio', () => {
    const ctx = build(months(3, ym => [tx({ date: `${ym}-05`, category: 'shop', amount: MIN_CUT_EUR - 1 })]));
    expect(ctx.categories[0].cuttable).toBe(0);
  });
});

describe('natura delle categorie, letta dai dati', () => {
  it('una serie ricorrente è un contratto: si disdice, non si taglia', () => {
    // Stesso importo variabile di una spesa qualunque, ma marcato come serie.
    const ctx = build(months(6, (ym, i) => [
      tx({ date: `${ym}-05`, category: 'shop', amount: 100 + i * 20, seriesId: 'abbonamento' }),
    ]));
    const c = ctx.categories[0];
    expect(c.nature).toBe('fixed');
    expect(c.recurringShare).toBe(1);
    expect(c.fixedReason).toContain('disdicendo');
    expect(c.cuttable).toBe(0);
  });

  it('una spesa in un mese solo è una tantum, non un ritmo', () => {
    const ctx = build([
      ...steady(),
      tx({ date: `${monthKey(3)}-12`, category: 'extra', amount: 2400, description: 'Caldaia' }),
    ]);
    const extra = ctx.categories.find(c => c.id === 'extra')!;
    expect(extra.nature).toBe('oneOff');
    expect(extra.monthsPresent).toBe(1);
    expect(extra.cuttable).toBe(0);
    expect(extra.fixedReason).toContain('una tantum');
  });

  it('un picco non gonfia il ritmo: il mese tipico è la mediana', () => {
    // Shopping normale a 200, tranne un mese da 2.000.
    const ctx = build(months(6, (ym, i) => [
      tx({ date: `${ym}-05`, category: 'shop', amount: i === 3 ? 2000 : 200 + i * 10 }),
    ]));
    const shop = ctx.categories[0];
    // La media è gonfiata dal picco, la mediana no.
    expect(shop.monthlyAvg).toBeGreaterThan(500);
    expect(shop.typicalMonthly).toBeLessThan(260);
    // E il taglio si calcola sul mese tipico, non sulla media.
    expect(shop.cuttable).toBeLessThan(80);
  });

  it('con meno di tre mesi non si taglia: si starebbe indovinando', () => {
    const ctx = build(months(2, ym => [
      tx({ date: `${ym}-05`, category: 'shop', amount: 400 }),
    ]));
    expect(ctx.categories[0].nature).toBe('fixed');
    expect(ctx.categories[0].fixedReason).toContain('storico troppo corto');
    expect(ctx.categories[0].cuttable).toBe(0);
  });

  it('le una tantum vengono dichiarate al modello, non nascoste', () => {
    const ctx = build([
      ...steady(),
      tx({ date: `${monthKey(3)}-12`, category: 'extra', amount: 2400 }),
    ]);
    const p = planPurchase(ctx, 5000, '2026-10-31');
    expect(p.notes.some(t => t.includes('una tantum') && t.includes('Extra'))).toBe(true);
    expect(p.cuts.map(c => c.categoryId)).not.toContain('extra');
  });
});

describe('planPurchase', () => {
  it('una spesa che sta in un mese si dice subito', () => {
    const p = planPurchase(build(steady()), 400);
    expect(p.fitsThisMonth).toBe(true);
    expect(p.monthsToAfford).toBe(1);
  });

  it('senza scadenza calcola i mesi al ritmo sostenibile', () => {
    const p = planPurchase(build(steady()), 2400);
    expect(p.fitsThisMonth).toBe(false);
    expect(p.monthsToAfford).toBe(4);        // 2400 / 600
    expect(p.readyByISO).toBe('2026-12-01');
    expect(p.requiredMonthly).toBeNull();
  });

  it('con una scadenza dice quanto serve e se ce la si fa', () => {
    const ctx = build(steady());
    // 2400 € entro dicembre = 4 mesi = 600 €/mese: esattamente il ritmo.
    const ok = planPurchase(ctx, 2400, '2026-12-31');
    expect(ok.requiredMonthly).toBe(600);
    expect(ok.gapMonthly).toBe(0);
    expect(ok.feasible).toBe(true);

    // Stessa cifra in due mesi: servono 1.200 e il ritmo non basta.
    const tight = planPurchase(ctx, 2400, '2026-10-31');
    expect(tight.requiredMonthly).toBe(1200);
    expect(tight.gapMonthly).toBe(600);
    expect(tight.cuts.length).toBeGreaterThan(0);
    // Tagliabile: 30% del mese TIPICO di ristoranti (90) e shopping (60).
    expect(tight.cutsTotal).toBe(150);
    expect(tight.feasible).toBe(false);
  });

  it('i tagli non toccano le categorie che non si tagliano', () => {
    const p = planPurchase(build(steady()), 10000, '2026-09-30');
    expect(p.cuts.map(c => c.categoryId)).not.toContain('casa');
    // E lo dice al modello, che altrimenti proporrebbe di tagliare l'affitto.
    expect(p.notes.some(t => t.startsWith('NON proporre tagli su') && t.includes('Casa'))).toBe(true);
  });

  it('senza risparmio il traguardo non si sposta, e lo dice', () => {
    const ctx = build(months(3, ym => [
      tx({ date: `${ym}-01`, type: 'income', category: 'stip', amount: 1000 }),
      tx({ date: `${ym}-10`, category: 'casa', amount: 1000 }),
    ]));
    const p = planPurchase(ctx, 500);
    expect(ctx.sustainableMonthly).toBe(0);
    expect(p.monthsToAfford).toBeNull();
    expect(p.notes.some(t => t.includes('non è avanzato niente'))).toBe(true);
  });

  it('dichiara gli impegni fissi e lo storico corto', () => {
    const short = build(months(1, ym => [tx({ date: `${ym}-01`, type: 'income', category: 'stip', amount: 500 })]),
      { fixedMonthlyCost: 320 });
    const p = planPurchase(short, 1000);
    expect(p.notes.some(t => t.includes('1 mese'))).toBe(true);
    expect(p.notes.some(t => t.includes('320'))).toBe(true);
  });

  it('la liquidità libera basta ma il mese no: lo distingue', () => {
    const p = planPurchase(build(steady(), { freeLiquidity: 4000 }), 2400);
    expect(p.affordableNow).toBe(true);
    expect(p.fitsThisMonth).toBe(false);
    expect(p.notes.some(t => t.includes('liquidità libera'))).toBe(true);
  });

  it('avvisa quando una rata in corso libera soldi prima del traguardo', () => {
    const ctx = build(steady(), {
      endingInstallments: [{ description: 'Divano', monthly: 120, endsISO: '2026-10-31' }],
    });
    const p = planPurchase(ctx, 2400);
    expect(p.notes.some(t => t.includes('Divano') && t.includes('120'))).toBe(true);
  });
});

describe('planCuts', () => {
  it('prende dalle categorie più pesanti finché copre il bisogno', () => {
    const cuts = planCuts(build(steady()), 100);
    expect(cuts[0].categoryId).toBe('rist');
    expect(cuts.reduce((s, c) => s + c.amount, 0)).toBe(100);
  });

  it('non promette più del 30% di una categoria', () => {
    const cuts = planCuts(build(steady()), 10000);
    for (const c of cuts) expect(c.amount).toBeLessThanOrEqual(c.currentMonthly * MAX_CUT_SHARE + 0.01);
  });

  it('un obiettivo nullo non produce consigli', () => {
    expect(planCuts(build(steady()), 0)).toEqual([]);
    expect(planCuts(build(steady()), -50)).toEqual([]);
  });
});

describe('projectGoal', () => {
  it('dice se il ritmo basta per la data', () => {
    const ctx = build(steady());
    const g = projectGoal(ctx, 3000, '2026-12-31');
    expect(g.monthsAvailable).toBe(4);
    expect(g.requiredMonthly).toBe(750);
    expect(g.pace).toBe(600);
    expect(g.onTrack).toBe(false);
    expect(g.gapMonthly).toBe(150);
    expect(g.projectedAtTarget).toBe(2400);
  });

  it('tiene conto di quello che è già da parte', () => {
    const g = projectGoal(build(steady()), 3000, '2026-12-31', 1200);
    expect(g.requiredMonthly).toBe(450);
    expect(g.onTrack).toBe(true);
  });

  it('dice quando nemmeno i tagli bastano', () => {
    const g = projectGoal(build(steady()), 20000, '2026-10-31');
    expect(g.onTrack).toBe(false);
    expect(g.notes.some(t => t.includes('scoperti'))).toBe(true);
  });
});

describe('casi limite', () => {
  it('nessuna transazione: niente crash, nessuna promessa', () => {
    const ctx = build([]);
    expect(ctx.monthsOfHistory).toBe(0);
    expect(ctx.sustainableMonthly).toBe(0);
    expect(ctx.categories).toEqual([]);
    const p = planPurchase(ctx, 1000);
    expect(p.monthsToAfford).toBeNull();
    expect(p.cuts).toEqual([]);
  });

  it('monthsUntil conta i mesi pieni, non i giorni', () => {
    expect(monthsUntil('2026-08-25', '2026-12-01')).toBe(4);
    expect(monthsUntil('2026-08-01', '2026-08-31')).toBe(0);
    expect(monthsUntil('2026-12-15', '2027-03-01')).toBe(3);
  });
});
