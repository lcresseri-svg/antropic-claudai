import { describe, it, expect } from 'vitest';
import { applyKeypadKey, sanitizeNumericInput } from './amountKeypad';

/** Digita una sequenza di tasti da un campo vuoto. */
const type = (keys: string, opts?: Parameters<typeof applyKeypadKey>[2]) =>
  [...keys].reduce((v, k) => applyKeypadKey(v, k, opts), '');

describe('applyKeypadKey', () => {
  it('accoda le cifre e sostituisce lo zero iniziale', () => {
    expect(type('1234')).toBe('1234');
    expect(applyKeypadKey('0', '5')).toBe('5');
    // Uno zero che non è più il primo carattere resta dov'è.
    expect(applyKeypadKey('10', '5')).toBe('105');
  });

  it('ammette una sola virgola, mai come primo carattere', () => {
    expect(type(',')).toBe('0,');
    expect(type('12,50')).toBe('12,50');
    expect(applyKeypadKey('12,5', ',')).toBe('12,5');
    // Anche il punto conta come separatore già presente (valore arrivato da
    // un documento salvato o dalla tastiera di sistema).
    expect(applyKeypadKey('12.5', ',')).toBe('12.5');
  });

  it('si ferma a due decimali', () => {
    expect(type('12,567')).toBe('12,56');
    expect(applyKeypadKey('12.99', '9')).toBe('12.99');
    // La parte intera invece non ha limiti.
    expect(type('123456789')).toBe('123456789');
  });

  it('un campo intero non accetta la virgola', () => {
    const intero = { integer: true };
    expect(type('12,5', intero)).toBe('125');
    expect(applyKeypadKey('12', ',', intero)).toBe('12');
  });

  it('la cancellazione toglie un carattere alla volta, anche la virgola', () => {
    expect(applyKeypadKey('12,50', 'back')).toBe('12,5');
    expect(applyKeypadKey('12,', 'back')).toBe('12');
    expect(applyKeypadKey('1', 'back')).toBe('');
    // Su un campo già vuoto non succede niente.
    expect(applyKeypadKey('', 'back')).toBe('');
  });

  it('un tasto che non esiste non tocca il campo', () => {
    for (const k of ['a', '', '.', '-', '12']) {
      expect(applyKeypadKey('12,5', k)).toBe('12,5');
    }
  });

  it('i decimali ammessi si possono cambiare', () => {
    expect(applyKeypadKey('1,2', '3', { decimals: 1 })).toBe('1,2');
    expect(applyKeypadKey('1,23', '4', { decimals: 3 })).toBe('1,234');
  });
});

describe('sanitizeNumericInput', () => {
  it('toglie tutto quello che non è un numero', () => {
    expect(sanitizeNumericInput('12,50 €')).toBe('12,50');
    expect(sanitizeNumericInput('ab1c2')).toBe('12');
  });

  it('su un campo intero toglie anche i separatori', () => {
    expect(sanitizeNumericInput('12,5', { integer: true })).toBe('125');
  });
});
