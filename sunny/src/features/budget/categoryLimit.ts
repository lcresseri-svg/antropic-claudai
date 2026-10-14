import type {MonthlyBudget} from './monthlyBudget';
import {parsePlanAmount} from './planDraft';

/** Editing a limit must not mark income/goals reviewed or replay another draft. */
export function withCategoryLimit(base:MonthlyBudget,category:string,value:string|null):MonthlyBudget {
  const amount=value===null?0:parsePlanAmount(value);
  if(!category||amount===null)throw new Error('Inserisci un importo valido, anche zero per rimuovere il limite.');
  const categoryBudgets={...base.categoryBudgets};
  if(amount===0)delete categoryBudgets[category];else categoryBudgets[category]=amount;
  return {...base,categoryBudgets,source:'manual'};
}
