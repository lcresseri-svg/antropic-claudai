import {beforeEach,describe,it,expect,vi} from 'vitest';
import {hasSeenWhatsNew,markWhatsNewSeen} from './whatsNewStorage';
describe('release acknowledgement',()=>{
 beforeEach(()=>vi.unstubAllGlobals());
 it('shows a new release to each user, independently of older releases',()=>{
  const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
  markWhatsNewSeen('one','2.0.0');expect(hasSeenWhatsNew('one','2.1.0')).toBe(false);
  markWhatsNewSeen('one','2.1.0');expect(hasSeenWhatsNew('one','2.1.0')).toBe(true);expect(hasSeenWhatsNew('two','2.1.0')).toBe(false);
 });
 it('does not throw or repeatedly open if storage is unavailable',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('unavailable');},setItem:()=>{throw Error('unavailable');}});
  expect(hasSeenWhatsNew('one','2.1.0')).toBe(true);expect(()=>markWhatsNewSeen('one','2.1.0')).not.toThrow();
 });
});
