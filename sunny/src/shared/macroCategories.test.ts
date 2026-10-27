import {validateMacroScopeChange} from './macroCategories';
import {describe,expect,it} from 'vitest';
import {assignCategoryMacro,categorySettingsPayload,legacyMacroDefinitions,resolveMacroId,validateMacroName} from './macroCategories';
import type {CategoryDef,MacroCategoryDef} from '../types';

const expense:MacroCategoryDef={id:'expense',label:'Lungo termine',icon:'🏠',color:'#123456'};
const investment={...expense,id:'investment',kind:'investment'} as MacroCategoryDef;
const category:CategoryDef={id:'etf',kind:'investment',label:'ETF',icon:'📈',color:'#456789',initialBalance:2000,currentValue:2500,lastValueUpdate:'2026-10-20',subscriptionDate:'2024-01-01',fundType:'pension',tfrAmount:400};

describe('separate expense and investment macro definitions',()=>{
 it('assigns an investment macro without changing financial fields or source',()=>{
  expect(assignCategoryMacro(category,'investment',[expense,investment])).toEqual({...category,macroCategoryId:'investment'});
  expect(category).not.toHaveProperty('macroCategoryId');
 });
 it('resolves investment IDs and treats untyped definitions as expenses',()=>{
  expect(resolveMacroId({...category,macroCategoryId:'investment'},[expense,investment])).toBe('investment');
  expect(resolveMacroId({...category,macroCategoryId:'expense'},[expense,investment])).toBe('');
  expect(assignCategoryMacro({...category,macroCategoryId:'investment'},'expense',[expense,investment])).toEqual(category);
  expect(resolveMacroId({...category,kind:'expense',macroCategoryId:'expense'},[expense,investment])).toBe('expense');
  expect(resolveMacroId({...category,kind:'expense',macroCategoryId:'investment'},[expense,investment])).toBe('');
 });
 it('validates duplicate names inside their scope, permitting the same name in the other scope',()=>{
  expect(validateMacroName(' Lungo termine ','new',[expense],'investment')).toBe('Lungo termine');
  expect(()=>validateMacroName(' lungo TERMINE ','new',[expense,investment],'investment')).toThrow('Esiste già');
  expect(()=>validateMacroName('lungo termine','new',[expense,investment],'expense')).toThrow('Esiste già');
 });
 it('materializes only expense legacy text alongside investment definitions on the first assignment',()=>{
  const legacy:CategoryDef={...category,id:'casa',kind:'expense',macroCategory:' Casa '};
  const definitions=[...legacyMacroDefinitions([legacy,{...category,macroCategory:'Casa'}]),investment];
  expect(definitions).toHaveLength(2);
  expect(resolveMacroId(legacy,definitions)).toBe('legacy:casa');
  expect(resolveMacroId({...category,macroCategory:'Casa'},definitions)).toBe('');
  const payload=categorySettingsPayload([assignCategoryMacro(category,'investment',definitions),legacy],definitions,false);
  expect(payload.macroCategories).toEqual(definitions);
  expect(resolveMacroId(payload.categories[0],payload.macroCategories!)).toBe('investment');
 });
 it('clears deleted assignments and does not reuse investment legacy text',()=>{
  expect(resolveMacroId({...category,macroCategoryId:'deleted'},[investment])).toBe('');
  expect(assignCategoryMacro({...category,macroCategoryId:'investment'},'',[investment])).toEqual(category);
  expect(assignCategoryMacro({...category,kind:'income'},'investment',[investment])).toEqual({...category,kind:'income'});
 });
 it('keeps linked categories attached by rejecting an assigned scope change',()=>{
  const assigned={...category,macroCategoryId:'investment'};
  expect(()=>validateMacroScopeChange('investment','expense',[assigned],[investment])).toThrow('rimuovi prima le assegnazioni');
  expect(resolveMacroId(assigned,[investment])).toBe('investment');
  expect(()=>validateMacroScopeChange('investment','investment',[assigned],[investment])).not.toThrow();
  expect(()=>validateMacroScopeChange('investment','expense',[category],[investment])).not.toThrow();
 });
});
