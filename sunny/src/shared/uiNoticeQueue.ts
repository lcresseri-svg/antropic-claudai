/** Presentation queue only: no gates, seen state, timers or persistence. */
export function createNoticeQueue() {
  const entries=new Map<string,number|null>();
  const listeners=new Set<()=>void>();
  const emit=()=>listeners.forEach(listener=>listener());
  return {
    enter(id:string,priority:number|null) {
      entries.set(id,priority); emit(); let left=false;
      return()=>{if(!left){left=true;entries.delete(id);emit();}};
    },
    snapshot():string|null {
      if(Array.from(entries.values()).some(priority=>priority===null)) return null;
      return Array.from(entries).sort((a,b)=>(b[1]??0)-(a[1]??0))[0]?.[0]??null;
    },
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  };
}
