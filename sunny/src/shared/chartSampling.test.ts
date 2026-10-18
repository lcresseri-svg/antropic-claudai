import {describe,it,expect} from 'vitest';
import {sampleLineIndexes} from './chartSampling';
describe('drawing long exact time series',()=>{
 it('keeps endpoints and bucket extrema without inventing samples',()=>{
  const values=Array.from({length:24000},()=>100);values[50]=-90;values[100]=900;
  const indexes=sampleLineIndexes(values);
  expect(indexes[0]).toBe(0);expect(indexes[indexes.length-1]).toBe(23999);
  expect(indexes).toContain(50);expect(indexes).toContain(100);
  expect(indexes.length).toBeLessThanOrEqual(242);
  expect(indexes).toEqual([...new Set(indexes)].sort((a,b)=>a-b));
 });
 it('keeps short and empty series exact',()=>{
  expect(sampleLineIndexes([])).toEqual([]);
  expect(sampleLineIndexes([2])).toEqual([0]);
  expect(sampleLineIndexes([1,3,0])).toEqual([0,1,2]);
 });
});
