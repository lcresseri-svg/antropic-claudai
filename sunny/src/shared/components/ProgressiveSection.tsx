import { ReactNode } from 'react';
import { useUiVersion } from '../providers/UiVersionProvider';
export function ProgressiveSection({title,children}:{title:string;children:ReactNode}) {
  return useUiVersion()==='3.0'?<details className="liquid-progressive"><summary>{title}</summary>{children}</details>:<>{children}</>;
}
