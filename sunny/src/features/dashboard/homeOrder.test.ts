import { describe, it, expect } from 'vitest';
import {
  resolveHomeOrder, moveBlock, isDefaultOrder, DEFAULT_HOME_ORDER, HomeBlockId,
} from './homeOrder';

describe("ordine dei blocchi della home", () => {
  it('senza preferenza vale il default', () => {
    expect(resolveHomeOrder(undefined)).toEqual(DEFAULT_HOME_ORDER);
    expect(resolveHomeOrder([])).toEqual(DEFAULT_HOME_ORDER);
  });

  it('rispetta un ordine salvato', () => {
    expect(resolveHomeOrder(['mossa', 'ritmo', 'uscite', 'patrimonio']))
      .toEqual(['mossa', 'ritmo', 'uscite', 'patrimonio']);
  });

  it('un ordine parziale non fa sparire i blocchi mancanti: finiscono in coda', () => {
    // È il caso di un ordine salvato PRIMA che un blocco esistesse.
    expect(resolveHomeOrder(['mossa'])).toEqual(['mossa', 'patrimonio', 'ritmo', 'uscite']);
  });

  it('scarta id sconosciuti e doppioni', () => {
    expect(resolveHomeOrder(['uscite', 'fantasma', 'uscite', 'ritmo']))
      .toEqual(['uscite', 'ritmo', 'patrimonio', 'mossa']);
  });

  it('sposta un blocco di una posizione', () => {
    const base: HomeBlockId[] = ['patrimonio', 'ritmo', 'uscite', 'mossa'];
    expect(moveBlock(base, 'ritmo', -1)).toEqual(['ritmo', 'patrimonio', 'uscite', 'mossa']);
    expect(moveBlock(base, 'ritmo', 1)).toEqual(['patrimonio', 'uscite', 'ritmo', 'mossa']);
  });

  it('ai bordi non succede nulla', () => {
    const base: HomeBlockId[] = ['patrimonio', 'ritmo', 'uscite', 'mossa'];
    expect(moveBlock(base, 'patrimonio', -1)).toEqual(base);
    expect(moveBlock(base, 'mossa', 1)).toEqual(base);
  });

  it('riconosce l\'ordine di default', () => {
    expect(isDefaultOrder(DEFAULT_HOME_ORDER)).toBe(true);
    expect(isDefaultOrder(['mossa', 'patrimonio', 'ritmo', 'uscite'])).toBe(false);
  });
});
