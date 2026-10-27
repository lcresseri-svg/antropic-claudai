import {useId,useState} from 'react';
import {useSettings} from '../../shared/providers/settings';
import {SheetShell} from '../investments/SheetShell';
import {applyMacroAssignments,changedMacroAssignments,macroName} from './macroCategories';

export function MacroCategoryEditor({onClose}:{onClose:()=>void}) {
  const {categories,saveCategories}=useSettings();
  const [initial]=useState<Record<string,string>>(()=>Object.fromEntries(categories.filter(c=>c.kind==='expense').map(c=>[c.id,macroName(c.macroCategory)])));
  const [draft,setDraft]=useState(initial);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const list=useId();
  const names=[...new Set(Object.values(draft).map(macroName).filter(Boolean))].sort();
  const save=async()=>{
    setSaving(true);setError('');
    try {await saveCategories(applyMacroAssignments(categories,changedMacroAssignments(initial,draft)),{persistFirst:true});onClose();}
    catch {setError('Salvataggio non riuscito. Riprova: le assegnazioni sono ancora qui.');}
    finally {setSaving(false);}
  };
  return <SheetShell open title="Gestisci macrocategorie" onClose={onClose} saving={saving} draftSignature={JSON.stringify(draft)}>
    <p className="text-sm text-secondary">Per ogni categoria scegli un nome esistente o scrivine uno nuovo. Lascia vuoto per togliere l’assegnazione. Vale anche per lo storico.</p>
    <datalist id={list}>{names.map(name=><option key={name} value={name}/>)}</datalist>
    <form onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset disabled={saving} className="divide-y divide-divider">
        {categories.filter(c=>c.kind==='expense').map(c=><label key={c.id} className="block py-3 text-sm text-primary">
          <span className="block mb-2">{c.icon} {c.label}{c.archived?' · Archiviata':''}</span>
          <input aria-label={`Macrocategoria di ${c.label}`} list={list} maxLength={80} value={draft[c.id]??macroName(c.macroCategory)}
            onChange={e=>setDraft(d=>({...d,[c.id]:e.target.value}))} placeholder="Senza macrocategoria"
            className="w-full min-w-0 rounded-xl bg-elevated border border-divider px-3 py-2 text-primary"/>
        </label>)}
      </fieldset>
      {error&&<p role="alert" className="text-sm text-red py-2">{error}</p>}
      <button type="submit" disabled={saving} className="cta-gold-fill w-full rounded-xl py-3 mt-4 font-semibold">{saving?'Salvataggio…':'Salva raggruppamenti'}</button>
    </form>
  </SheetShell>;
}
