import { Children, isValidElement, ReactNode } from 'react';
import { matchesSettingsQuery } from './settingsSearch';

export function SettingsMenuResults({children,active,query}: {children:ReactNode;active:boolean;query:string}) {
  const total = Children.toArray(children).reduce<number>((sum, section) => {
    if (!isValidElement<{title:string;children:ReactNode}>(section)) return sum;
    return sum + Children.toArray(section.props.children).filter(row => {
      if (!isValidElement<{label?:string;sub?:string}>(row)) return false;
      return matchesSettingsQuery(row.props.label ?? '', row.props.sub, section.props.title, query);
    }).length;
  }, 0);
  return <>
    {active && query.trim() && <p role="status" className="ui31-settings-search-status">{total === 0 ? 'Nessuna impostazione trovata. Prova con un altro termine.' : `${total} ${total === 1 ? 'impostazione trovata' : 'impostazioni trovate'}`}</p>}
    <div className={active ? 'ui31-settings-groups' : 'space-y-5 wide:grid wide:grid-cols-2 wide:gap-5 wide:space-y-0 wide:items-start'}>{children}</div>
  </>;
}
