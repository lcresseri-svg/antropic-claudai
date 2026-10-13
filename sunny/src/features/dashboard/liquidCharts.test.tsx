import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Donut} from './Donut';
import {CategoryTrendLineChart} from './CategoryTrendLineChart';
import {AccountBalanceLineChart} from './AccountBalanceLineChart';
import {WealthLineChart} from './WealthLineChart';
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=> '3.0'}));
const formatValue=(v:number)=>`${v} €`;
describe('UI3 exact chart presentation',()=>{
 it('represents negative composition as values instead of positive wedges',()=>{
  const html=renderToStaticMarkup(<Donut segments={[{label:'Debito',value:-100,color:'red'},{label:'Contanti',value:200,color:'blue'}]}/>);
  expect(html).not.toContain('<svg');expect(html).toContain('Debito');expect(html).toContain('100');
 });
 it('distinguishes recorded zero samples from unavailable history',()=>{
  const html=renderToStaticMarkup(<CategoryTrendLineChart points={[{label:'Ago',value:0},{label:'Set',value:0}]} color="red" formatValue={formatValue}/>);
  expect(html).toContain('Vedi dati');expect(html).not.toContain('Appena avrai');
 });
 it('keeps negative category values in the plotted domain and count units truthful',()=>{
  const html=renderToStaticMarkup(<CategoryTrendLineChart points={[{label:'Ago',value:100},{label:'Set',value:-50}]} color="red" formatValue={formatValue} unit="movimenti" metricLabel="Movimenti"/>);
  const markers=[...html.matchAll(/ cy="([^"]+)"/g)].map(m=>Number(m[1]));
  expect(markers.length).toBe(2);expect(markers.every(y=>y>=14&&y<=90)).toBe(true);
  expect(html).toContain('valori in movimenti');expect(html).not.toContain('valori in euro');
 });
 it('presents monthly income as bars and offers optional wealth series controls',()=>{
  const income=renderToStaticMarkup(<AccountBalanceLineChart presentation="bars" title="Entrate" metricLabel="Entrate" points={[{label:'Ago',value:0},{label:'Set',value:200}]} formatValue={formatValue}/>);
  expect((income.match(/data-chart-bar/g)||[]).length).toBe(2);expect(income).toContain('ultimo mese');
  const p=[{date:'2026-08-01',label:'Ago',total:0,liquidity:-10,investments:10},{date:'2026-09-01',label:'Set',total:50,liquidity:20,investments:30}];
  const html=renderToStaticMarkup(<WealthLineChart points={p} formatValue={formatValue}/>);
  expect(html).toContain('Nascondi Liquidità');expect(html).toContain('Nascondi Investimenti');
 });
 it('uses unique SVG IDs and linear paths without invented extrema',()=>{
  const p=[{date:'2026-08-01',label:'Ago',total:0,liquidity:-10,investments:10},{date:'2026-09-01',label:'Set',total:50,liquidity:20,investments:30}];
  const html=renderToStaticMarkup(<><WealthLineChart points={p} formatValue={formatValue}/><WealthLineChart points={p} formatValue={formatValue}/></>);
  const ids=[...html.matchAll(/linearGradient id="([^"]+)"/g)].map(m=>m[1]);expect(new Set(ids).size).toBe(2);
  expect(html).not.toMatch(/ d="[^"]* C /);expect(html).toContain('non ancorata allo zero');
 });
});
