import { useUiVersion } from '../providers/UiVersionProvider';

/** Structural icons only. User-selected account/category emoji remain content. */
const paths: Record<string,string[]> = {
 '🌙':['M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z'],
 '🔔':['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9','M10 21h4'],
 '🏷️':['M3 3h7l11 11-7 7L3 10Z','M7 7h.01'],
 '🏦':['m3 9 9-6 9 6H3Z','M5 11v7m5-7v7m4-7v7m5-7v7M3 21h18'],
 '🏛️':['m3 9 9-6 9 6H3Z','M5 11v7m5-7v7m4-7v7m5-7v7M3 21h18'],
 '🎯':['M21 12a9 9 0 1 1-9-9','M17 12a5 5 0 1 1-5-5','m12 12 9-9m-4 0h4v4'],
 '🤖':['M5 8h14v12H5Z','M12 8V4m-2 0h4M2 12v4m20-4v4M8 12h.01M16 12h.01M9 16h6'],
 '✨':['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
 '✦':['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
 '📈':['M3 3v18h18','m6 14 4-4 4 3 6-8'],
 '📊':['M3 3v18h18','M7 16v-5m5 5V7m5 9v-3'],
 '📅':['M4 5h16v16H4Z','M8 3v4m8-4v4M4 10h16'],
 '🗓️':['M4 5h16v16H4Z','M8 3v4m8-4v4M4 10h16'],
 '📝':['M14 3H4v18h16V11','m10 14 1-4L18 3l3 3-7 7Z'],
 '💾':['M4 3h13l4 4v14H3V3Z','M7 3v6h10V3M7 21v-8h10v8'],
 '🔁':['m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16','m7 22-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3'],
 '💬':['M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z'],
 '🔍':['M21 21l-5-5','M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z'],
 'ℹ️':['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z','M12 11v6m0-10h.01'],
 '💰':['M12 3v18m4-14c-2-3-9-2-8 2 1 3 8 2 8 6s-7 4-9 1'],
 '📌':['m8 3 8 0-1 6 4 4v2H5v-2l4-4-1-6Zm4 12v7'],
 '🧭':['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z','m16 8-2 6-6 2 2-6Z'],
 '⚡':['m13 2-9 12h7l-1 8 10-13h-8Z'],
};
export function SystemIcon({icon}:{icon:string}) {
 const ui3=useUiVersion()==='3.0';
 if(!ui3)return <>{icon}</>;
 return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
   {(paths[icon]??['M4 6h16M4 12h16M4 18h16','M8 3v6m8 0v6M8 15v6']).map((d,i)=><path key={i} d={d}/>)}
 </svg>;
}
