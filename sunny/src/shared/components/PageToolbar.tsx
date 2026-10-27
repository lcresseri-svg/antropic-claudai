import {type ReactNode} from 'react';
import {useRegisterPageHeader} from '../providers/SettingsHeaderProvider';
import {useOriginBack} from '../hooks/useOriginBack';
/** Full-page toolbar. Dialogs and embedded sections keep their own headings. */
export function PageToolbar({title,backTo='/',onBack,children}:{title:string;backTo?:string;onBack?:()=>void;children?:ReactNode}){
 const back=useOriginBack(backTo);
 const compact=useRegisterPageHeader(title,onBack??back,children);
 if(compact)return null;
 return <div className="flex min-h-14 items-center gap-3"><button type="button" aria-label="Indietro" onClick={onBack??back}>‹</button><h1 className="flex-1 text-xl font-semibold">{title}</h1>{children}</div>;
}
