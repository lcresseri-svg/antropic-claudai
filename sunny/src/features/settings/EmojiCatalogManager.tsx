import {useEffect,useRef,useState,type FormEvent} from 'react';
import {EMOJI_CHOICES} from '../../defaults';
import {useEmojiCatalog} from '../../shared/providers/EmojiCatalogProvider';

/** Admin data management. Firestore independently enforces the write permission. */
export function EmojiCatalogManager(){
 const {emojis,customEmojis,loading,error,retry,addEmoji}=useEmojiCatalog();
 const [value,setValue]=useState(''),[saving,setSaving]=useState(false),[failure,setFailure]=useState(''),[success,setSuccess]=useState('');
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(success&&!saving)input.current?.focus({preventScroll:true});},[success,saving]);
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(saving||loading||error)return;
  setSaving(true);setFailure('');setSuccess('');
  try{await addEmoji(value);setValue('');setSuccess('Emoji aggiunta al catalogo: è disponibile a tutti.');}
  catch(e){const code=(e as {code?:string})?.code;setFailure(code==='permission-denied'?'Non hai il permesso di aggiungere emoji.':code?'Inserimento non riuscito. Riprova.':e instanceof Error?e.message:'Inserimento non riuscito. Riprova.');}
  finally{setSaving(false);}
 };
 return <div className="space-y-6 md:max-w-3xl">
  <p className="text-sm text-secondary">Consulta tutte le {emojis.length} emoji disponibili. Le nuove aggiunte saranno selezionabili da tutti nei conti, nelle categorie e nelle macro.</p>
  <form onSubmit={submit} className="space-y-3 border-b border-divider pb-6" aria-busy={saving}>
   <label htmlFor="new-catalog-emoji" className="block text-sm font-medium text-primary">Nuova emoji</label>
   <p id="emoji-input-help" className="text-sm text-secondary">Incolla una sola emoji dalla tastiera del dispositivo, anche con varianti di carnagione o simboli combinati.</p>
   <div className="flex flex-wrap items-center gap-3">
    <input ref={input} id="new-catalog-emoji" aria-describedby="emoji-input-help" value={value} onChange={e=>{setValue(e.target.value);setFailure('');setSuccess('');}} disabled={saving} placeholder="Esempio: 🪷" maxLength={128}
     className="min-w-0 flex-1 basis-36 bg-elevated rounded-xl border border-divider px-4 py-3 text-base text-primary"/>
    <button type="submit" aria-label="Aggiungi emoji" disabled={saving||loading||!!error||!value.trim()} className="min-h-11 rounded-xl bg-gold text-[var(--accent-on)] px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving?'Aggiunta…':'Aggiungi emoji'}</button>
   </div>
   {failure&&<p role="alert" className="text-sm text-red">{failure}</p>}
   {success&&<p role="status" className="text-sm text-primary">{success}</p>}
   {loading&&<p role="status" className="text-sm text-secondary">Caricamento emoji aggiunte…</p>}
   {error&&<div role="alert" className="space-y-2 text-sm text-secondary"><p>{error} Le emoji incluse restano disponibili.</p><button type="button" onClick={retry} className="min-h-11 text-gold underline">Riprova</button></div>}
  </form>
  <CatalogGroup title="Aggiunte al catalogo" emojis={customEmojis} className="emoji-catalog-added"/>
  <CatalogGroup title="Incluse in Sunny" emojis={EMOJI_CHOICES} className="emoji-catalog-builtins"/>
 </div>;
}
function CatalogGroup({title,emojis,className}:{title:string;emojis:string[];className:string}){
 return <section className={className}>
  <h2 className="text-sm font-semibold text-primary mb-3">{title} · {emojis.length}</h2>
  {emojis.length?<div role="list" aria-label={title} className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
   {emojis.map(emoji=><span role="listitem" key={emoji} aria-label={emoji} className="min-h-11 flex items-center justify-center rounded-xl bg-elevated text-2xl">{emoji}</span>)}
  </div>:<p className="text-sm text-secondary">Nessuna emoji aggiunta.</p>}
 </section>;
}
