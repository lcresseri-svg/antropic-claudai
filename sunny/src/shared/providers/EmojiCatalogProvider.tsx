import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {EMOJI_CHOICES} from '../../defaults';
import {isAdminUser} from '../featureFlags';
import {mergeEmojiChoices,validateEmojiInput} from '../emojiCatalog';
import {insertCatalogEmoji,subscribeCatalog} from '../emojiCatalogStore';

interface Catalog {
 emojis:string[];
 customEmojis:string[];
 loading:boolean;
 error:string;
 retry:()=>void;
 addEmoji:(value:string)=>Promise<void>;
}
const Context=createContext<Catalog>({emojis:EMOJI_CHOICES,customEmojis:[],loading:false,error:'',retry:()=>{},addEmoji:async()=>{throw Error('Catalogo non disponibile.');}});

/** Shared public catalog; authenticated shell owns the listener, never financial data. */
export function EmojiCatalogProvider({uid,children}:{uid:string;children:ReactNode}){
 const [extras,setExtras]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!uid){setExtras([]);setLoading(false);return;}
  setLoading(true);setError('');
  return subscribeCatalog(values=>{setExtras(values);setLoading(false);setError('');},()=>{setLoading(false);setError('Non è stato possibile caricare le emoji aggiunte.');});
 },[uid,revision]);
 const emojis=useMemo(()=>mergeEmojiChoices(extras),[extras]);
 const customEmojis=useMemo(()=>emojis.slice(EMOJI_CHOICES.length),[emojis]);
 const retry=useCallback(()=>setRevision(n=>n+1),[]);
 const addEmoji=useCallback(async(value:string)=>{
  if(!isAdminUser({uid}))throw Error('Questa gestione è riservata all’amministratore.');
  if(loading||error)throw Error('Attendi il caricamento del catalogo prima di aggiungere emoji.');
  await insertCatalogEmoji(validateEmojiInput(value,emojis));
 },[uid,loading,error,emojis]);
 return <Context.Provider value={{emojis,customEmojis,loading,error,retry,addEmoji}}>{children}</Context.Provider>;
}
export const useEmojiCatalog=()=>useContext(Context);
