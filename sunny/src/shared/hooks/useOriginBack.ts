import {useLocation,useNavigate} from 'react-router-dom';
import {useUiNavigationMemory} from '../providers/UiVersionProvider';

/** Only use history when this authenticated session recorded an internal origin. */
export function useOriginBack(fallback:string) {
  const navigate=useNavigate(),location=useLocation(),memory=useUiNavigationMemory();
  return ()=>{
    const origin=memory?.get(`origin:${location.key}`);
    if(typeof origin==='string'&&/^\/(?!\/)/.test(origin)) navigate(-1);
    else navigate(fallback);
  };
}
