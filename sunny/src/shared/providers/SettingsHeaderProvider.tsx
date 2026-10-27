import {createContext,useContext,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
interface HeaderAction {label:string;onClick:()=>void}
interface PageHeader {title:string;onBack:()=>void;owner:string;action?:HeaderAction;actions?:ReactNode}
type Register=(header:PageHeader|null)=>void;
const Context=createContext<{header:PageHeader|null;setHeader:Register}|null>(null);
const RegisterContext=createContext<Register|null>(null);
/** Presentation only; owned by the authenticated shell, never persisted. */
export function SettingsHeaderProvider({children}:{children:ReactNode}){
 const [header,setHeader]=useState<PageHeader|null>(null);
 return <RegisterContext.Provider value={setHeader}><Context.Provider value={{header,setHeader}}>{children}</Context.Provider></RegisterContext.Provider>;
}
export const useSettingsHeader=()=>useContext(Context);
function useRegisterHeader(title:string,onBack:()=>void,action?:HeaderAction,actions?:ReactNode){
 const setHeader=useContext(RegisterContext),owner=useLocation().pathname;
 const callbacks=useRef({onBack,action});callbacks.current={onBack,action};
 useLayoutEffect(()=>{
  if(!setHeader)return;
  setHeader({title,owner,onBack:()=>callbacks.current.onBack(),action:action?{label:action.label,onClick:()=>callbacks.current.action?.onClick()}:undefined,actions});
  return()=>setHeader(null);
 },[setHeader,title,owner,action?.label,actions]);
 return !!setHeader;
}
export function useRegisterSettingsHeader(title:string,onBack:()=>void,action?:HeaderAction){return useRegisterHeader(title,onBack,action);}
export function useRegisterPageHeader(title:string,onBack:()=>void,actions?:ReactNode){return useRegisterHeader(title,onBack,undefined,actions);}
