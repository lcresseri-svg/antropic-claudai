import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import { buildMonthSections, dayLabel, relativeDayLabel, daysBetween } from './listGrouping';

const TODAY = '2026-08-24';

let n = 0;
const tx = (date: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, date, description: 'x', amount: 10,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

const upcoming = (t: Transaction) => !!t.projected || t.date > TODAY;

describe('buildMonthSections', () => {
  it('raggruppa per mese e per giorno mantenendo l\'ordine di arrivo', () => {
    const rows = [tx('2026-08-24'), tx('2026-08-23'), tx('2026-08-23'), tx('2026-07-30')];
    const sections = buildMonthSections(rows, upcoming);

    expect(sections.map(s => s.ym)).toEqual(['2026-08', '2026-07']);
    expect(sections[0].days.map(d => d.iso)).toEqual(['2026-08-24', '2026-08-23']);
    expect(sections[0].days[1].txs).toHaveLength(2);
    expect(sections[0].realizedCount).toBe(3);
    expect(sections[0].upcomingCount).toBe(0);
  });

  it('i giorni programmati restano al loro posto cronologico, non in fondo', () => {
    // Lista dal più recente al più vecchio (l'ordinamento di default): il 28
    // previsto viene PRIMA del 24 fatto, perché è lì che cade.
    const rows = [tx('2026-08-28'), tx('2026-08-24'), tx('2026-08-20')];
    const sections = buildMonthSections(rows, upcoming);

    expect(sections[0].days.map(d => d.iso)).toEqual(['2026-08-28', '2026-08-24', '2026-08-20']);
    expect(sections[0].days[0].upcoming).toBe(true);
    expect(sections[0].upcomingCount).toBe(1);
    expect(sections[0].realizedCount).toBe(2);
    // `txs` segue i giorni: i totali di mese e quelli dei giorni si leggono
    // dalla stessa lista.
    expect(sections[0].txs.map(t => t.date)).toEqual(['2026-08-28', '2026-08-24', '2026-08-20']);
  });

  it('con l\'ordinamento invertito i programmati finiscono in fondo, da soli', () => {
    // Stesse righe, ordine crescente: il modulo non decide niente, segue.
    const rows = [tx('2026-08-20'), tx('2026-08-24'), tx('2026-08-28')];
    const sections = buildMonthSections(rows, upcoming);

    expect(sections[0].days.map(d => d.iso)).toEqual(['2026-08-20', '2026-08-24', '2026-08-28']);
    expect(sections[0].days[2].upcoming).toBe(true);
  });

  it('più giorni programmati di fila restano in ordine fra loro', () => {
    const rows = [tx('2026-09-02'), tx('2026-08-30'), tx('2026-08-28'), tx('2026-08-24')];
    const sections = buildMonthSections(rows, upcoming);

    expect(sections.map(s => s.ym)).toEqual(['2026-09', '2026-08']);
    expect(sections[1].days.map(d => d.iso)).toEqual(['2026-08-30', '2026-08-28', '2026-08-24']);
    expect(sections[1].days.map(d => d.upcoming)).toEqual([true, true, false]);
  });

  it('un giorno misto (fatto + previsto) resta al suo posto', () => {
    const rows = [tx('2026-08-24'), tx('2026-08-24', { projected: true })];
    const sections = buildMonthSections(rows, upcoming);
    expect(sections[0].days).toHaveLength(1);
    expect(sections[0].days[0].upcoming).toBe(false);
    expect(sections[0].upcomingCount).toBe(1);
  });

  it('nessuna riga, nessuna sezione', () => {
    expect(buildMonthSections([], upcoming)).toEqual([]);
  });
});

describe('etichette dei giorni', () => {
  it('oggi, ieri e domani hanno un nome; gli altri giorni no', () => {
    expect(dayLabel('2026-08-24', TODAY)).toBe('Oggi · 24 agosto');
    expect(dayLabel('2026-08-23', TODAY)).toBe('Ieri · 23 agosto');
    expect(dayLabel('2026-08-25', TODAY)).toBe('Domani · 25 agosto');
    expect(dayLabel('2026-08-07', TODAY)).toBe('7 agosto');
  });

  it('la distanza dei previsti si legge in giorni', () => {
    expect(relativeDayLabel('2026-08-28', TODAY)).toBe('fra 4 giorni');
    expect(relativeDayLabel('2026-08-25', TODAY)).toBe('domani');
    expect(relativeDayLabel('2026-08-24', TODAY)).toBe('oggi');
    expect(daysBetween('2026-09-01', TODAY)).toBe(8);
    expect(daysBetween('2026-08-20', TODAY)).toBe(-4);
  });

  it('il cambio di ora legale non sposta il conteggio dei giorni', () => {
    // 25 ottobre 2026: in Europe/Rome l\'ora legale finisce, la giornata dura 25h.
    expect(daysBetween('2026-10-26', '2026-10-25')).toBe(1);
    expect(relativeDayLabel('2026-10-26', '2026-10-25')).toBe('domani');
  });
});
