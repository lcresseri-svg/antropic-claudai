import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { MultiRefundSheet } from './MultiRefundSheet';
import { AmountBlock } from '../investments/SheetShell';
const state=vi.hoisted(()=>({locals:[] as any[],index:0,effectIndex:0,deps:[] as any[],effects:[] as (()=>void)[],dirty:false}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(init:any)=>{
  const index=state.index++;if(!(index in state.locals))state.locals[index]=typeof init==='function'?init():init;
  return [state.locals[index],(value:any)=>{const next=typeof value==='function'?value(state.locals[index]):value;if(!Object.is(next,state.locals[index])){state.locals[index]=next;state.dirty=true;}}];
},useMemo:(fn:()=>unknown)=>fn(),useEffect:(fn:()=>void,deps:any[])=>{const index=state.effectIndex++;if(!state.deps[index]||deps.some((x,i)=>!Object.is(x,state.deps[index][i]))){state.deps[index]=deps;state.effects.push(fn);}}}));
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({visibleAccounts:[{id:'bank',label:'Banca',icon:'🏦'}],getCat:(id:string)=>({label:id,icon:'',color:'#ccc'}),getAcc:(id:string)=>({label:id})})}));
const source=(id:string,amount:number)=>({id,type:'expense' as const,amount,date:'2026-10-01',description:id,category:'food',account:'bank'});
const props={open:true,transactions:[source('a',60),source('b',40)],expenseIds:['a','b'],onSave:vi.fn(),onClose:vi.fn()};
function nodes(node:ReactNode):ReactElement<any>[] {if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);const el=node as ReactElement<any>;return[el,...nodes(el.props?.children)];}
function view(extra:Partial<Parameters<typeof MultiRefundSheet>[0]>={}){for(let i=0;i<8;i++){state.index=0;state.effectIndex=0;state.dirty=false;const result=nodes(MultiRefundSheet({...props,...extra}));state.effects.splice(0).forEach(fn=>fn());if(!state.dirty)return result;}throw new Error('Unstable sheet');}
function submit(tree:ReactElement<any>[]){return tree.find(el=>el.type==='button'&&el.props.children!=='Chiudi')!;}
describe('MultiRefundSheet',()=>{
  beforeEach(()=>{state.locals=[];state.deps=[];state.effects=[];state.index=0;state.effectIndex=0;props.onSave.mockReset();props.onClose.mockReset();});
  it('keeps amount and stable receipt identity after a failed save and retry',async()=>{
    const initial=view();initial.find(el=>el.type===AmountBlock)!.props.onChange('80');
    props.onSave.mockRejectedValueOnce(new Error('Connessione assente')).mockResolvedValueOnce(undefined);
    await submit(view()).props.onClick();
    const failed=view();
    expect(failed.some(el=>el.props.role==='alert')).toBe(true);
    expect(failed.find(el=>el.type===AmountBlock)!.props.value).toBe('80');
    expect(props.onClose).not.toHaveBeenCalled();
    await submit(failed).props.onClick();
    expect(props.onSave).toHaveBeenCalledTimes(2);
    const first=props.onSave.mock.calls[0][0],second=props.onSave.mock.calls[1][0];
    expect(first.receiptId).toBe(second.receiptId);expect(first.expenseIds).toEqual(['a','b']);expect(first.amount).toBe(80);
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it('opens an existing receipt with its full amount including gain and existing identity',()=>{
    const transactions=[...props.transactions,{...source('r1',60),type:'refund' as const,refundOf:'a',refundGroupId:'existing'},{...source('r2',40),type:'refund' as const,refundOf:'b',refundGroupId:'existing'},{...source('gain',20),type:'income' as const,refundGroupId:'existing'}];
    const tree=view({transactions,editingGroupId:'existing'});
    expect(tree.find(el=>el.type===AmountBlock)!.props.value).toBe('120');
    expect(submit(tree).props.disabled).toBe(false);
  });
  it('blocks missing sources while preserving the entered draft',()=>{
    view().find(el=>el.type===AmountBlock)!.props.onChange('80');
    const tree=view({transactions:[props.transactions[0]]});
    expect(submit(tree).props.disabled).toBe(true);
    expect(tree.find(el=>el.type===AmountBlock)!.props.value).toBe('80');
  });
  it('confirms deletion of the whole receipt, preserves errors and permits retry',async()=>{
    const onDelete=vi.fn().mockRejectedValueOnce(new Error('Eliminazione non riuscita')).mockResolvedValueOnce(undefined);
    const extra={editingGroupId:'existing',onDelete};
    view(extra).find(el=>el.props.children==='Elimina ricevuta')!.props.onClick();
    expect(onDelete).not.toHaveBeenCalled();
    await view(extra).find(el=>el.props.children==='Conferma eliminazione ricevuta')!.props.onClick();
    await Promise.resolve();
    const failed=view(extra);
    expect(failed.some(el=>el.props.role==='alert'&&el.props.children==='Eliminazione non riuscita')).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
    await failed.find(el=>el.props.children==='Conferma eliminazione ricevuta')!.props.onClick();
    await Promise.resolve();
    expect(onDelete).toHaveBeenCalledTimes(2);expect(props.onClose).toHaveBeenCalledOnce();expect(props.onSave).not.toHaveBeenCalled();
  });
  it('blocks saving while the complete receipt sources are loading or failed',()=>{
    view().find(el=>el.type===AmountBlock)!.props.onChange('80');
    expect(submit(view({loadingSources:true})).props.disabled).toBe(true);
    const failed=view({sourceError:'Ricevuta non disponibile'});
    expect(submit(failed).props.disabled).toBe(true);
    expect(failed.some(el=>el.props.role==='alert'&&el.props.children==='Ricevuta non disponibile')).toBe(true);
  });
});
