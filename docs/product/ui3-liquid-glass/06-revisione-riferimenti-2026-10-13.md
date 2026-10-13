# Sunny UI 3.0 — revisione verso i riferimenti del 13 ottobre

Specifica operativa per sviluppo · 13 ottobre 2026  
Stato: documentazione di revisione; non implementazione né collaudo.

## 1. Mandato e precedenza

Luca vuole orientare Sunny verso i riferimenti IMG_1751–IMG_1757: una finanza personale immediatamente leggibile, con dati protagonisti, pochi livelli visivi e dettagli completi raggiungibili. Questa revisione completa [01-specifica](01-specifica.md), [02-schermate-e-flussi](02-schermate-e-flussi.md) e [03-codex-e-verifiche](03-codex-e-verifiche.md). In caso di conflitto sulla gerarchia o sulla direzione visiva, prevale questo documento. I contratti finanziari, la protezione del Wrapped e la gestione delle bozze delle specifiche precedenti restano vincolanti.

**Limite delle fonti:** sono stati recuperati contenuti e metadati di tutti e sette i riferimenti, ma la visualizzazione completa dei pixel non è riuscita. Le scelte di palette, dimensioni e materiali qui sotto sono proposte Sunny, non misure estratte dalle immagini. Prima di dichiarare fedeltà visiva ai riferimenti, esaminarli realmente e confrontare le schermate renderizzate. Non inventare il nome dell'app mostrata né usare i titoli promozionali degli screenshot come copy dell'app.

| Riferimento | Contenuto recuperato | Traduzione in Sunny |
|---|---|---|
| IMG_1751.jpeg | Disponibilità, risparmi, entrate/uscite del mese | Sintesi con numero principale e decomposizione chiara |
| IMG_1752.jpeg | Registrazione rapida e lista delle spese | Inserimento riconoscibile e movimenti leggibili |
| IMG_1753.png | Collegamento Wallet, carta e categorie | Riutilizzare il flusso Apple Pay esistente, con conferma esplicita |
| IMG_1754.jpeg | Profili e budget condiviso | Riprendere chiarezza e raggruppamento; nessuna nuova funzione di condivisione |
| IMG_1755.jpeg | Abbonamenti, costo mensile e prossime scadenze | Impegni fissi con totale normalizzato e calendario reale |
| IMG_1756.jpeg | Budget complessivo e per categoria | Piano con residuo, limite e avanzamento |
| IMG_1757.jpeg | Obiettivi di risparmio e progresso | Obiettivi esistenti, senza inventare risparmi disponibili |

## 2. Stato corrente verificato e punti di intervento

Lettura di main effettuata il 13 ottobre tramite GitHub; nessuna preview eseguita in questa attività.

- `sunny/src/shared/uiVersionConfig.ts` assegna oggi `everyone:'2.0'`, `pilotAdmin:'3.0'`, `forceEveryone:null`; il pilot è limitato alla allowlist esistente e alla verifica admin.
- `UiVersionProvider.tsx` applica il tema/versione e conserva memoria UI per utente/versione. Riutilizzarlo.
- `App.tsx` sceglie AdaptiveNav/UI3 o SideNav/BottomNav/UI2 e contiene il confine liquid che esclude la route Wrapped.
- `AppRoutes.tsx` contiene le rotte effettive e i limiti di larghezza. I nomi DashboardV2/BudgetScreenV2 non implicano che occorra duplicare i motori per UI3.
- `AdaptiveNav.tsx` usa già ArcLogo e mantiene Oggi, Patrimonio, Piano, Movimenti, Aggiungi. Verificare il logo anche in AppHeader e negli altri punti, senza sostituirlo con un sole generico.
- `TransactionModal.tsx` contiene già tastierino, registrazione/modifica, serie, storni e conferma scarto: preservare i flussi.
- I documenti del 12 ottobre descrivono storicamente `pilotAdmin:'2.0'`: non usare quel valore per ripristinare una configurazione superata. I resoconti di test precedenti non certificano questa revisione.

## 3. Principi di composizione

Ogni pagina risponde a una domanda, mostra un numero dominante con etichetta e periodo, e rende evidente il passo successivo. Evitare una griglia di riquadri tutti equivalenti.

- Composizione prevalentemente aperta: titolo, dato, grafico o elenco, separazioni sottili.
- Un solo blocco dominante; le informazioni secondarie restano subordinate.
- Card soltanto quando riuniscono contenuti con un significato comune o segnalano un compito.
- Nessun pannello oro esteso in testa a Oggi. L'oro resta un accento di identità e azione.
- Numeri importanti grandi, etichette brevi ma precise. Non cancellare Saldo, Previsto, Da confermare o data di aggiornamento.
- Testi metodologici e statistiche secondarie nel dettaglio; rischi e conseguenze delle azioni visibili subito.
- La disponibilità del conto, il patrimonio e il margine del piano sono grandezze diverse: mai sostituire l'una con l'altra per esigenze estetiche.
- Componenti condivisi per header, riga monetaria, selettore periodo, dettaglio e stato vuoto. Evitare regole CSS globali su tutti i button, svg o titoli.

## 4. Direzione visiva proposta

| Elemento | Indicazione |
|---|---|
| Chiaro | Fondo #FFFFFF; testo #151619; neutro secondario #F7F9FC |
| Scuro | Fondo #050608; testo #F7F8FA; superfici #101216 |
| Oro Sunny | Accento selettivo, CTA o piccoli indicatori; niente patacca dominante |
| Tipografia | Font esistente; cifre tabulari; hero 36–48 px mobile, 48–64 desktop |
| Testi | Corpo 14–16 px, metadati 12–13 px; importi lunghi senza tagli |
| Spazi | Scala 4/8/12/16/24/32; gutter mobile 16–20 px |
| Raggi | 16–24 px per gruppi, 24–28 px per finestre; righe generalmente senza card propria |
| Glass | Navigazione, menu e overlay; pannelli dei dati più stabili e coprenti |
| Movimento | Feedback 120–180 ms; aperture 220–300 ms; reduced motion rispettato |

Questi valori partono dalla specifica precedente. Rifinirli sul rendering, verificando contrasto su fondo composito, leggibilità e gerarchia. Nessuna rifrazione/distorsione sui numeri. Niente blur su ogni riga o bagliori decorativi diffusi.

## 5. Revisione delle schermate

### Oggi — «Come sto e cosa richiede attenzione?»

Ordine proposto:
1. Logo Sunny alto a sinistra; saluto breve e accesso alle impostazioni.
2. Dato principale: liquidità sui conti inclusi, etichettata correttamente. Se si usa “Disponibilità”, spiegarne la base; non presentarla come cifra liberamente spendibile al netto degli impegni.
3. Sintesi del mese: entrate, uscite, eventuale margine del Piano distinto dal saldo.
4. Una priorità operativa, soltanto se esiste: pagamenti Apple Pay da confermare, scadenza imminente o rischio del Piano.
5. Grafico compatto dell'andamento mensile, se i dati lo consentono.
6. Ultimi movimenti e accesso a tutti; statistiche secondarie nel dettaglio.

Non accumulare più pannelli hero né aggiungere avvisi fissi quando non c'è nulla da fare. Con più priorità, mostrare una sintesi con conteggio e aprire l'elenco completo. Il tocco sul totale porta a dati coerenti con periodo e perimetro.

### Patrimonio — «Che cosa possiedo e come è composto?»

Totale nominato correttamente; liquidità e investimenti separati. Sotto: andamento reale disponibile, conti, investimenti e accesso agli Impegni. Rispettare conti esclusi dal patrimonio. Capitale versato e controvalore non sono sinonimi; nessun rendimento dedotto dai soli versamenti. La mancanza di storico produce uno stato esplicito, non una linea inventata.

### Piano — «Quanto margine resta nel mese?»

Riutilizzare il Piano già implementato e i suoi selettori:
1. Mese, stato e margine del Piano.
2. Barra speso/programmato/residuo con limite e valori testuali.
3. Categorie in righe: emoji, nome, speso, limite/residuo, progresso.
4. Rischi di previsione visibili per le categorie interessate.
5. Modifica Piano e accesso a calcolo, obiettivi e archivio.

Entrate attese non incassate devono rimanere riconoscibili. Disavanzo visibile con segno, senza clamp che lo nasconda. Il forecast esistente resta nel dettaglio; non cambiare formule, finanziamento investimenti o trattamento degli storni.

### Movimenti — «Che cosa è successo?»

Ricerca e periodo in alto, filtri compatti con stato attivo. Lista per giorno con emoji, descrizione dominante, conto/stato secondari e importo allineato. Distinguere registrati, programmati, trasferimenti e storni oltre al colore. Il totale deve riferirsi esattamente al filtro e alla metrica dichiarata. Tocco sulla riga mantiene l'apertura del flusso esistente; non inventare un comportamento incoerente tra righe. Selezione multipla, errori e conferme mantengono il contesto.

### Impegni fissi — «Quanto pago regolarmente e cosa arriva ora?»

Totale mensile equivalente chiaramente distinto dagli addebiti reali del mese. Prossime scadenze in ordine di data; elenco delle serie con emoji, importo, frequenza e prossima occorrenza. Abbonamenti e rate restano distinguibili. Dettaglio con modifica occorrenza/serie secondo il comportamento esistente. Nessun nuovo tab principale obbligatorio: accesso stabile da Patrimonio e menu.

### Risparmio e obiettivi

Valore raggiunto, obiettivo e avanzamento dove esistono dati pertinenti. Non chiamare risparmio una quota solo pianificata e non equiparare patrimonio a denaro accantonato. Riutilizzare funzioni esistenti; se non c'è un modello di obiettivo dedicato, documentare la lacuna e non aggiungere uno schema Firestore per imitare lo screenshot.

### Investimenti, analisi e altre pagine

- Investimenti: controvalore e versato distinti; data di aggiornamento; operazioni di versamento/prelievo/valore raggiungibili.
- Entrate, categorie e conti: numero, periodo, grafico/lista, movimenti coerentemente filtrati.
- Consigli: priorità breve, evidenza e azione pertinente; motivazione estesa nel dettaglio.
- Riepilogo mensile: risultati del mese, variazioni e accesso a dati/esportazione.
- Previsione e Metriche: stessa tipografia e temi; conservare informazioni tecniche utili e gate.
- Impostazioni: gruppi Aspetto, Conti e categorie, Funzioni, Notifiche, Dati, Account. Azioni distruttive separate.
- Login e onboarding: logo reale, passaggi essenziali, bozza stabile; dati demo esplicitamente nominati.

Non introdurre nuovi profili condivisi, iCloud, integrazioni Wallet native o automazioni diverse da quelle già disponibili.

## 6. Modale nuova spesa: gerarchia protetta

Il riferimento funzionale è il form esistente UI2 e la richiesta di Luca, non un nuovo wizard.

**Importo → descrizione immediatamente sotto → categorie con emoji → campi successivi nell'ordine attuale.**

Il selettore del tipo resta nella posizione coerente con il flusso esistente. Conservare conto, data, ricorrenza, rate, investimenti e relative condizioni. Le sezioni rare possono essere progressive senza riordinare arbitrariamente i campi. “Registra storno” e gli storni associati restano disponibili negli stessi contesti.

Mobile: sheet, tastierino/alternativa tastiera secondo preferenza, azioni sempre raggiungibili. Tablet/desktop: finestra dimensionata al contenuto e input da tastiera. Descrizione non spostata dietro una scheda o lontano dall'importo. Tastiera e tastierino non devono occultare il campo attivo o Salva.

X, Annulla, Escape e backdrop passano dalla stessa richiesta di chiusura. Con modifiche: conferma sovrapposta nell'area visibile; form montato e immobile sotto. Continua mantiene bozza, focus e scroll. Scarta elimina solo la bozza pertinente. Errore conserva input; successo mostrato soltanto dopo l'esito reale.

## 7. Navigazione e adattamento

Conservare Oggi, Patrimonio, Piano, Movimenti e Aggiungi. Tab attivo distinguibile con un segno discreto, senza riempimento oro ingombrante sul primo tab.

Logo Sunny effettivo alto a sinistra su telefono, iPad e PC. Nessun sole generico come sostituto. Nelle sottopagine usare ‹ con nome accessibile “Indietro”; un solo controllo per livello.

Il ritorno conserva origine, periodo, filtri e scroll; deep link senza origine usa un genitore noto, non un navigate(-1) cieco. Le aperture di dettaglio non devono azzerare la lista.

| Formato | Composizione |
|---|---|
| Telefono, 320–639 px | Una colonna; dock compatto e safe area; modale come sheet |
| Tablet, 640–1279 px | Rail; una/due colonne secondo spazio reale; niente mobile semplicemente stirato |
| Desktop, ≥1280 px | Sidebar; contenuto centrato con limiti esistenti; principali dati a sinistra, dettagli secondari a destra |
| Altezza ridotta / tastiera | Azioni raggiungibili; scroller unico nell'editor; evitare dock concorrente |

I breakpoint sono una base di lavoro coerente con la navigazione esistente: verificare anche landscape e contenitori, non solo la larghezza del dispositivo.

## 8. Wrapped invariato

Lasciare integralmente il Wrapped come esperienza Spotify/stories: sequenza, timer, barre di progresso, gesti, copy, grafici, riepilogo, condivisione, obiettivo finale e condizioni di accesso. Conservare anche la scheda di ingresso.

Isolare i nuovi token e selettori dalla route e dal sottoalbero Wrapped, comprese dipendenze condivise e portali. Confrontare screenshots a story/tempo fissati e interazioni prima/dopo: il solo diff vuoto della cartella non è una prova sufficiente.

## 9. Versioni e rollout

Riutilizzare l'unica configurazione in `sunny/src/shared/uiVersionConfig.ts`:

```ts
// Configurazione corrente: conservare allowlist e verifica admin esistenti.
everyone: '2.0',
pilotAdmin: '3.0',
forceEveryone: null,
```

La revisione aggiorna la UI3; non aggiungere una terza versione solo per questa iterazione. La nuova esperienza rimane riservata a Luca attraverso la allowlist attuale, non a qualsiasi admin. Un cambio di UI non concede dati o feature.

Per la futura pubblicazione generale è già disponibile `forceEveryone:'3.0'`; per rollback `forceEveryone:'2.0'`. Sono istruzioni operative per una decisione successiva, non azioni da eseguire durante questo incarico. Nessuna preferenza locale o parametro URL deve aggirare il resolver di produzione. Durante logout/cambio account nessun dato o draft del precedente utente deve sopravvivere.

## 10. Sequenza di lavoro e criteri di accettazione

1. Baseline: main aggiornata, istruzioni repository, screenshot di UI2/UI3 e Wrapped; inventario delle rotte e controlli.
2. Verticale Oggi → dettaglio → movimento → conferma scarto in entrambi i temi, prima di estendere lo stile.
3. Navigazione e componenti base; Patrimonio, Piano e Movimenti.
4. Impegni, investimenti, analisi, impostazioni e overlay; nessuna statistica resa irraggiungibile.
5. Verifica finale, evidenze e PR di implementazione separata. Nessun merge/deploy automatico.

Checklist di accettazione:
- [ ] Oggi ha un dato dominante, niente grande pannello oro, priorità solo quando necessarie.
- [ ] Importo e descrizione adiacenti; categorie con emoji; ordine UI2 preservato.
- [ ] Storni, ricorrenze, rate e Apple Pay mantengono semantica e risultati.
- [ ] Saldi, margine, versato/controvalore e previsto/reale restano distinti.
- [ ] Ogni dato cliccabile apre il dettaglio pertinente e riconciliabile.
- [ ] Back conserva filtri/scroll; deep link e sottolivelli hanno fallback.
- [ ] Conferma scarto sempre visibile, senza salto o sostituzione del form.
- [ ] Nessuna azione senza destinazione, nessun falso successo; errori conservano lavoro.
- [ ] Chiaro bianco e scuro profondo, contrasto leggibile anche sulle trasparenze.
- [ ] Nessun overflow a 320 px, importi lunghi, font ingranditi e landscape.
- [ ] Wrapped invariato nelle immagini deterministiche e nei gesti/timer.
- [ ] Luca riceve UI3; utente normale e admin non in allowlist ricevono UI2.
- [ ] UI2 verificata anche sui componenti condivisi; funzionalità gated invariate.

Eseguire typecheck, test frontend appropriati e build secondo README. Confrontare baseline e risultato, dichiarando errori preesistenti. Verificare browser nei due temi a 390×844, 834×1194 e 1440×900, oltre a stress 320 px, testo 200%, tastiera, reduced motion e stati vuoti/errore. Su iPhone/iPad reali verificare safe area, scroll, tastiera e PWA; una viewport Chromium non certifica Safari. Grafici con tap/tastiera, valori testuali, legend e dati reali.

Questo documento non dichiara test eseguiti né difetti riprodotti in questa attività.

## 11. Incarico pronto per Codex

> Revisiona la UI 3.0 di Sunny seguendo docs/product/ui3-liquid-glass/06-revisione-riferimenti-2026-10-13.md e i contratti precedenti 01–03. Parti dalla main aggiornata su un branch dedicato. Esamina realmente i sette riferimenti se disponibili; altrimenti applica le proposte documentate dichiarando il limite, senza simulare una corrispondenza visiva. Riduci la frammentazione in card, dai priorità a numeri, righe e grafici utili, riserva il glass alla navigazione e ai livelli temporanei. Copri tutte le rotte e gli overlay. Conserva formula e funzionalità del Piano, gerarchia del modale spesa, descrizione sotto l'importo, emoji e storni. Wrapped completamente invariato. Riutilizza UiVersionProvider e uiVersionConfig: tutti UI2, solo Luca in allowlist UI3, forceEveryone null. Non cambiare rollout pubblico, autorizzazioni, schema dati o automazioni per motivi estetici. Verifica back, focus, scroll, conferme sovrapposte, salvataggi, errori, temi e responsive con evidenze reali. Consegna PR separata, inventario dei controlli, screenshots e risultati dei test; nessun merge o deploy.
