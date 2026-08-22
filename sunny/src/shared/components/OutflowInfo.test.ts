import { describe, it, expect } from 'vitest';
import { pickAnchor, PANEL_W, EDGE_GAP } from './OutflowInfo';

// Larghezze schermo tipiche.
const PHONE = 390;
const DESKTOP = 1280;

describe('pickAnchor (lato di apertura del popover ⓘ)', () => {
  it('si apre verso destra quando c\'è spazio', () => {
    expect(pickAnchor(20, PHONE)).toBe('left');
    expect(pickAnchor(100, DESKTOP)).toBe('left');
  });

  it('si ribalta verso sinistra vicino al bordo destro', () => {
    // Caso reale: il ⓘ dei subtotali in Movimenti sta subito prima dell'importo
    // allineato a destra, quindi a pochi pixel dal bordo.
    expect(pickAnchor(330, PHONE)).toBe('right');
    expect(pickAnchor(DESKTOP - 40, DESKTOP)).toBe('right');
  });

  it('soglia esatta: serve spazio per tutto il pannello più il margine', () => {
    const exact = PHONE - PANEL_W - EDGE_GAP;   // ultimo left che entra a destra
    expect(pickAnchor(exact, PHONE)).toBe('left');
    expect(pickAnchor(exact + 1, PHONE)).toBe('right');
  });

  it('su schermo strettissimo si ancora comunque a destra (niente overflow)', () => {
    expect(pickAnchor(10, 200)).toBe('right');
  });
});
