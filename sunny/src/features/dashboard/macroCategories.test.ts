import {describe,it,expect} from 'vitest';
import {groupExpenseMacros} from './macroCategories';
import {categorySettingsPayload,assignCategoryMacro,legacyMacroDefinitions,resolveMacroId,validateMacroName} from '../../shared/macroCategories';
import {CategoryDef,MacroCategoryDef} from '../../types';
import {CategorySpendingSummary} from './categoryAnalytics';
const cats:CategoryDef[]=[{id:'a',label:'Affitto',icon:'',color:'#123456',kind:'expense',macroCategory:' Casa '},{id:'b',label:'Bollette',icon:'',color:'#123456',kind:'expense',macroCategory:'casa'},{id:'i',label:'Stipendio',icon:'',color:'#123456',kind:'income'}];
const row=(categoryId:string,amount:number)=>({categoryId,amount,transactionCount:2} as CategorySpendingSummary);
const macro:MacroCategoryDef={id:'m',label:'Essenziali',icon:'🏠',color:'#888888'};
describe('macro category definitions and assignment',()=>{
 it('keeps legacy groups with stable IDs, including archived categories',()=>{
  const definitions=legacyMacroDefinitions(cats);expect(definitions).toHaveLength(1);
  const renamed=definitions.map(m=>({...m,label:'Vita quotidiana',icon:'🛒',color:'#333333'}));
  const groups=groupExpenseMacros([row('a',100),row('b',20),row('missing',30)],cats,150,renamed);
  expect(groups.map(g=>[g.label,g.amount])).toEqual([['Vita quotidiana',120],['Senza macrocategoria',30]]);
  expect(groups[0].percentage).toBe(80);expect(groups[0].icon).toBe('🛒');expect(groups[0].color).toBe('#333333');
  expect(resolveMacroId({...cats[0],archived:true},renamed)).toBe(definitions[0].id);
 });
 it('deleting definitions never resurrects old textual groups',()=>{
  expect(groupExpenseMacros([row('a',100)],cats,100,[])[0].label).toBe('Senza macrocategoria');
  expect(resolveMacroId({...cats[0],macroCategoryId:'deleted'},[macro])).toBe('');
 });
 it('assigns IDs and clears old text, preserving financial fields and source',()=>{
  const category={...cats[0],financedAmount:200};
  const assigned=assignCategoryMacro(category,'m',[macro]);
  expect(assigned).toEqual({id:'a',label:'Affitto',icon:'',color:'#123456',kind:'expense',financedAmount:200,macroCategoryId:'m'});
  expect(assignCategoryMacro(assigned,'', [macro])).not.toHaveProperty('macroCategoryId');
  expect(assignCategoryMacro(cats[2],'m',[macro])).not.toHaveProperty('macroCategoryId');
  expect(category.macroCategory).toBe(' Casa ');
 });
 it('validates duplicate names without case or whitespace differences',()=>{
  expect(()=>validateMacroName(' ESSENZIALI ','other',[macro])).toThrow();
  expect(validateMacroName(' Essenziali ','m',[macro])).toBe('Essenziali');
  expect(()=>validateMacroName('  ','m',[])).toThrow();
 });
 it('keeps totals for assigned, missing and unassigned categories and handles empty data',()=>{
  const groups=groupExpenseMacros([row('a',100),row('b',20),row('unknown',30)],[assignCategoryMacro(cats[0],'m',[macro]),cats[1]],150,[macro]);
  expect(groups.reduce((s,g)=>s+g.amount,0)).toBe(150);expect(groups).toHaveLength(2);
  expect(groupExpenseMacros([],cats,0,[macro])).toEqual([]);
 });
});

it('materializes legacy definitions atomically on the first category edit',()=>{
 const macros=legacyMacroDefinitions([cats[0]]);
 const assigned=assignCategoryMacro(cats[0],macros[0].id,macros);
 const payload=categorySettingsPayload([assigned],macros,false);
 expect(payload.macroCategories).toEqual(macros);
 expect(resolveMacroId(payload.categories[0],payload.macroCategories!)).toBe(macros[0].id);
 expect(categorySettingsPayload([assigned],macros,true)).not.toHaveProperty('macroCategories');
});
