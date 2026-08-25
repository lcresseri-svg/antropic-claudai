import { describe, it, expect } from 'vitest';
import {
  wrappedSeasonYear, isWrappedInSeason, canOpenWrapped,
  wrappedPeriodEnd, wrappedMonthsCovered, daysInMonth,
  WRAPPED_OPEN_DAY,
} from './wrappedWindow';

describe('finestra del Wrapped', () => {
  it('si apre il 20 dicembre e resta aperto fino al 31', () => {
    expect(isWrappedInSeason('2026-12-19')).toBe(false);
    expect(isWrappedInSeason('2026-12-20')).toBe(true);
    expect(isWrappedInSeason('2026-12-25')).toBe(true);
    expect(isWrappedInSeason('2026-12-31')).toBe(true);
    expect(isWrappedInSeason('2027-01-01')).toBe(false);
    expect(isWrappedInSeason('2026-06-20')).toBe(false);
  });

  it('riparte da solo ogni anno, senza anni scritti nel codice', () => {
    // Nessun 2026 nel modulo: l'anno è sempre quello della data che arriva.
    for (const y of [2026, 2027, 2030, 2041]) {
      expect(wrappedSeasonYear(`${y}-12-${WRAPPED_OPEN_DAY}`)).toBe(y);
    }
    expect(wrappedSeasonYear('2027-11-30')).toBeNull();
  });

  it('date non valide non aprono niente e non esplodono', () => {
    for (const bad of ['', '2026-13-01', '20261220', 'ieri', '2026-12-1']) {
      expect(wrappedSeasonYear(bad)).toBeNull();
      expect(canOpenWrapped(2026, bad)).toBe(false);
    }
  });
});

describe('canOpenWrapped', () => {
  it('fuori finestra apre solo per l\'admin', () => {
    expect(canOpenWrapped(2026, '2026-08-25')).toBe(false);
    expect(canOpenWrapped(2026, '2026-08-25', { admin: true })).toBe(true);
    // Dentro la finestra non serve essere admin.
    expect(canOpenWrapped(2026, '2026-12-21')).toBe(true);
  });

  it('si racconta solo l\'anno in corso, admin compreso', () => {
    // Deep link vecchio riaperto l'anno dopo: niente Wrapped fuori stagione.
    expect(canOpenWrapped(2026, '2027-12-21')).toBe(false);
    expect(canOpenWrapped(2026, '2027-12-21', { admin: true })).toBe(false);
    expect(canOpenWrapped(2027, '2027-12-21')).toBe(true);
  });

  it('un anno non intero non è un anno', () => {
    expect(canOpenWrapped(NaN, '2026-12-21', { admin: true })).toBe(false);
    expect(canOpenWrapped(2026.5, '2026-12-21', { admin: true })).toBe(false);
  });
});

describe('periodo raccontato', () => {
  it('a dicembre copre l\'anno intero, dicembre compreso', () => {
    expect(wrappedPeriodEnd(2026, '2026-12-20')).toBe('2026-12-31');
    expect(wrappedMonthsCovered(2026, '2026-12-20')).toBe(12);
  });

  it('lanciato dall\'admin a metà anno si ferma a fine mese corrente', () => {
    expect(wrappedPeriodEnd(2026, '2026-08-25')).toBe('2026-08-31');
    expect(wrappedMonthsCovered(2026, '2026-08-25')).toBe(8);
    expect(wrappedPeriodEnd(2026, '2026-02-03')).toBe('2026-02-28');
    expect(wrappedMonthsCovered(2026, '2026-02-03')).toBe(2);
  });

  it('rispetta i bisestili', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(wrappedPeriodEnd(2028, '2028-02-10')).toBe('2028-02-29');
  });

  it('un anno già chiuso finisce il 31 dicembre', () => {
    expect(wrappedPeriodEnd(2025, '2026-08-25')).toBe('2025-12-31');
    expect(wrappedMonthsCovered(2025, '2026-08-25')).toBe(12);
  });
});
