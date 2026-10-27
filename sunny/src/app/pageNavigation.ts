/** Route fallback while lazy pages load; pages may register dynamic titles/actions. */
export function pageNavigation(path:string,ui3:boolean):{title:string;backTo:string}|null{
 if(path==='/'||path.startsWith('/wrapped/'))return null;
 if(path==='/settings'||path.startsWith('/settings/'))return {title:'Impostazioni',backTo:'/'};
 if(path.startsWith('/recap/'))return {title:'Riepilogo mensile',backTo:'/budget'};
 const titles:Record<string,[string,string]>={
  '/wealth':['Patrimonio','/'], '/investments':['Investimenti','/wealth'], '/insights':['Consigli','/'],
  '/budget':[ui3?'Il tuo mese':'Piano','/'], '/transactions':['Movimenti','/'], '/ai-coach':['AI Coach','/'],
  '/income':['Entrate','/'], '/category-spending':['Spese per categoria','/'], '/account-balance':['Saldo per conto','/wealth'],
  '/wealth-history':['Andamento patrimonio','/wealth'], '/forecast-v3':['Previsione V3','/settings'],
  '/wealth-v2':['Patrimonio V2','/wealth'], '/commitments':['Impegni','/wealth'], '/monthly-plan':['Piano mensile','/budget'], '/metrics':['Metriche','/settings'],
 };
 const entry=titles[path];return entry?{title:entry[0],backTo:entry[1]}:null;
}
