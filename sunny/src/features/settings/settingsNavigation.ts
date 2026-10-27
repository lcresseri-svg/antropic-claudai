export const SETTINGS_TITLES={
 menu:'Impostazioni',generali:'Generali',gestione:'Gestione',dati:'Dati',accounts:'Conti',categories:'Categorie',macros:'Macrocategorie',emoji:'Catalogo emoji',info:'Come funziona',versioni:'Registro versioni',aspetto:'Aspetto',budget:'Piano e budget',investimenti:'Investimenti',ai:'Analisi e AI',notifiche:'Notifiche',avanzate:'AI abilitata',shortcut:'Comandi rapidi e Apple Pay',riserva:'Deposito di sicurezza',
} as const;
export type SettingsSection=keyof typeof SETTINGS_TITLES;
export function settingsParent(section:SettingsSection):'menu'|'gestione'|null{
 return section==='menu'?null:['accounts','categories','macros','emoji'].includes(section)?'gestione':'menu';
}
