// Local shared catalog adapter: no Firebase reads or writes in preview.
const flags=new URLSearchParams(location.search);
let values:string[]=flags.has('catalogZwj')?['👩🏽‍🚀']:[],failedOnce=false;
const subscribers=new Set<(values:string[])=>void>();
export function subscribeCatalog(next:(values:string[])=>void,error:(error:Error)=>void){
 let active=true;
 const deliver=()=>{
  if(!active)return;
  if(flags.has('catalogUnavailable')&&!failedOnce){failedOnce=true;error(Error('Fixture: catalogo non disponibile'));return;}
  subscribers.add(next);next([...values]);
 };
 const timer=flags.has('catalogSlow')?setTimeout(deliver,2000):undefined;
 if(!timer)queueMicrotask(deliver);
 return()=>{active=false;clearTimeout(timer);subscribers.delete(next);};
}
export async function insertCatalogEmoji(emoji:string){
 if(flags.has('failCatalogSave'))throw Object.assign(Error('Inserimento non riuscito. Riprova.'),{code:'unavailable'});
 values=[...values,emoji];for(const next of subscribers)next([...values]);
}
