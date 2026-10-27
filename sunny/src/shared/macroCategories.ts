import {CategoryDef,MacroCategoryDef} from '../types';
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
 if(!category||category.kind!=='expense')return '';
 const id=category.macroCategoryId??(macroName(category.macroCategory)?legacyMacroId(category.macroCategory!):'');
 return macros.some(m=>m.id===id)?id:'';
}
export function validateMacroName(label:string,id:string,macros:MacroCategoryDef[]):string{
 const name=macroName(label);if(!name)throw Error('Inserisci il nome della macrocategoria.');
 if(macros.some(m=>m.id!==id&&macroName(m.label).toLocaleLowerCase('it-IT')===name.toLocaleLowerCase('it-IT')))throw Error('Esiste già una macrocategoria con questo nome.');
 return name;
}

export function assignCategoryMacro(category:CategoryDef,id:string,macros:MacroCategoryDef[]):CategoryDef{
 const {macroCategory:_,macroCategoryId:__,...rest}=category;
 return category.kind==='expense'&&macros.some(m=>m.id===id)?{...rest,macroCategoryId:id}:rest;
}

/** First ID assignment must persist its legacy definition in the same write. */
export function categorySettingsPayload(categories:CategoryDef[],macros:MacroCategoryDef[],definitionsStored:boolean){
 return definitionsStored?{categories}:{categories,macroCategories:macros};
}
