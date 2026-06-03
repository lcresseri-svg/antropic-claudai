export const APP_VERSION = '1.8.8';

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
    version: '1.8.8', date: '2026-06-03', title: 'Impostazioni più ordinate e funzioni opzionali',
    changes: [
      'Suggerimenti AI ora disattivati di default: attivali quando vuoi da Impostazioni → Generali (chi li aveva già attivati li mantiene).',
      'Nuovo interruttore "Gestione budget": puoi nascondere il budget come già si fa con gli investimenti.',
      'Con il budget disattivato la scheda resta comunque accessibile: spiega a cosa serve e con un tocco ti porta nelle impostazioni per riattivarlo.',
      'Impostazioni → Generali riorganizzate per aree (Aspetto, Funzionalità, Analisi e AI, Notifiche) invece di un\'unica lista lunga.',
    ],
  },
  {
    version: '1.8.7', date: '2026-06-03', title: 'Categorie più semplici e aggiunta rapida',
    changes: [
      'Gestione categorie e conti più diretta: tocca una voce per modificarla subito (niente più passaggio da "Modifica") e usa "+ Aggiungi" sempre visibile sotto ogni sezione.',
      'Nuovo pulsante "Riordina" dedicato al solo trascinamento, per separare le azioni e renderle più chiare.',
      'Il foglio di modifica ora mostra un titolo (es. "Nuova categoria" / "Modifica conto") per orientarti meglio.',
      'Modale nuova transazione: ricorda l\'ultimo conto usato e lo propone in automatico.',
      'Nuovi chip "Recenti": le ultime 5 voci distinte compaiono sopra il form — un tocco pre-compila tutto.',
      'Pulsante "Salva e aggiungi un\'altra": salva e lascia il modulo aperto mantenendo tipo, categoria e conto.',
      'Raggruppa per (Per mese / Per conto / Per categoria) spostato nel popup filtri — la toolbar perde una riga.',
    ],
  },
  {
    version: '1.8.6', date: '2026-06-03', title: 'Previsioni più intelligenti',
    changes: [
      'Proiezione fine mese: ora incrocia media recente (ultimi 3 mesi), storico dello stesso mese in anni precedenti (stagionalità) e spese ricorrenti ancora da registrare questo mese.',
      'Proiezione annuale: calcola le uscite mese per mese usando la media storica di ogni mese dell\'anno, così dicembre o agosto pesano correttamente; applica un pavimento sulle ricorrenti note.',
      'Usa 6 mesi di storia (anziché 3) per la base della proiezione annuale, riducendo il bias stagionale del singolo trimestre.',
    ],
  },
  {
    version: '1.8.5', date: '2026-06-03', title: 'Correzioni',
    changes: [
      'Insight: non viene più segnalata la scadenza di un pagamento ricorrente se la ricorrenza termina prima della prossima occorrenza.',
      'Modifica budget: corretta la "✕" di chiusura su iPhone quando la tastiera numerica è aperta.',
    ],
  },
  {
    version: '1.8.4', date: '2026-06-03', title: 'Notifiche per tutti',
    changes: [
      'Le notifiche push sono ora disponibili per tutti gli utenti (non più solo in beta).',
      'Su iPhone con l\'app installata sulla schermata Home: al primo avvio compare una proposta per attivare le notifiche con accesso diretto alle impostazioni.',
    ],
  },
  {
    version: '1.8.3', date: '2026-06-03', title: 'Notifiche su misura',
    changes: [
      'Promemoria spese: ora arrivano comunque a metà giornata e la sera, anche se hai già registrato qualcosa.',
      'Avviso voci ricorrenti: spostato alle 9:00.',
      'Riepilogo mensile più ricco: tasso di risparmio in percentuale, peso di uscite e investimenti sulle entrate, numero di movimenti e un giudizio del mese.',
    ],
  },
  {
    version: '1.8.2', date: '2026-06-03', title: 'Notifiche, rifiniture',
    changes: [
      'Notifiche più pulite: rimossa l\'icona non supportata su iPhone (ora usa l\'icona dell\'app).',
      'Impostazioni: rimosso il pannello di diagnostica delle notifiche, non più necessario.',
    ],
  },
  {
    version: '1.8.1', date: '2026-06-03', title: 'Notifiche su iPhone',
    changes: [
      'Correzione consegna notifiche su iPhone (PWA): ora vengono mostrate in modo affidabile sia ad app chiusa sia aperta.',
    ],
  },
  {
    version: '1.8.0', date: '2026-06-02', title: 'Notifiche push',
    changes: [
      'Notifiche push (Firebase Cloud Messaging): attivabili dalle impostazioni Generali.',
      'Promemoria spese a metà giornata e alla sera, saltati automaticamente se hai già registrato qualcosa.',
      'Avviso quando una voce ricorrente viene registrata automaticamente.',
      'Riepilogo mensile a inizio mese con entrate, uscite e risparmio del mese precedente.',
      'Su iPhone serve installare l\'app sulla schermata Home (iOS 16.4+) per ricevere le notifiche.',
    ],
  },
  {
    version: '1.7.4', date: '2026-06-02', title: 'Correzione categorie',
    changes: [
      'Risolto: aggiungendo una categoria dentro una sezione (Entrate, Investimenti…) veniva sempre creata come "Uscita". Ora mantiene il tipo corretto.',
      'Aggiungendo una categoria di investimento da quella sezione ora compaiono anche tipo di fondo, TFR e capitale già investito.',
      'Le categorie di spesa/entrata non mostrano più un campo "Saldo iniziale" che non le riguardava.',
    ],
  },
  {
    version: '1.7.3', date: '2026-06-02', title: 'Versamenti senza conto e TFR',
    changes: [
      'Investimenti: ora puoi registrare un versamento "senza conto di provenienza" (es. TFR o contributo del datore) che aumenta il capitale investito senza intaccare la liquidità.',
      'Versamenti in un fondo pensionistico: puoi indicare quanta parte del singolo versamento è TFR.',
      'Le statistiche del TFR tengono conto sia del capitale iniziale sia dei singoli versamenti.',
    ],
  },
  {
    version: '1.7.2', date: '2026-06-02', title: 'Investimenti dettagliati',
    changes: [
      'Budget ora sincronizzato sul cloud: obiettivi e limiti ti seguono su tutti i dispositivi (prima restavano sul singolo dispositivo).',
      'Categorie di investimento: classificazione per tipo di fondo (Pensionistico, Obbligazionario, Azionario).',
      'Fondi pensionistici: possibilità di indicare quanta parte del capitale è TFR.',
      'Sezione Investimenti: nuovo grafico ad anello "Allocazione per tipo di fondo", con nota sulla quota di TFR.',
    ],
  },
  {
    version: '1.7.1', date: '2026-06-02', title: 'Budget e AI',
    changes: [
      'Spese pianificate: niente più "default" pari alle spese reali. Senza budget impostato il piano parte da €0 (i dati demo restano solo per chi non ha ancora movimenti).',
      'Nuovo pulsante "Azzera budget" nella modifica budget per ripartire da zero in un tocco.',
      'Impostazioni → Generali: nuovo interruttore "Suggerimenti AI". Se disattivato, la card sparisce e non viene fatta alcuna chiamata all\'API.',
      'Riepilogo AI: modello Gemini aggiornato (2.5) e chiamata resa più affidabile.',
      'Date dei movimenti: ora mostrano anche l\'anno.',
    ],
  },
  {
    version: '1.7.0', date: '2026-06-02', title: 'Ricorrenze a serie',
    changes: [
      'Le transazioni ricorrenti future si vedono in anticipo nei Movimenti come righe "Programmato": di default i prossimi 5 giorni, con orizzonte regolabile dal filtro (30 giorni, 3 mesi, tutti, o nascondi).',
      'Gestione stile Outlook: toccando un\'occorrenza apri la serie. Per le voci già registrate scegli "solo questa" o "tutta la serie".',
      'Ricerca movimenti potenziata: cerca anche per importo, data, conto e tipo, non solo nella descrizione.',
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
