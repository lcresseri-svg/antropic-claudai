import { describe, it, expect } from 'vitest';
import { buildMonthlyRecap } from './monthlyRecap';
import { recapToText, recapFileName } from './recapExport';
import { Transaction, CategoryDef, AccountDef } from '../../types';
import { formatCurrency } from '../../utils';

const NOW = new Date(2026, 5, 15); // 15 giugno 2026

const getCat = (id: string): CategoryDef => ({ id, label: id, icon: '•', color: '#000', kind: 'expense' });
const getAcc = (id: string): AccountDef => ({ id, label: id.toUpperCase(), icon: '•', color: '#000' });

let seq = 0;
const tx = (date: string, type: Transaction['type'], amount: number, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${seq++}`, date, description: 'x', amount, type, category: 'spesa', account: 'cc', ...extra });

const history = (): Transaction[] => [
  tx('2026-02-03', 'income', 2000), tx('2026-02-10', 'expense', 1000),
  tx('2026-03-03', 'income', 2000), tx('2026-03-10', 'expense', 1000),
  tx('2026-04-03', 'income', 2000), tx('2026-04-10', 'expense', 1000),
  tx('2026-05-03', 'income', 2000),
  tx('2026-05-08', 'expense', 400),
  tx('2026-05-09', 'expense', 200, { category: 'svago' }),
  tx('2026-05-20', 'investment', 300, { category: 'etf' }),
];

const build = (month = '2026-05') =>
  buildMonthlyRecap({ transactions: history(), getCat, getAcc, month, now: NOW });

describe('recapToText', () => {
  it('apre con mese, stato e conteggio dei movimenti', () => {
    const t = recapToText(build());
    const lines = t.split('\n');
    expect(lines[0]).toBe('Riepilogo mensile · Maggio 2026');
    expect(lines[1]).toContain('Mese chiuso');
    expect(lines[1]).toContain('4 movimenti');   // l'investimento è un movimento
  });

  it('riporta gli stessi numeri del riepilogo, non ricalcolati', () => {
    const r = build();
    const t = recapToText(r);
    // Gli importi si formattano con la STESSA funzione della UI: se il testo
    // divergesse dai numeri a schermo, condividerlo sarebbe peggio che non
    // condividerlo. (Confrontare stringhe scritte a mano fallirebbe sullo
    // spazio unificatore che Intl mette prima dell'euro.)
    const LABEL = { income: 'Entrate', expense: 'Uscite', invest: 'Investito', saved: 'Risparmio' };
    for (const k of r.kpis) {
      expect(t).toContain(`${LABEL[k.key]}: ${formatCurrency(k.value)}`);
    }
    expect(r.totals.expense).toBe(600);
  });

  it('lo scostamento compare col segno e con il riferimento', () => {
    const r = build();
    const t = recapToText(r);
    const exp = r.kpis.find(k => k.key === 'expense')!;
    const d = exp.vsUsual?.outOfUsual ? exp.vsUsual : (exp.vsPrev ?? exp.vsUsual)!;
    // Le uscite del mese sono sotto il solito: il segno lo deve dire.
    expect(d.abs).toBe(-400);
    expect(t).toContain(`${formatCurrency(exp.value)} (${formatCurrency(d.abs, { sign: true })} vs`);
  });

  it('un mese in corso lo dichiara', () => {
    const t = recapToText(buildMonthlyRecap({
      transactions: [...history(), tx('2026-06-02', 'expense', 50)],
      getCat, getAcc, month: '2026-06', now: NOW,
    }));
    expect(t).toContain('Mese in corso, dati parziali');
  });

  it('niente markdown: il testo finisce in WhatsApp, non in un editor', () => {
    const t = recapToText(build());
    expect(t).not.toMatch(/\*\*|^#/m);
  });

  it('chiude con la data di generazione in formato italiano', () => {
    const t = recapToText(build());
    expect(t.trim().endsWith('Generato da Sunny il 15/06/2026')).toBe(true);
  });

  it('il nome file porta il mese', () => {
    expect(recapFileName(build())).toBe('riepilogo-2026-05.txt');
  });
});
