import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FirstInsightStep } from './steps/FirstInsightStep';
import { AccountStep } from './steps/AccountStep';
import { GoalsStep } from './steps/GoalsStep';
import { Transaction } from '../../types';
vi.mock('../../shared/providers/UiVersionProvider', () => ({useUiVersion:()=> '3.0'}));
vi.mock('../../shared/providers/settings', () => ({useSettings:()=>({accounts:[{id:'onb_existing',label:'Il mio conto'}],saveAccounts:()=>{throw new Error('must not write while rendering');}})}));
it('resumes an existing onboarding account without showing another create action', () => {
  const html=renderToStaticMarkup(<AccountStep existingAccountId="onb_existing" onNext={()=>{}}/>);
  expect(html).toContain('Il mio conto');
  expect(html).not.toContain('Crea conto');
});
it('keeps the initial balance optional and blank', () => {
  const html=renderToStaticMarkup(<AccountStep onNext={()=>{}}/>);
  expect(html).toContain('Il saldo non verrà registrato come zero');
  expect(html).toContain('value=""');
});
it('shows actual CSV counts rather than asking to add a first record after import', () => {
  const html=renderToStaticMarkup(<FirstInsightStep dataMode="csv" transactions={[{id:'a',date:'2000-01-01'}] as Transaction[]} onComplete={()=>{}}/>);
  expect(html).toContain('1 movimento registrato');
  expect(html).not.toContain('Aggiungi il primo movimento');
  expect(html).not.toContain('420');
});
it('does not invent demo financial findings when records are unavailable', () => {
  const html=renderToStaticMarkup(<FirstInsightStep dataMode="demo" onComplete={()=>{}}/>);
  expect(html).toContain('Non rappresentano le tue finanze');
  expect(html).toContain('non è ancora disponibile');
  expect(html).not.toContain('420');
  expect(html).not.toContain('66,88');
});
it('records optional interests without promising implicit feature activation', () => {
  const html=renderToStaticMarkup(<GoalsStep selected={[]} onChange={()=>{}}/>);
  expect(html).toContain('Non attivano funzioni');
  expect(html).not.toContain('Attiva il Piano');
});

it('shows a read failure instead of a reliable empty state', () => {
  const html=renderToStaticMarkup(<FirstInsightStep dataMode="manual" transactions={[]} error="Sincronizzazione non riuscita" onComplete={()=>{}}/>);
  expect(html).toContain('Sincronizzazione non riuscita');
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('Nessun movimento da leggere');
});
