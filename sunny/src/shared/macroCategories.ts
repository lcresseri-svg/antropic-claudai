import {CategoryDef,MacroCategoryDef,MacroCategoryKind} from '../types';
export const macroKind=(macro:MacroCategoryDef):MacroCategoryKind=>macro.kind??'expense';
export const macroName=(value:unknown):string=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,80):'';
export const legacyMacroId=(name:string)=>'legacy:'+macroName(name).toLocaleLowerCase('it-IT');
/** Read compatibility only: no historical transaction or category rewrites. */
export function legacyMacroDefinitions(categories:CategoryDef[]):MacroCategoryDef[]{
 const defs=new Map<string,MacroCategoryDef>();
 for(const c of categories){const name=macroName(c.macroCategory);if(c.kind!=='expense'||!name)continue;
 const id=legacyMacroId(name);if(!defs.has(id))defs.set(id,{id,label:name,icon:'🏷️',color:c.color});}
 return [...defs.values()];
}
export function resolveMacroId(category:CategoryDef|undefined,macros:MacroCategoryDef[]):string{
 if(!category||(category.kind!=='expense'&&category.kind!=='investment'))return '';
 const id=category.macroCategoryId??(category.kind==='expense'&&macroName(category.macroCategory)?legacyMacroId(category.macroCategory!):'');
 return macros.some(m=>m.id===id&&macroKind(m)===category.kind)?id:'';
}
export function validateMacroName(label:string,id:string,macros:MacroCategoryDef[],kind:MacroCategoryKind='expense'):string{
 const name=macroName(label);if(!name)throw Error('Inserisci il nome della macrocategoria.');
 if(macros.some(m=>m.id!==id&&macroKind(m)===kind&&macroName(m.label).toLocaleLowerCase('it-IT')===name.toLocaleLowerCase('it-IT')))throw Error('Esiste già una macrocategoria con questo nome.');
 return name;
}

export function assignCategoryMacro(category:CategoryDef,id:string,macros:MacroCategoryDef[]):CategoryDef{
 const {macroCategory:_,macroCategoryId:__,...rest}=category;
 return (category.kind==='expense'||category.kind==='investment')&&macros.some(m=>m.id===id&&macroKind(m)===category.kind)?{...rest,macroCategoryId:id}:rest;
}

/** First ID assignment must persist its legacy definition in the same write. */
export function categorySettingsPayload(categories:CategoryDef[],macros:MacroCategoryDef[],definitionsStored:boolean){
 return definitionsStored?{categories}:{categories,macroCategories:macros};
}

/** Moving an assigned definition to another scope must not silently detach categories. */
export function validateMacroScopeChange(id:string,kind:MacroCategoryKind,categories:CategoryDef[],macros:MacroCategoryDef[]):void{
 const previous=macros.find(m=>m.id===id);
 if(previous&&macroKind(previous)!==kind&&categories.some(c=>resolveMacroId(c,macros)===id))throw Error('Questa macro è già assegnata: rimuovi prima le assegnazioni oppure crea una nuova macrocategoria.');
}
