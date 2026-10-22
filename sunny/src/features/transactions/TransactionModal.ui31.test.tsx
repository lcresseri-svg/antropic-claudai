import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { TransactionModal } from './TransactionModal';
const harness = vi.hoisted(() => ({
  version: '3.0', values: [] as unknown[], refs: [] as {current:any}[], dependencies: [] as unknown[][],
  stateIndex: 0, refIndex: 0, effectIndex: 0, dirty: false, effects: [] as (()=>void)[],
  categories: [{id:'food',label:'Cibo',icon:'🍎',color:'#996600',kind:'expense'}, {id:'salary',label:'Stipendio',icon:'',color:'#006600',kind:'income'}, {id:'fund',label:'Fondo',icon:'',color:'#999900',kind:'investment',fundType:'pension'}],
  accounts: [{id:'bank',label:'Banca',icon:'',color:'#666666'}],
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: any) => {
    const index = harness.stateIndex++;
    if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[index], (next:any) => { const value = typeof next === 'function' ? next(harness.values[index]) : next; if (!Object.is(value,harness.values[index])) { harness.values[index]=value; harness.dirty=true; } }];
  },
  useRef: (value:any) => harness.refs[harness.refIndex++] ?? (harness.refs[harness.refIndex-1] = {current:value}),
  useMemo: (fn:()=>unknown) => fn(), useCallback: (fn:any) => fn,
  useLayoutEffect: vi.fn(),
  useEffect: (fn:()=>void, dependencies:unknown[]) => {
    const index = harness.effectIndex++, previous = harness.dependencies[index];
    if (!previous || dependencies.some((value,i)=>!Object.is(value,previous[i]))) { harness.dependencies[index]=dependencies; harness.effects.push(fn); }
  },
}));
vi.mock('../../shared/providers/UiVersionProvider', () => ({ useUiVersion:()=>harness.version }));
vi.mock('../../shared/providers/settings', () => ({useSettings:()=>({
  categories:harness.categories, visibleCategories:harness.categories, accounts:harness.accounts, visibleAccounts:harness.accounts,
  enableInvestments:true, detailedInvestments:true, theme:'light', getAcc:()=>harness.accounts[0],
})}));
vi.mock('../../shared/hooks/useEscapeKey',()=>({useEscapeKey:vi.fn()}));
vi.mock('../../shared/useScrollLock',()=>({useScrollLock:vi.fn()}));
vi.mock('../../shared/hooks/useMediaQuery',()=>({useMediaQuery:()=>false}));
function nodes(node:ReactNode):ReactElement<any>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el=node as ReactElement<any>; return [el,...nodes(el.props?.children)];
}
const callbacks = {onSave:vi.fn(),onClose:vi.fn()};
function view(extra:Partial<Parameters<typeof TransactionModal>[0]> = {}) {
  let result:ReactElement<any>[]=[];
  for(let i=0;i<10;i++) {
    harness.stateIndex=0; harness.refIndex=0; harness.effectIndex=0; harness.dirty=false;
    result=nodes(TransactionModal({open:true,...callbacks,...extra}));
    const effects=harness.effects.splice(0); effects.forEach(fn=>fn());
    if(!harness.dirty) return result;
  }
  throw new Error('Unstable test render');
}
function input(label:string, tree=view()) { const field=tree.find(el=>el.type==='input'&&el.props['aria-label']===label); expect(field,label).toBeDefined(); return field!; }

describe('UI3 movement editor',()=>{
  beforeEach(()=>{
    harness.values=[]; harness.refs=[]; harness.dependencies=[]; harness.effects=[]; harness.version='3.0';
    callbacks.onSave.mockReset(); callbacks.onClose.mockReset();
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn()});
  });
  it('opens directly on the default type with optional description and a visible type switch',()=>{
    const tree=view({defaultType:'expense'});
    expect(tree.some(el=>el.type==='button'&&el.props.children==='Entrata')).toBe(true);
    expect(input('Descrizione facoltativa',tree).props.value).toBe('');
    expect(input('Importo',tree).props.value).toBe('');
  });
  it('keeps an Apple Pay review fixed to an outgoing expense',()=>{
    const tree=view({defaultType:'expense',typeLocked:true,awaitSave:true,singleSave:true,initialValues:{source:'apple_pay',amount:12,account:'bank',category:'food'}});
    expect(tree.some(el=>el.type==='button'&&el.props.children==='Entrata')).toBe(false);
    expect(tree.some(el=>el.type==='button'&&el.props.children==='Trasferimento')).toBe(false);
    tree.find(el=>el.type==='form')!.props.onSubmit({preventDefault:vi.fn()});
    expect(callbacks.onSave.mock.calls[0][1][0]).toMatchObject({type:'expense',amount:12});
  });
  it('permits one awaited write per submit and preserves input on rejection',async()=>{
    let reject!: (reason:Error)=>void;
    callbacks.onSave.mockImplementation(()=>new Promise((_,fail)=>{reject=fail;}));
    const extra={awaitSave:true};
    input('Importo',view(extra)).props.onChange({target:{value:'12,50'}});
    const form=view(extra).find(el=>el.type==='form')!;
    form.props.onSubmit({preventDefault:vi.fn()}); form.props.onSubmit({preventDefault:vi.fn()});
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    expect(callbacks.onSave.mock.calls[0][1][0]).toMatchObject({type:'expense',amount:12.5,account:'bank',category:'food'});
    reject(new Error('offline')); await Promise.resolve(); await Promise.resolve();
    const tree=view(extra);
    expect(input('Importo',tree).props.value).toBe('12,50');
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(tree.some(el=>el.props.children==='Riprova')).toBe(true);
  });
  it('describes an ordinary write error without claiming an atomic investment update',async()=>{
    callbacks.onSave.mockRejectedValue(new Error('offline'));
    const extra={awaitSave:true};
    input('Importo',view(extra)).props.onChange({target:{value:'12'}});
    view(extra).find(el=>el.type==='form')!.props.onSubmit({preventDefault:vi.fn()});
    await Promise.resolve(); await Promise.resolve();
    const error=view(extra).find(el=>el.props.role==='alert');
    expect(error).toBeDefined();
    expect(JSON.stringify(error!.props.children)).not.toContain('controvalore');
  });
  it('preserves an investment withdrawal, its commission and statistical inputs on edit',()=>{
    const editing={id:'investment',type:'investment' as const,description:'Rientro',amount:250,date:'2026-09-20',category:'fund',account:'bank',direction:'out' as const,groupId:'fees',statsSpreadMonths:6};
    const fee={id:'fee',type:'expense' as const,description:'Commissione',amount:3,date:editing.date,category:'food',account:'bank',groupId:'fees'};
    const tree=view({editing,groupTransfers:[fee]});
    tree.find(el=>el.type==='form')!.props.onSubmit({preventDefault:vi.fn()});
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    const [deleted,created]=callbacks.onSave.mock.calls[0];
    expect(deleted).toEqual(['investment','fee']);
    expect(created[0]).toMatchObject({type:'investment',direction:'out',amount:250,account:'bank',groupId:'fees'});
    expect(created[0].statsSpreadMonths).toBeUndefined();
    expect(created[1]).toMatchObject({type:'expense',amount:3,groupId:'fees'});
  });
  it('keeps the personal expense and settlement amounts distinct when editing a shared expense',()=>{
    const editing={id:'expense',type:'expense' as const,description:'Cena',amount:60,date:'2026-09-20',category:'food',account:'bank',groupId:'shared'};
    const settlement={id:'settlement',type:'transfer' as const,description:'Quota',amount:40,date:editing.date,category:'trasferimento',account:'bank',toAccount:'cash',groupId:'shared'};
    const tree=view({editing,groupTransfers:[settlement],awaitSave:true});
    expect(input('Importo',tree).props.value).toBe('100');
    tree.find(el=>el.type==='form')!.props.onSubmit({preventDefault:vi.fn()});
    const [deleted,created]=callbacks.onSave.mock.calls[0];
    expect(deleted).toEqual(['expense','settlement']);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({type:'transfer',amount:40,toAccount:'cash',groupId:'shared'});
    expect(created[1]).toMatchObject({type:'expense',amount:60,groupId:'shared'});
  });
  it('preserves a subscription series link and its future-occurrence scope',()=>{
    const editing={id:'template',type:'expense' as const,description:'Abbonamento',amount:19,date:'2026-11-01',category:'food',account:'bank',seriesId:'series',seriesMeta:{kind:'subscription' as const,createdAt:42},recurring:{freq:'monthly' as const,mode:'interval' as const,interval:1,until:'2027-11-01'}};
    const tree=view({editing,seriesEdit:true,awaitSave:true});
    expect(tree.some(el=>String(el.props.children).includes('occorrenze future'))).toBe(true);
    tree.find(el=>el.type==='form')!.props.onSubmit({preventDefault:vi.fn()});
    expect(callbacks.onSave.mock.calls[0][1]).toHaveLength(1);
    expect(callbacks.onSave.mock.calls[0][1][0]).toMatchObject({type:'expense',amount:19,seriesId:'series',seriesMeta:{kind:'subscription',createdAt:42},recurring:{freq:'monthly',until:'2027-11-01'}});
  });
  it('keeps refund actions linked to the real expense',()=>{
    const editing={id:'expense',type:'expense' as const,description:'Acquisto',amount:100,date:'2026-09-20',category:'food',account:'bank'};
    const onRegisterRefund=vi.fn();
    const tree=view({editing,onRegisterRefund});
    tree.find(el=>el.type==='button'&&el.props.children==='Registra storno')!.props.onClick();
    expect(onRegisterRefund).toHaveBeenCalledWith('expense');
    expect(tree.findIndex(el=>el.type==='input'&&el.props['aria-label']==='Importo')).toBeLessThan(tree.findIndex(el=>el.props.children==='Storni'));
  });
  it('keeps the UI2 quick entry presentation',()=>{
    harness.version='2.0';
    const tree=view({defaultType:'expense'});
    expect(tree.some(el=>el.type==='button'&&el.props.children==='Entrata')).toBe(false);
    expect(tree.some(el=>el.props.children==='Tocca per scrivere la descrizione')).toBe(true);
  });
});
