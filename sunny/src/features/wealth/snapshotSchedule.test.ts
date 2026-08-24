import { describe, it, expect } from 'vitest';
import { shouldWriteSnapshot, daysBetweenKeys, SNAPSHOT_EVERY_DAYS } from './snapshotSchedule';

describe('cadenza degli snapshot', () => {
  it('senza storico si fotografa subito', () => {
    expect(shouldWriteSnapshot(null, '2026-08-24')).toBe(true);
  });

  it('prima dei sette giorni non si riscrive', () => {
    expect(shouldWriteSnapshot('2026-08-24', '2026-08-24')).toBe(false);
    expect(shouldWriteSnapshot('2026-08-24', '2026-08-30')).toBe(false);
  });

  it('al settimo giorno si fotografa di nuovo', () => {
    expect(shouldWriteSnapshot('2026-08-24', '2026-08-31')).toBe(true);
  });

  it('chi apre l\'app di rado ottiene comunque un punto', () => {
    expect(shouldWriteSnapshot('2026-05-01', '2026-08-24')).toBe(true);
  });

  it('una data futura non blocca gli snapshot per sempre', () => {
    // Orologio spostato indietro o backup ripristinato: senza questa guardia
    // il confronto resterebbe negativo e non si scriverebbe mai più.
    expect(shouldWriteSnapshot('2027-01-01', '2026-08-24')).toBe(true);
  });

  it('il conteggio dei giorni non risente del cambio di ora legale', () => {
    // 25 ottobre 2026: in Europe/Rome quella giornata dura 25 ore.
    expect(daysBetweenKeys('2026-10-20', '2026-10-27')).toBe(7);
    expect(shouldWriteSnapshot('2026-10-20', '2026-10-27')).toBe(true);
  });

  it('la cadenza è configurabile e il default è settimanale', () => {
    expect(SNAPSHOT_EVERY_DAYS).toBe(7);
    expect(shouldWriteSnapshot('2026-08-24', '2026-08-26', 2)).toBe(true);
    expect(shouldWriteSnapshot('2026-08-24', '2026-08-25', 2)).toBe(false);
  });
});
