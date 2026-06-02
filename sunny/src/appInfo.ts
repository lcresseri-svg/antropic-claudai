export const APP_VERSION = '1.7.0';

/**
 * Release channel. While in 'beta' the app is still under active development
 * and versions are not considered official. Switch to 'stable' when ready.
 */
export const APP_CHANNEL: 'beta' | 'stable' = 'beta';

export interface VersionEntry {
  version: string;
  date: string;        // YYYY-MM-GG
  title: string;
  changes: string[];
}

/** Registro versioni mostrato in Impostazioni → Registro versioni. */
export const VERSIONS: VersionEntry[] = [
  {
    version: '1.7.0', date: '2026-06-02', title: 'Ricorrenze a serie',
    changes: [
      'Le transazioni ricorrenti future ora si vedono in anticipo nei Movimenti come righe "Programmato", fino alla scadenza (o 12 mesi se senza fine).',
      'Gestione stile Outlook: toccando un\'occorrenza apri la serie. Per le voci già registrate scegli "solo questa" o "tutta la serie".',
      'I totali del mese restano sulle voci realizzate; le ricorrenze previste pesano solo nelle previsioni.',
      'La proiezione annuale tiene conto delle spese e degli investimenti ricorrenti già programmati.',
      'Generazione automatica più robusta: recupera tutte le occorrenze arretrate in un colpo solo e collega le voci alla loro serie.',
    ],
  },
  {
    version: '1.6.1', date: '2026-06-02', title: 'Rifiniture',
    changes: [
      'Riepilogo AI: modello Gemini aggiornato e più affidabile.',
      'Riassunto di riserva corretto quando le entrate del mese sono quasi nulle.',
      'Favicon e logo trasparente sistemati.',
      'Form transazione: layout migliorato su desktop.',
      'Statistica "Risparmio": sottotitolo più leggibile.',
    ],
  },
  {
    version: '1.6.0', date: '2026-06-02', title: 'Riepilogo AI',
    changes: [
      'Nuova card "Riepilogo AI" in dashboard: 2-3 frasi sulla situazione del mese generate da Google Gemini, lato server (nessuna chiave da configurare). Se l’AI non risponde, mostra un riassunto locale.',
      'Livello di analisi (Minimal / Media / Smanettone) ora applicato ovunque: "Insight → Vedi tutti" non mostra più sempre tutto.',
      'Commissioni nei movimenti: campo opzionale, registrata come spesa separata collegata.',
      '9 nuovi insight: confronti trimestrali, da inizio anno, previsione stagionale, peso dei costi fissi, streak di risparmio, abitudini per giorno della settimana.',
      'Previsione ricorrenti divisa in due card: spese ricorrenti e investimenti ricorrenti.',
    ],
  },
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
