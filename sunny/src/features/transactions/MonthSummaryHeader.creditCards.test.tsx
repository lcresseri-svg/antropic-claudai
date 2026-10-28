import { describe, expect, it } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { Transaction } from '../../types';
import { MonthSummaryHeader } from './MonthSummaryHeader';
function nodes(node:ReactNode):ReactElement<any>[] {
  if(!node||typeof node!=='object')return[];
  if(Array.isArray(node))return node.flatMap(nodes);
  const element=node as ReactElement<any>;return[element,...nodes(element.props?.children)];
}
describe('monthly transaction statistical header',()=>{
  it('keeps deferred investments in the movement-date legend',()=>{
    const realized:Transaction[]=[{id:'investment',date:'2026-10-15',description:'Versamento',account:'card',category:'fund',type:'investment',amount:100,cashDelta:0}];
    const tree=nodes(MonthSummaryHeader({ym:'2026-10',realized,realizedCount:1,upcomingCount:0,net:-100}));
    const legend=tree.find(el=>el.type==='span'&&Array.isArray(el.props.children)&&el.props.children.includes('investiti'));
    expect(legend).toBeDefined();
    expect(nodes(legend).find(el=>el.props.className==='balance-num')?.props.children).toBe('100');
  });
  it('includes deferred card income and excludes refunds and settlement cash from income',()=>{
    const common={date:'2026-09-15',description:'Movement',account:'card',category:'salary'};
    const realized:Transaction[]=[
      {...common,id:'income',type:'income',amount:50,cashDelta:0},
      {...common,id:'refund',type:'refund',amount:20,refundOf:'expense',cashDelta:20},
      {...common,id:'__cc__card__2026-08',type:'transfer',amount:100,account:'bank',toAccount:'card',cashDelta:-100},
    ];
    const tree=nodes(MonthSummaryHeader({ym:'2026-09',realized,realizedCount:3,upcomingCount:0,net:50}));
    const legend=tree.find(el=>el.type==='span'&&Array.isArray(el.props.children)&&el.props.children.includes('entrate'));
    expect(legend).toBeDefined();
    expect(nodes(legend).find(el=>el.props.className==='balance-num')?.props.children).toBe('50');
  });
});
