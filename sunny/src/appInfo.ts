export const APP_VERSION = '1.9.14';

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
    version: '1.9.14', date: '2026-06-04', title: 'Impostazioni: torna in cima cambiando sezione',
    changes: [
      'Aprendo o chiudendo una sezione delle Impostazioni la pagina torna in cima, così la freccia "indietro" è sempre visibile senza dover scorrere.',
    ],
  },
  {
    version: '1.9.13', date: '2026-06-04', title: 'Lascia un feedback',
    changes: [
      'Nuova sezione "Lascia un feedback" in Impostazioni: segnala un problema, proponi un\'idea o dicci cosa è poco chiaro, con un testo libero facoltativo.',
    ],
  },
  {
    version: '1.9.12', date: '2026-06-04', title: 'Budget: stato "programmato" + fix chiusura',
    changes: [
      'Nuovo stato "programmato" nelle barre del budget: le spese/entrate/investimenti già programmati ma non ancora avvenuti compaiono come segmento tratteggiato più chiaro, così vedi quanta parte del budget occupano già.',
      'Avviso quando lo speso + il programmato supereranno il limite della categoria.',
      'Corretta la "✕" di chiusura della modifica budget: area di tocco più ampia e chiusura affidabile anche con la tastiera numerica aperta.',
    ],
  },
  {
    version: '1.9.11', date: '2026-06-04', title: 'Colori dei tipi leggibili nel tema chiaro',
    changes: [
      'Il colore "Uscita" era un bianco pensato per il tema scuro: nel tema chiaro il pulsante "Aggiungi uscita", il selettore tipo e le etichette risultavano invisibili. Ora ogni tipo ha una variante leggibile su sfondo chiaro.',
    ],
  },
  {
    version: '1.9.10', date: '2026-06-04', title: 'Catch-up al login + tema chiaro più leggibile',
    changes: [
      'All\'apertura dell\'app, qualsiasi voce ricorrente con data già scaduta (≤ oggi) viene subito spostata da "Programmato" a "Fatto" — senza aspettare la procedura notturna. Vale per tutti i tipi e non crea doppioni.',
      'Tema chiaro: testo secondario, oro e divisori con contrasti più sensati (conformi AA) — niente più scritte sbiadite su sfondo bianco.',
      'Corretti alcuni colori (errori, importi di trasferimento, accenti AI Coach) che risultavano poco leggibili in modalità chiara.',
    ],
  },
  {
    version: '1.9.9', date: '2026-06-04', title: 'Rimossi i suggerimenti "Recenti"',
    changes: [
      'Rimossi i chip "Recenti" dal modulo di aggiunta transazione.',
    ],
  },
  {
    version: '1.9.8', date: '2026-06-04', title: 'Ricorrenti retroattive contano subito come fatte',
    changes: [
      'Aggiungendo una voce ricorrente con data di inizio nel passato (es. un pagamento mensile partito 3 mesi fa), tutte le occorrenze già passate vengono registrate subito come "fatte" (non più in attesa della procedura notturna).',
      'Vale per qualsiasi tipo di movimento: uscite, entrate, investimenti e trasferimenti.',
      'Le occorrenze future della stessa serie restano "Programmate" e si materializzano da sole quando arriva la loro data.',
    ],
  },
  {
    version: '1.9.7', date: '2026-06-04', title: 'Stima fine mese meno aggressiva a inizio mese',
    changes: [
      'La stima di fine mese (totale e per categoria) non si gonfia più per un singolo acquisto fatto nei primi giorni: il peso del "ritmo attuale" ora cresce in modo graduale, restando ancorato alle tue abitudini finché non è passato abbastanza mese.',
      'A metà/fine mese la reattività resta invariata: se stai davvero spendendo molto, la previsione continua a salire come prima.',
    ],
  },
  {
    version: '1.9.6', date: '2026-06-04', title: 'Budget e previsioni considerano il programmato',
    changes: [
      'Budget: entrate e investimenti previsti del mese ora includono anche i movimenti programmati (ricorrenti in arrivo e voci con data futura), non solo quelli già avvenuti.',
      'Previsione di fine mese (Budget e Insight): conta anche entrate e investimenti programmati ancora in arrivo, oltre alle spese — risparmio stimato più realistico.',
      'Corretto il caso di una serie ricorrente che inizia nel futuro: la sua prima occorrenza ora viene conteggiata nelle previsioni.',
      'Filtro Movimenti: "Raggruppa per" spostato in alto, subito dopo "Ordina per".',
    ],
  },
  {
    version: '1.9.5', date: '2026-06-04', title: 'Previsti estesi a tutti i tipi di movimento',
    changes: [
      'Qualsiasi movimento con data futura — entrata, uscita, investimento, trasferimento, spesa condivisa, ricorrente che inizia nel futuro — appare come "Programmato" e rispetta il filtro orizzonte (5 giorni, 30 giorni, ecc.).',
      'Nessun previsto entra nei saldi, nelle statistiche di periodo o negli insight come "già avvenuto": tutto rimane coerente finché la data non arriva.',
    ],
  },
  {
    version: '1.9.4', date: '2026-06-04', title: 'Previsti coerenti ovunque',
    changes: [
      'Le spese con data futura ("previste") seguono ora in Movimenti la stessa logica di trasparenza delle ricorrenti programmate: rispettano il filtro orizzonte (prossimi 5 giorni, 30 giorni, 3 mesi, tutti o nascondi) invece di essere sempre visibili.',
      'Coerenza in tutta l\'app: i previsti non gonfiano più nessun numero "reale" — saldi, statistiche del periodo, insight e dashboard contano solo ciò che è già avvenuto, mentre le previsioni di fine mese continuano a includerli.',
      'I chip "Recenti" nel form di aggiunta non propongono più una spesa futura non ancora avvenuta.',
    ],
  },
  {
    version: '1.9.3', date: '2026-06-04', title: 'AI Coach: widget, previsti e prompt arricchito',
    changes: [
      'AI Coach disponibile ovunque come widget flottante (in basso a destra, come WhatsApp): accessibile in qualsiasi schermata senza abbandonare quello che stai facendo.',
      'Il widget AI è indipendente dall\'interruttore "Suggerimenti AI": puoi usarlo anche a suggerimenti disattivati.',
      'Il prompt inviato a Gemini ora include investimenti, budget pianificato e spese previste — risposta molto più precisa e contestualizzata.',
      'Transazioni con data futura: vengono trattate come "previste" (escluse dai saldi realizzati, incluse nelle previsioni) e si materializzano automaticamente quando arriva il loro giorno.',
      'Navbar ridisegnata: pill flottante più grande con icona + etichetta per ogni voce, posizione e proporzioni simili a WhatsApp.',
      'Impostazioni (admin): nuovo interruttore per nascondere il widget AI Coach.',
    ],
  },
  {
    version: '1.9.2', date: '2026-06-04', title: 'AI Coach — "Posso permettermelo?"',
    changes: [
      'Nuova sezione AI Coach (admin): inserisci un acquisto e ricevi una valutazione AI su misura basata sulle tue finanze reali.',
      'L\'analisi calcola il risparmio mensile previsto, il gap rispetto all\'obiettivo e suggerisce le categorie con più margine di taglio.',
      'Rate limit integrato: massimo 20 analisi al giorno (ripristino a mezzanotte UTC) — nessun token sprecato.',
    ],
  },
  {
    version: '1.8.13', date: '2026-06-04', title: 'Fix transazioni ricorrenti',
    changes: [
      'Corretto un bug per cui il fallimento di un singolo template ricorrente poteva bloccare silenziosamente la materializzazione di tutte le voci successive nella stessa esecuzione giornaliera.',
      'Il deploy ora include sempre gli indici Firestore necessari alla ricerca dei template ricorrenti, evitando errori silenziosi se l\'indice non era stato mai deployato.',
    ],
  },
  {
    version: '1.8.12', date: '2026-06-04', title: 'Onboarding guidato per nuovi utenti',
    changes: [
      'I nuovi utenti vengono accompagnati in 6 passi prima di entrare nella dashboard: obiettivi personali, primo conto, sorgente dati, obiettivo di risparmio e primo insight.',
      'Modalità demo: chi non vuole inserire dati subito può esplorare Sunny con un set realistico di ~35 transazioni su 4 mesi, rimovibili in qualsiasi momento da Impostazioni.',
      'Chi usa già Sunny non vede nulla di nuovo: l\'onboarding viene ignorato completamente.',
    ],
  },
  {
    version: '1.8.11', date: '2026-06-04', title: 'Rifiniture filtri e confronti',
    changes: [
      'Pannello filtri più compatto: ora scorre internamente se le voci sono tante e, mentre è aperto, la lista dietro resta ferma (niente più scorrimento accidentale).',
      'Confronto "anno su anno" più affidabile: non compare più nei primi giorni del mese, quando con poche spese registrate produceva variazioni irrealistiche; quando appare usa una proiezione stabilizzata sulle tue abitudini.',
    ],
  },
  {
    version: '1.8.10', date: '2026-06-04', title: 'Previsione più robusta e per categoria',
    changes: [
      'Le spese anomale (un acquisto grosso e occasionale) non gonfiano più la media: ora un singolo mese fuori scala viene smussato, così la previsione resta stabile.',
      'A metà mese, se non hai ancora registrato spese variabili, la stima non crolla più verso lo zero: resta ancorata alle tue abitudini finché non arrivano dati reali del mese.',
      'Nuova stima di fine mese per ogni categoria di spesa: sotto ogni voce del budget vedi "Stima fine mese ~€…" e un avviso se supererà il limite impostato.',
    ],
  },
  {
    version: '1.8.9', date: '2026-06-03', title: 'Previsione di fine mese più precisa',
    changes: [
      'Le spese previste ora distinguono spese variabili e ricorrenti: le ricorrenti ancora in arrivo (es. affitto non ancora pagato) vengono aggiunte esplicitamente, non più solo "coperte".',
      'La stima reagisce al ritmo reale del mese: a inizio mese pesa la tua media, col passare dei giorni conta sempre più quanto stai spendendo davvero.',
      'Il peso della stagionalità (stesso mese negli anni scorsi) cresce solo se ci sono abbastanza anni di dati, evitando che un singolo anno anomalo sbilanci la previsione.',
    ],
  },
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
