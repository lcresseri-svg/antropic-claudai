export const APP_VERSION = '1.5.0';

export interface VersionEntry {
  version: string;
  date: string;        // YYYY-MM-GG
  title: string;
  changes: string[];
}

/** Registro versioni mostrato in Impostazioni → Registro versioni. */
export const VERSIONS: VersionEntry[] = [
  {
    version: '1.5.0', date: '2026-06-01', title: 'Investimenti e chiarezza',
    changes: [
      'Nuova schermata Investimenti con allocazione completa per categoria (anche a €0).',
      'Grafico andamento: uscite e investimenti impilati (totale in uscita).',
      'Previsione di fine mese unificata tra Insight e Budget (niente più numeri discordanti).',
      'Risparmio: indicatore "!" quando entrate − uscite − investimenti è negativo.',
      'Analisi di tendenza limitate agli ultimi ~18 mesi.',
      'Nuova sezione "Come funziona" con tutte le formule.',
    ],
  },
  {
    version: '1.4.0', date: '2026-06-01', title: 'Dashboard e desktop',
    changes: [
      'Dashboard ridisegnata: navigatore periodo, FlowBar entrate/uscite/investito, banner insight scorrevole.',
      'Saldo per conto con "Mostra tutti"; saluto personalizzato.',
      'UI impostazioni migliorata su desktop (griglia di sezioni).',
      'Transazioni: ordina per importo e selettori a capsula.',
      'Saldo iniziale anche per le categorie di investimento.',
    ],
  },
  {
    version: '1.3.0', date: '2026-05-31', title: 'Insight intelligenti',
    changes: [
      'Motore insight con spiegazioni dettagliate e mini-grafici (pulsante "i").',
      'Insight stagionali e confronti anno-su-anno.',
      'Budget consapevole della stagionalità.',
      'Previsioni su entrate e investimenti dallo storico.',
    ],
  },
  {
    version: '1.2.0', date: '2026-05-31', title: 'Budget e filtri',
    changes: [
      'Sezione Budget: obiettivo di risparmio, budget per categoria, entrate previste.',
      'Transazioni: ricerca, filtri per periodo, raggruppamenti e gruppi comprimibili.',
      'Importazione da Excel/CSV.',
    ],
  },
  {
    version: '1.1.0', date: '2026-05-30', title: 'Struttura e tema',
    changes: [
      'Navigazione Home · Insight · Budget · Movimenti.',
      'Tema chiaro/scuro, layout desktop con sidebar.',
      'Saldo iniziale per conto, impostazioni riorganizzate.',
    ],
  },
  {
    version: '1.0.0', date: '2026-05-29', title: 'Prima versione',
    changes: [
      'Accesso con Google, sincronizzazione su Firestore.',
      'Transazioni, conti e categorie personalizzabili.',
      'Dashboard con patrimonio, andamento e spese per categoria.',
    ],
  },
];
