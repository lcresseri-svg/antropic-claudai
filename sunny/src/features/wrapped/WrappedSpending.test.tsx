import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildYearWrapped} from './yearWrapped';
import {WrappedStoryBody} from './WrappedStories';
import {WrappedMacroAreas} from './WrappedMacroAreas';
import {WrappedSummary} from './WrappedSummary';
import type {CategoryDef,Transaction} from '../../types';
const cats:CategoryDef[]=[{id:'rent',label:'Affitto',kind:'expense',icon:'🏠',color:'#8FB0A0',macroCategoryId:'home'},{id:'food',label:'Pranzi',kind:'expense',icon:'🍝',color:'#E6B95C'}];
const make=()=>buildYearWrapped({year:2026,todayISO:'2026-10-20',getCat:id=>cats.find(c=>c.id===id)!,getAcc:id=>({id,label:'Banca',icon:'🏦',color:'#888888'}),macroCategories:[{id:'home',label:'Casa',icon:'🏡',color:'#8FB0A0'}],transactions:[{id:'rent',date:'2026-01-01',type:'expense',category:'rent',amount:900,account:'bank',description:'Affitto'},...[1,2,3].map(i=>({id:'p'+i,date:`2026-0${i}-02`,type:'expense',category:'food',amount:10,account:'bank',description:'Pranzo al bar'} as Transaction))]});
describe('Wrapped spending narrative',()=>{
 it('labels the macro areas and percentages rather than an unlabeled graphic',()=>{
  const html=renderToStaticMarkup(<WrappedStoryBody id="macroAreas" w={make()}/>);
  expect(html).toContain('Le grandi aree del tuo anno');expect(html).toContain('Casa');expect(html).toContain('Senza macrocategoria');expect(html).toContain('97%');
 });
 it('states the actual category share even above one third, without invented leads',()=>{
  const html=renderToStaticMarkup(<WrappedStoryBody id="topCategory" w={make()}/>);
  expect(html).toContain('97%');expect(html).not.toContain('Quasi un terzo');expect(html).not.toContain('di parecchio');expect(html).toContain('Casa');
 });
 it('describes recorded frequencies, not invented subscriptions or visits',()=>{
  const html=renderToStaticMarkup(<WrappedStoryBody id="frequentExpense" w={make()}/>);
  expect(html).toContain('La voce che torna più spesso');expect(html).toContain('Pranzo al bar');expect(html).toContain('3 mesi');expect(html).toContain('30,00');expect(html).toContain('10,00');expect(html).toContain('stessa descrizione e categoria');
  expect(html).not.toContain('abbonamento');expect(html).not.toContain('nessuno saltato');
 });
 it('keeps a net-cost explanation on the largest expense',()=>{
  const html=renderToStaticMarkup(<WrappedStoryBody id="largest" w={make()}/>);expect(html).toContain('quota a tuo carico');
 });
 it('preserves the summary cells and adds macro and habit details with current-classification context',()=>{
  const html=renderToStaticMarkup(<WrappedSummary w={make()} onGoal={()=>{}}/>);
  expect(html).toContain('Movimenti');expect(html).toContain('Le tue macro aree');expect(html).toContain('categorie attuali');expect(html).toContain('Pranzo al bar');expect(html).toContain('3 registrazioni');
 });
 it('uses singular wording when just one further macro area is summarized',()=>{
  const area=make().macroAreas[0];const html=renderToStaticMarkup(<WrappedMacroAreas areas={['a','b','c','d'].map(id=>({...area,id}))}/>);
  expect(html).toContain('Un’altra area');expect(html).not.toContain('Altre 1 aree');
 });
 it('declares planned macro figures explicitly on the story',()=>{
  const w=make();w.hasPlanned=true;const html=renderToStaticMarkup(<WrappedStoryBody id="macroAreas" w={w}/>);expect(html).toContain('programmato è compreso');
 });
});
