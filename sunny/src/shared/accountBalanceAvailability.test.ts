import {describe,expect,it} from 'vitest';
import {hasRecordedAccountBalance} from './accountBalanceAvailability';
describe('balance data availability, independent of the numeric result',()=>{
  it('keeps an undeclared empty account distinct from a declared zero',()=>{
    expect(hasRecordedAccountBalance([{id:'bank'}],{})).toBe(false);
    expect(hasRecordedAccountBalance([{id:'bank',initialBalance:0}],{})).toBe(true);
  });
  it('accepts a recorded zero while respecting the wealth perimeter',()=>{
    expect(hasRecordedAccountBalance([{id:'bank'}],{bank:0})).toBe(true);
    expect(hasRecordedAccountBalance([{id:'bank',initialBalance:0,excludeFromNetWorth:true}],{bank:0})).toBe(false);
  });
});
