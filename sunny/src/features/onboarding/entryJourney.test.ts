import { describe, expect, it } from 'vitest';
import { entryStage, nextAfterSource, parseOpeningBalance, buildFirstReading } from './entryJourney';
import { Transaction } from '../../types';
describe('UI3 initial journey with existing persisted step ids', () => {
  it('requires account setup before source processing without enabling optional features', () => {
    for (const mode of ['manual', 'csv', 'demo'] as const) expect(nextAfterSource(mode, false)).toBe('account');
    expect(nextAfterSource('manual', true)).toBe('reading');
    expect(nextAfterSource('csv', true)).toBe('import');
    expect(nextAfterSource('demo', true)).toBe('demo-confirmation');
  });
  it('keeps old resumable goals and savings steps contextual', () => {
    expect([0,1,2,3,4,5].map(entryStage)).toEqual([0,2,1,0,2,2]);
  });
  it('keeps unknown balances absent, accepts declared zero and rejects invalid input', () => {
    expect(parseOpeningBalance('')).toEqual({});
    expect(parseOpeningBalance('  ')).toEqual({});
    expect(parseOpeningBalance('0')).toEqual({ initialBalance: 0 });
    expect(parseOpeningBalance('-12,50')).toEqual({ initialBalance: -12.5 });
    for(const value of ['NaN','12oops','Infinity']) expect(() => parseOpeningBalance(value)).toThrow();
  });
  it('does not turn unavailable records into zero or fabricated insight', () => {
    expect(buildFirstReading('csv', undefined, false).kind).toBe('unavailable');
    expect(buildFirstReading('manual', [], true).kind).toBe('loading');
    expect(buildFirstReading('manual', [], false).kind).toBe('empty');
  });
  it('distinguishes imported records, scheduled items and demo data', () => {
    const tx = [{ id:'a',date:'2026-01-01' }, {id:'b',date:'2099-01-01'}] as Transaction[];
    expect(buildFirstReading('csv',tx,false,'2026-10-19')).toMatchObject({kind:'ready',recorded:1,scheduled:1,demo:false});
    expect(buildFirstReading('demo',tx,false,'2026-10-19')).toMatchObject({kind:'ready',demo:true});
  });
});
