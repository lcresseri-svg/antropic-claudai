# Sunny — Riprogettazione della sezione Piano
> Aggiornamento vincolante dell'utente durante l'implementazione (10 ottobre 2026):
> Piano va svincolato da UI3 ed è richiesto nell'interfaccia attuale. Il redesign
> generale UI3 verrà affrontato separatamente. Questo sostituisce i vincoli pilot
> delle sezioni 8–10 e del caso 23: il nuovo /budget è indipendente dalla versione
> UI, con gli stessi gate enableBudget, permessi e preferenze AI già esistenti.
> Nessuna modifica al resolver UI3, nessun merge su main o deploy.

Data: 10 ottobre 2026
Stato: proposta completa e incarico per successiva esecuzione con Codex.
Repository: lcresseri-svg/antropic-claudai
Base studiata: 3fd321ce898d196c1d45ce9c116d40587e8e60a4 (main).
Branch documentazione: docs/piano-redesign-2026-10-10.
Questa consegna contiene solo documentazione. Nessun codice applicativo è stato modificato o testato.

## 1. Mandato e risultato
Luca considera Piano poco intuitivo e funzionale e delega lo studio di contenuti, gerarchia e comportamento. L'esecuzione del codice avverrà successivamente con Codex.

Obiettivo: permettere di impostare un mese realistico e capire, durante il mese, quanto margine rimane e quale decisione richiede attenzione.
Le tre domande a cui risponde la pagina:
1. Quanto resta nel mio piano dopo spese effettuate, impegni e obiettivi?
2. Dove sto andando fuori piano?
3. Cosa posso modificare e con quali conseguenze?

Criteri di successo:
- Il primo schermo rende comprensibili mese, margine e sua natura condizionata alle entrate attese.
- In due interazioni si apre il dettaglio di una categoria o la modifica di un obiettivo.
- Si può completare un piano senza fissare un limite per ogni categoria.
- Nessun numero dimostrativo viene presentato come dato dell'utente.
- Nessuna spesa programmata è contata due volte.
- Un errore di scrittura non viene comunicato come salvataggio riuscito.
- Le modifiche hanno anteprima, salvataggio esplicito e annullamento effettivo.
- Non occorre AI per costruire, capire o modificare il piano.

## 2. Diagnosi verificata nel codice
Analisi statica del repository, non prova della UI in esecuzione.

| Osservazione | Evidenza | Conseguenza progettuale |
|---|---|---|
| Il numero principale sottrae solo lo speso | BudgetHero.tsx: left = planned - spent; scheduled entra in una nota separata | Sottrarre il programmato nel numero principale e spiegare il calcolo |
| Nessun limite può essere presentato come categoria sotto controllo | WatchlistCategories.tsx: riskOf restituisce null per planned <= 0; il gruppo safe è descritto come sotto il limite | Stato esplicito Senza limite, distinto da Nei limiti |
| L'apertura di tutte le categorie porta all'editor | WatchlistCategories onOpenAll chiama openEdit | Separare lettura del dettaglio e modifica |
| L'editor scrive mentre si digita | BudgetEditSheet.tsx richiama setter in onChange; Fine chiude soltanto | Draft locale controllato, Salva modifiche, Annulla |
| Molti errori sono ignorati | useBudget.ts usa catch vuoti; mirror e snapshot scritti separatamente | Risultato awaitable, stato di sync e scrittura coerente |
| Piano e realtà si mescolano | BudgetScreenV2 plannedIncome ricade su mIncome se mancano budget entrate | Non usare il consuntivo come intenzione dell'utente |
| Dati dimostrativi nel caso vuoto | DEMO_CATEGORY_BUDGETS, DEMO_CATEGORY_SPEND e savings 420 | Stato vuoto autentico; demo solo nella preview dedicata |
| Esistono due archivi e due schermate | budgetHistory + meta/budget per /budget; monthlyPlans per /monthly-plan | Evolvere /budget come percorso principale, preservando l'archivio sperimentale |
| Motori diversi nei due percorsi | /budget usa forecast V4; MonthlyPlanScreen richiama V3 | Nuova pagina usa il percorso V4 esistente |
| La semina sperimentale usa equivalenti mensili | buildPlanFromRecurring | Le scadenze del mese devono usare occorrenze effettive, non costo annuo / 12 |

Da verificare con test prima di qualificare come bug: deduplicazione delle ricorrenze, interazione con categorie archiviate, classificazione degli investimenti, cambio mese e date UTC/locali. Non considerare questi aspetti già diagnosticati in produzione.

## 3. Scelta di prodotto
Tre approcci valutati:
- Ritocco della dashboard: economico, ma lascia sparsi obiettivi, limiti e scadenze.
- Budget obbligatorio a ogni euro e ogni categoria: controllo elevato, ma troppo lavoro e troppa rigidità per Sunny.
- Piano mensile guidato, controllo quotidiano sintetico e dettagli progressivi: scelto.

Il piano usa le entrate attese e gli obiettivi dell'utente. I limiti per categoria sono facoltativi. Il margine non allocato resta un cuscinetto e non deve essere forzatamente assegnato.
Le previsioni cambiano; gli obiettivi non vengono riscritti dal motore.
Il margine della pagina è contabile e mensile: non è il saldo spendibile oggi. La liquidità e le date di incasso restano consultabili nel percorso Patrimonio esistente.

## 4. Gerarchia della pagina
### 4.1 Testata
Piano · Ottobre 2026, selettore mese accessibile, azione Modifica piano.
Stati sobri: Da completare, Bozza, Confermato. Nei mesi chiusi: Consuntivo.
Navigazione dal primo mese disponibile fino a +12 mesi, come già supportato.

### 4.2 Sintesi principale
Piano completo e confermato:
- Etichetta: Margine per le spese non programmate.
- Un solo importo dominante.
- Testo: Nel mese, dopo spese registrate, programmate e obiettivi.
- Entrate attese ancora da incassare: riga visibile quando presenti. Il numero dipende dal loro arrivo.
- Link Come è calcolato: apre il dettaglio aritmetico completo.
- Se margine negativo: Mancano X € al tuo piano; azione Rivedi piano.
- Se bozza: Margine della bozza, con CTA Rivedi e conferma.
- Se mancano le entrate: Completa il piano; nessun numero di disponibilità.

Niente anello percentuale dominante: consumare una percentuale a metà mese non comunica se le scadenze sono già coperte.
Un eventuale grafico di composizione è secondario, con legenda e importi; un eccesso è mostrato esplicitamente, non compresso in una barra apparentemente equilibrata.

Esempio illustrativo, da usare solo nelle fixture:
entrate attese 2.400 €, risparmio 400 €, investimenti dai conti 200 €, speso 900 €, programmato 350 € → margine 550 €.
Un limite di spesa complessivo di 1.700 € lascia 100 € di cuscinetto rispetto ai 1.800 € disponibili per le spese.

### 4.3 Decisioni del mese
Zero schede quando non c'è una decisione utile. Massimo due avvisi compatti e un accesso agli altri.
Priorità:
1. Dati incompleti, conflitto di salvataggio o piano non confermato.
2. Margine negativo o allocazioni incompatibili con gli obiettivi.
3. Speso + programmato oltre un limite.
4. Sforamento previsto, con dicitura di stima.
5. Spesa in categoria senza limite: informazione neutra, non allarme automatico.

Ogni avviso espone causa, importo e azione pertinente.
Esempio: Ristoranti: 45 € oltre il limite con le spese programmate → Rivedi categoria.
Niente giudizi morali, percentuali di confidenza inventate o suggerimenti automatici di taglio del risparmio.

### 4.4 Il tuo piano
Tre righe compatte modificabili: Entrate attese; Risparmio da mantenere; Investimenti dai conti.
Sotto: Per le spese [importo].
Spiegare Risparmio come quota delle entrate del mese da non destinare a spese o investimenti; è un obiettivo, non denaro già accantonato.
Investimenti significa risorse personali da destinare dai conti; TFR e contributi esterni sono informativi e non consumano quel margine.
Obiettivi modificabili senza aprire un editor generico a quattro tab.

### 4.5 Categorie
Elenco compatto a righe, emoji e nomi originali. Stato e residuo dopo il programmato, non una scheda grande per ogni problema.
Filtri Tutte / Da rivedere; di default visibili fino a cinque righe rilevanti e Mostra tutte. Ordinamento stabile: superate, superamento con programmato, rischio stimato, altre per rilevanza di spesa; ordine congelato durante una modifica.
Riga: nome; residuo oppure Senza limite; secondaria Speso X · Programmato Y · Limite Z.
Una categoria senza limite resta nel totale globale.
Il tocco apre il dettaglio in lettura, con:
- limite, speso, programmato, residuo;
- previsione quando disponibile e chiaramente etichettata;
- movimenti e scadenze pertinenti;
- Modifica limite e Sposta budget.
Categoria archiviata con movimenti o limite nel mese: mostrarla come archiviata, conservarne i valori. Non proporla per nuove selezioni.

Sposta budget: trasferimento tra due limiti con riepilogo prima/dopo, somma totale invariata, salvataggio atomico.
Nessuna riduzione silenziosa del risparmio o spostamento di denaro tra conti.
Non suggerire come donatrice una categoria priva di margine dopo speso e programmato. Se l'utente modifica comunque un limite sotto il già impegnato, mostrare lo sforamento risultante.

### 4.6 Prossime spese
Prime tre scadenze del mese, con data, importo e categoria; poi Vedi tutte.
Usare ricorrenti e movimenti futuri già presenti. In questa prima versione, Aggiungi spesa programmata apre l'editor transazione esistente con data futura e solo al salvataggio crea il movimento.
Esplicitare nel flusso che si tratta di una spesa programmata registrata, non di una simulazione.
Le spese sono già comprese nelle righe di categoria e nel calcolo principale; il riquadro scadenze non aggiunge un altro importo ai totali.
Il costo mensile equivalente degli impegni può essere consultato nella sezione Impegni, senza sostituire gli addebiti effettivi di questo mese.

### 4.7 Chiusura stimata e archivio
Una riga: Spese stimate a fine mese X; confronto con la capacità di spesa del piano.
Aprendo il dettaglio: piano, registrato, programmato e stima con definizioni.
Non sommare speso e programmato a una previsione che include già entrambi.
Se non ci sono dati sufficienti: Previsione ancora poco informativa, senza falsa precisione o valori demo.
Riepiloghi mensili come accesso finale all'archivio esistente.
AI Coach solo tra le azioni secondarie e con i gate e le preferenze attuali.

## 5. Configurazione e modifica
### Primo piano / piano da rivedere
Un unico percorso breve in tre passi con riepilogo persistente:
1. Entrate: suggerimenti da ricorrenti e storico con origine; utente conferma i valori.
2. Obiettivi: risparmio e investimenti dai conti, anche zero esplicito.
3. Spese: scadenze già rilevate, suggerimenti per categorie, possibilità di lasciare limiti non impostati.
Riepilogo finale, Conferma piano. Salva bozza sempre disponibile.
Non obbligare a distribuire l'intero importo e non preselezionare un obiettivo arbitrario di 500 € come scelta dell'utente.

Provenienza suggerimenti: mese precedente, ricorrenze del mese, storico. Le categorie senza storico restano non impostate.
Copia dal mese precedente porta obiettivi e limiti in una bozza: le scadenze vengono ricalcolate, non duplicate.
Le una tantum non vengono copiate come se fossero ricorrenti.
Le operazioni di copia mostrano prima/dopo se esistono già modifiche.

### Editor
Draft locale controllato. Numeri decimali italiani gestiti e validati, niente conversione automatica del campo temporaneamente vuoto in zero.
Salva modifiche / Annulla. Uscita con modifiche: Continua a modificare oppure Scarta.
Conferma il piano salva e conferma in una sola operazione.
La modifica esplicitamente salvata a un piano confermato mantiene lo stato confermato, come il modello esistente.
Input non validi bloccano il salvataggio. Una sovra-allocazione valida può essere salvata come bozza; la conferma richiede una scelta esplicita Continua con piano in disavanzo, mantenendo poi l'avviso. Non dichiararla coerente.
Zero obiettivo è valido. Limite categoria assente significa Senza limite; nella prima versione il comando Rimuovi limite rappresenta questa scelta. Non promettere un limite rigido di zero con il modello legacy che elimina la chiave.

## 6. Contratto dei calcoli
Calcoli puri con date iniettate e arrotondamento monetario coerente. Internamente usare centesimi interi per nuovi aggregati; convertire ai confini dei modelli esistenti senza riscrivere gli importi storici.
Usare il calendario locale dell'app; test UTC ed Europe/Rome. Nessun confronto di date locali ricavate da toISOString per il giorno corrente.

Definizioni del mese selezionato:
E = somma entrate attese confermate dall'utente nel piano.
S = obiettivo di risparmio.
It = obiettivo esplicito di investimenti finanziati dai conti.
Ia = investimenti già effettuati finanziati dai conti, escludendo TFR e apporti esterni.
Ic = investimenti futuri già programmati finanziati dai conti, stessa semantica.
Ir = max(It, Ia + Ic): quota da riservare agli investimenti. Questo valore derivato non modifica l'obiettivo.
A = spese statistiche realizzate nette della quota propria nel mese.
C = spese ancora programmate nel mese, quota propria.
P = E - S - Ir: capacità di spesa del mese.
M = P - A - C: margine per spese non programmate, numero principale.
Gli incassi superiori al piano non aumentano E automaticamente; si propone Aggiorna entrate.
Incassi inferiori o scadenze di entrata passate non giustificano una rassicurazione: mostrare la dipendenza del margine dalle entrate attese.

Per ogni categoria:
Bc = limite facoltativo; Ac = speso; Cc = programmato.
Rc = Bc - Ac - Cc solo se limite presente.
Se manca il limite, Rc è null, non zero né disponibilità negativa artificiale.
Qc = max(Bc se presente altrimenti 0, Ac + Cc).
U = P - somma(Qc): cuscinetto non allocato ad altre spese o limiti.
M e U sono diversi: M comprende anche la quota ancora utilizzabile delle categorie; U esclude quella già assegnata.
Gli impegni nelle categorie sono inclusi tramite max, mai aggiunti nuovamente a Bc.

Previsione:
F = spesa totale finale del motore V4, compatibile con la vista statistica.
Gap di previsione = P - F.
Una previsione oltre P suggerisce che l'obiettivo potrebbe non essere raggiunto, alle ipotesi di entrata e investimento del piano.
Non chiamare questo gap risparmio previsto e non inventare un forecast di cassa ricombinando TFR, versamenti e rimborsi.
Per una futura stima autonoma del risparmio occorre un contratto coerente di previsione di tutti i flussi; non è requisito di questa prima consegna.

Regole:
- Consuntivo: escludere template ricorrenti, proiezioni e movimenti futuri; includere occorrenze effettivamente realizzate.
- Programmato: solo occorrenze ancora da realizzare del mese. Deduplicare movimento materializzato e occorrenza virtuale per identità della serie/data secondo gli helper esistenti.
- E, A, C separati per tipo di movimento; trasferimenti neutrali.
- Spese condivise: ownShare; elaborazione storni già applicata a monte, non una seconda sottrazione.
- Storni: seguire refunds.ts; riducono statisticamente la spesa originaria e non sono entrata ordinaria del piano. La cassa usa invece la data reale di rimborso.
- Ia e Ic: riusare la semantica investedFromAccounts/flowParts. Nessun TFR o apporto esterno.
- Disinvestimenti: non incrementano automaticamente E o il margine; capitale rientrato consultabile in Patrimonio.
- Disattivare la visualizzazione degli investimenti non deve liberare quote già riservate o nascondere uscite reali. Se necessario mostrare una riga sintetica Obiettivi già impostati.
- Includere nel totale categorie archiviate/sconosciute che hanno movimenti; fallback leggibile senza perdere importi.
- Spese annuali: intero addebito nel mese della scadenza, non quota mensile equivalente.
- M negativo resta negativo. Non usare clamp a zero per rendere il piano apparentemente sano.
- Un piano confermato con E = 0 è valido se scelta esplicita; un E mancante blocca la presentazione del margine.

## 7. Mesi, dati mancanti e affidabilità
Mese corrente: margine, decisioni e scadenze.
Mese futuro: Quanto hai pianificato, nessuno speso; occorrenze calcolate per quel mese. Nascondere la previsione V4 se non è verificato che supporti quel periodo; non fingere che il solo cambio di now renda la previsione valida.
Mese passato: Risultato del mese, confronto consuntivo/piano e accesso recap; nessuna CTA Conferma il mese già chiuso. Correzioni del piano possibili tramite Modifica piano storico, esplicite.
Nessun dato: Creiamo il tuo primo piano; nessun budget inventato.
Caricamento: skeleton; dato mancante o errore non diventano zero.
Offline: bozza locale per uid e mese; spiegare In attesa di sincronizzazione se una scrittura è in coda. Non dire Salvato sul server finché non verificato.
Cambio utente: eliminare dalla UI draft e dati della sessione precedente.
Cambio mese/ritorno in foreground: aggiornare calendario e query, preservando eventuali bozze per mese.
Concorrenza: se il piano è stato modificato altrove, conservare il draft e proporre Ricarica piano; nessuna sovrascrittura completa silenziosa.

## 8. UI e accessibilità
Coerenza con Sunny UI 3.0 già presente: superfici glass sobrie, colori e token esistenti, temi chiaro/scuro, gerarchia forte. Conservare emoji e nomi categorie.
Un solo numero dominante. Rosso per disavanzo effettivo, ambra per rischio o dato da rivedere, testo neutro per assenza di limite.
Gli stati includono sempre parole, non solo colore.
Mobile: colonna singola, massimo una sintesi grande, sezioni a righe, editor adattato alla tastiera.
Tablet/desktop: sintesi e obiettivi nella colonna laterale, categorie e scadenze nella principale; stesso ordine semantico e stesse funzioni.
Focus visibile, dialog con focus e ripristino corretti, target almeno 44 px, numeri leggibili, nomi lunghi e testo ingrandito, reduced motion.
La preview usa componenti reali e fixture isolate da Firebase.

## 9. Architettura e compatibilità
Percorso principale /budget, evolvendo il dominio budgetHistory. Non introdurre una terza collezione concorrente.
budgetHistory/{YYYY-MM} è la fonte canonica; meta/budget resta il mirror compatibile per il mese corrente.
Letture e scritture del nuovo percorso usano snapshot mensili; non fare affidamento su due listener asincroni come se fossero una transazione unica.
Riusare il provider/resolver UI esistente. Il nuovo percorso è inizialmente mostrato nella UI 3.0 del pilot attuale; UI 2.0 mantiene il percorso precedente. Non ampliare UID, rollout o permessi.

Estensione additiva proposta in MonthlyBudget:
planningV3?: {
  schemaVersion: 1;
  inputsReviewedAt: number;
  cashInvestmentBudgets: Record<string, number>;
}
cashInvestmentBudgets contiene obiettivi personali dai conti per categoria, distinti dai vecchi investmentBudgets che possono rappresentare capitale versato inclusivo di componenti esterne.
Non convertire automaticamente gli obiettivi legacy: mostrarli come base da rivedere alla prima apertura. I dati legacy rimangono intatti. Dopo la revisione iniziale E e S continuano nei campi condivisi; i nuovi obiettivi cash nel campo esplicito.
inputsReviewedAt distingue un vero zero da un valore ancora non revisionato. Su copia nel nuovo mese resta stato draft e la conferma richiede revisione.
Preservare planningV3 in ogni writer legacy: i setDoc completi attuali non devono cancellarlo. Se un writer legacy modifica entrate, risparmio o investmentBudgets, invalidare la revisione V3 nella stessa scrittura, così l'utente rivede il significato dei valori.
Non mostrare un residuo V3 per i piani legacy non revisionati.

Scrittura:
- API awaitable saveMonthlyBudget(month, draft, expectedRevision).
- Transazione Firestore per controllo revisione e aggiornamento snapshot/mirror del mese corrente; campi estranei preservati.
- Per mesi diversi dal corrente, nessuna modifica al mirror.
- Per funzionamento offline, conservare draft localmente; la transazione richiede rete e viene ritentata esplicitamente. Usare messaggi di bozza locale, non una finta conferma.
- Gestire gare con auto-inizializzazione: creare solo se assente; non sovrascrivere un piano arrivato nel frattempo.
- Due istanze useBudget non devono causare doppia inizializzazione o stati ottimistici divergenti.
- Validazione client e Rules per campi nuovi: numeri finiti e non negativi, versione supportata, uid proprietario. Nessun ampliamento generico dei permessi.

monthlyPlans e /monthly-plan sperimentale:
preservare dati, route e gate attuali; non importarli o cancellarli automaticamente. Nessun nuovo collegamento a quel percorso nel Piano principale.
L'unificazione dell'archivio sperimentale richiede un'importazione esplicita con confronto; è fuori da questa prima implementazione. In questo modo non si perdono eventi una tantum o piani admin.

Componenti proposti, adattabili alle convenzioni del repository:
- monthlyPlanSelectors.ts: calcoli puri, stati, priorità degli avvisi.
- useMonthlyPlan.ts: composizione budget, transazioni, scadenze e forecast; nessuna formula nascosta nella UI.
- PlanSummary, PlanActions, PlanCategoryList, PlanCategoryDetail, PlanUpcoming.
- PlanEditor: wizard iniziale e modifica contestuale, draft locale.
- BudgetScreenV2 resta la facciata della route e seleziona il percorso pilot.
Evitare riscritture di forecast, transazioni, patrimonio e motore ricorrenze: adattare i contratti e correggere solo problemi dimostrati con test.

## 10. Incarico operativo per Codex
La decisione di progetto è documentata qui; l'utente avvierà esplicitamente la sessione di esecuzione. Non ripartire con domande generiche su contenuti e gerarchia.

Ordine di esecuzione:
1. Leggere AGENTS.md se presente, questa specifica, HANDOFF.md e il codice aggiornato. Confrontare HEAD con la base studiata; gli eventuali vincoli storici di vecchi piani sono contesto, non autorizzazione a distribuire.
2. Creare branch di implementazione dedicato. Stabilire baseline con typecheck/test/build e registrare eventuali failure preesistenti.
3. Scrivere test dei selettori finanziari e dei casi di regressione sotto elencati; implementare i calcoli puri.
4. Rendere sicuri e awaitable i salvataggi e l'inizializzazione; aggiungere campo planningV3, compatibilità writer legacy e test Rules.
5. Implementare configurazione guidata e editor con draft. Verificare copia mese, annullamento, errore e conflitto.
6. Implementare pagina e dettagli con i componenti reali, preservando UI2 e gate pilot UI3. Collegare editor spesa programmata esistente.
7. Integrare previsione V4 senza doppio conteggio; mostrare indisponibilità per periodi non supportati.
8. Estendere fixture e verifiche browser già presenti in sunny/ui-preview; controllare mobile/tablet/desktop, chiaro/scuro e tastiera.
9. Eseguire verifiche finali e revisione del diff. Consegnare riepilogo, screenshot, prove dei calcoli e limiti delle verifiche.
10. Nessun merge su main o deploy automatico: il repository distribuisce via CI su main. Lasciare il risultato su branch per revisione. Se push non autorizzato nella sessione di esecuzione, mantenere locale.

File da leggere e presumibilmente toccare:
- sunny/src/features/budget/BudgetScreenV2.tsx, BudgetHero.tsx, WatchlistCategories.tsx, BudgetEditSheet.tsx.
- sunny/src/features/budget/monthlyBudget.ts e test; budgetUtils.ts e test solo per suggerimenti.
- sunny/src/shared/hooks/useBudget.ts; sunny/src/types.ts.
- sunny/src/shared/recurrence.ts, refunds.ts, financialFlow.ts come contratti da riusare.
- sunny/src/features/forecast/v4/forecastCompatV4.ts e contratti motore.
- sunny/src/app/AppRoutes.tsx; provider UI; ui-v3.css per stili limitati al pilot.
- firestore.rules, firestore-tests/rules.test.ts.
- sunny/ui-preview/fixtures.tsx, main.tsx, services.ts e regressions.mjs.
Aggiornare i mock dei hook quando si estendono le API: una preview che non salva non prova il salvataggio reale.

## 11. Casi di accettazione
1. E=2400, S=400, It=200, Ia+Ic=200, A=900, C=350 → P=1800 e M=550.
2. Budget categorie 1700; per ciascuna Ac+Cc <= Bc → U=100. Il programmato non viene sommato una seconda volta.
3. Una categoria senza limite ha A=80, C=20 → stato Senza limite, contributo 100 ai totali, nessuna dicitura sotto controllo.
4. Bc=200, Ac=150, Cc=80 → Rc=-30 e motivo Con il programmato.
5. It=200, Ia+Ic=260 → Ir=260 e M scende di 60; It resta 200.
6. Deposito 300 dal conto di cui TFR 100 → investimento che consuma margine 200. Deposito esterno senza conto → zero impatto cash.
7. Ricorrente annuale 120 in scadenza nel mese → C=120, non 10; mese senza scadenza → zero.
8. Occorrenza materializzata + virtuale della stessa serie/data → un solo impegno.
9. Spesa propria 100 e storno 40 ricevuto → A netto 60; nessuna entrata ordinaria aggiunta. Storno futuro non ancora ricevuto non riduce A.
10. Storno ricevuto nel mese per una spesa del mese precedente → nessuna entrata nel piano corrente; preservata la distinzione statistica/cassa.
11. Trasferimento fra conti → nessun effetto su E, A o C.
12. Forecast totale 1600 con A=900 e C=350 → confronto con 1600, non 2850.
13. Entrate non impostate → nessun margine dichiarato. Zero entrate esplicitamente revisionato → piano valido anche se negativo.
14. Importo cancellato durante digitazione e poi Annulla → nessuna scrittura né perdita di valore.
15. Salvataggio fallito/offline → draft conservato, errore/stato visibile, nessun messaggio server riuscito.
16. Modifica mese futuro → snapshot di quel mese cambia, mirror corrente invariato.
17. Cambio mese mentre la PWA resta aperta → mese corrente aggiornato; nessun dato scritto sotto il mese sbagliato.
18. Cambio utente → nessuna esposizione di draft precedente.
19. Categoria archiviata con spesa → totale completo e riga identificabile.
20. Sposta 50 fra due categorie → totale limiti invariato; errore di salvataggio non applica metà operazione.
21. Writer UI2 modifica un piano con planningV3 → metadata non perso e revisione invalidata secondo contratto.
22. Un piano storico corretto non modifica obiettivi o previsioni del mese attuale.
23. Pilota UI3 e utente UI2 → rispettivi percorsi visibili; nessun nuovo accesso a funzioni admin.
24. Accesso a documenti di altro uid o campi planningV3 non validi → negato dalle Rules.
25. Nessun dato → nessun 420 € o budget fittizio nella UI di produzione.
26. Maggiore previsione di spesa → avviso, nessun salvataggio automatico dei limiti.
27. Conflitto fra due sessioni → draft locale preservato e conflitto esplicito.
28. Stessi eventi vicino a mezzanotte e cambio ora legale → corretta appartenenza al mese in UTC ed Europe/Rome.

## 12. Verifica e consegna richiesta
Comandi frontend dalla cartella sunny:
- npx tsc --noEmit
- npm test
- npm run build

Per le Rules, seguire configurazione CI/emulatore presente nel repo e la suite firestore-tests. Non cambiare la versione strumenti solo per questo lavoro.
Per UI, seguire sunny/ui-preview/README.md e gli script esistenti; documentare dipendenze non disponibili senza inventare esecuzioni riuscite.
Eseguire i test temporali sia UTC sia Europe/Rome.
Controlli manuali/browser: viewport 390, 768, 1440 px; tema chiaro/scuro; testo lungo; tastiera; focus; reduced motion; zero/assenza/dato negativo; errore e conflitto.
Non dichiarare certificata l'esperienza Safari reale o screen reader se verificata solo tramite emulazione desktop.

Consegna dell'agente:
- cosa cambia per l'utente;
- file e decisioni tecniche principali;
- test eseguiti con esiti reali e failure preesistenti;
- screenshot dei flussi principali;
- branch e commit;
- nessun deploy effettuato.

## 13. Prompt da incollare in Codex
Implementa la riprogettazione della sezione Piano di Sunny descritta in docs/product/2026-10-10-piano-redesign.md sul branch docs/piano-redesign-2026-10-10 del repository lcresseri-svg/antropic-claudai. Leggi l'intero documento e le istruzioni del repository. Crea un branch di implementazione a partire dalla base aggiornata appropriata, portando con te questa specifica. Considera definite le scelte di prodotto; risolvi autonomamente i dettagli ordinari. Mantieni il nuovo percorso nel pilot UI3 e preserva UI2, dati, permessi e funzioni esistenti. Procedi per calcoli, persistenza, editor, pagina e verifiche. Non sostituire dati mancanti con demo. Verifica le formule e i casi di accettazione, includendo Firestore Rules e interazioni browser. Consegna il risultato sul branch con test e screenshot. Non fare merge su main né deploy.
