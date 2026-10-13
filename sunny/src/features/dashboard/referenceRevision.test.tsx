import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AccountBalanceLineChart} from './AccountBalanceLineChart';
import {FreeCashHero} from './FreeCashHero';
import {pickNextMove} from './NextMoveCard';
import type {Insight} from '../insights/insightsEngine';
const state=vi.hoisted(()=>({version:'3.0'}));
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=>state.version}));
const props={freeCash:700,liquidity:1000,committed:200,reserve:100,income:1500,expenses:400,invested:100};
describe('reference revision financial hierarchy',()=>{
 it('supports a single recorded day with accessible daily chart controls',()=>{
  state.version='3.0';
  const html=renderToStaticMarkup(<AccountBalanceLineChart presentation="bars" lastPeriodLabel="oggi" points={[{label:'1',value:35}]} formatValue={v=>`${v} €`} onSelectPoint={()=>{}}/>);
  expect(html).toContain('role="button"');expect(html).toContain('tabindex="0"');expect(html).toContain('oggi');expect(html).not.toContain('NaN');
 });
 it('labels the UI3 hero as account liquidity and keeps free cash in its detail',()=>{
  state.version='3.0';
  const html=renderToStaticMarkup(<FreeCashHero {...props}/>);
  expect(html).toContain('Liquidità sui conti inclusi');
  expect(html).toContain('<details');
  expect(html.indexOf('1000')).toBeLessThan(html.indexOf('700'));
  expect(html).toContain('Non è il margine del Piano');
 });
 it('keeps UI2 free cash presentation',()=>{
  state.version='2.0';
  const html=renderToStaticMarkup(<FreeCashHero {...props}/>);
  expect(html).toContain('Liquidità libera');expect(html).not.toContain('<details');
 });
 it('does not turn informational forecasts or tips into UI3 priorities',()=>{
  const tips=[{title:'Informazione',category:'forecast',urgent:false}] as Insight[];
  expect(pickNextMove(tips,true)).toBeNull();
  expect(pickNextMove(tips)).toBe(tips[0]);
  const risk={title:'Rischio',category:'alert',urgent:true} as Insight;
  expect(pickNextMove([...tips,risk],true)).toBe(risk);
 });
});
