# Inventario di rotte, controlli e overlay

**S** = sorgente ispezionata; **R** = rendering/browser e screenshot; **I** = percorso interattivo realmente eseguito. R non implica I. Il catalogo AST `evidence/controls-source.json` elenca 568 dichiarazioni di controlli, inclusi componenti personalizzati e generatori di righe, con file, riga, attributi e handler. `evidence/routes/routes.json` elenca le istanze visibili per ciascuna route/tema/viewport; `evidence/details/controls.json` estende il catalogo a dettagli e impostazioni. I controlli della fixture sono distinguibili dalle funzioni del prodotto.

## Rotte

Tutte le rotte dichiarate da AppRoutes sono incluse. I parametri dinamici sono provati con un anno/mese sintetico; non ogni valore possibile.

| Rotta | Controlli e destinazioni | Copertura e prova |
|---|---|---|
| `/` | dock/rail, aggiungi, entrate/uscite/investito, conto/categoria, ritmo, riepilogo, menu/riordino | S/R/I: interactions, check, regressions; screenshot home |
| `/wealth` | storico, dati grafico, impegni, liquidità/investito, conti/categorie | S/R/I: details, matrix; unit per serie |
| `/budget` | mese, modifica, dettaglio calcolo, categorie, riepiloghi, bozza/conferma/copia/recupero | S/R/I: cinque suite piano + discard + budget regression |
| `/transactions` | ricerca, tipo, periodo, query, raggruppamento, sort, selezione, bulk, riga/serie, aggiungi | S/R/I: check, interactions, bulk, details; rendering condizioni in inventario |
| `/investments` | dettaglio, controvalore, versa, disinvesti, movimenti, menu | S/R/I: investment regression + details; errore controvalore |
| `/income` | periodi, statistiche, dati, fonte → movimenti | S/R/I: grafici (barre mensili e tabella); link/periodo nel sorgente e unit helper |
| `/category-spending` | periodi, ranking → dettaglio → movimenti filtrati | S/R/I: details e unit chart |
| `/account-balance` | periodi, conto → dettaglio → movimenti filtrati | S/R/I: details e unit range |
| `/wealth-history` | periodi, dati, statistiche, tastiera punti | S/R/I: details (End + cambio periodo più breve) |
| `/insights` | motivo, priorità, archivia, utile/non utile, gruppi, tutti | S/R; nessun invio di feedback su produzione |
| `/ai-coach` | domanda/importo, generazione esplicita, risultato/ipotesi | S/R; gate I in interactions; rete AI simulata |
| `/recap/:ym` | mese precedente/successivo, Piano, dettagli, export/stampa | S/R/I: ritorno archivio in regressions, stampa, unit export |
| `/settings/*` | ricerca, gruppi, toggle, conti/categorie, dati, notifiche, feedback, account, strumenti | S/R/I: interactions/settings regression/details; sottosezioni sotto |
| `/wealth-v2` | disponibilità, decomposizione, snapshot/backfill | S/R; nessun backfill reale |
| `/commitments` | frequenze, scadenze, serie | S/R; calcoli nelle suite esistenti |
| `/monthly-plan` | mese, genera/copia/conferma | S/R; nessuna scrittura sperimentale su account reale |
| `/forecast-v3` | modelli, diagnostica/backtest, gate strumenti | S/R; suite forecast, due TZ; nessun rinominare V3 in V4 |
| `/metrics` | periodo, definizioni, caricamento/errore | S/R; fixture vuota, backend non interrogato |
| `/wrapped/:year` | ingresso, avanti/indietro/timer/swipe, riepilogo, obiettivo | S/R/I: wrapped, entry, interactions; confronto baseline |
| `*` | Navigate Oggi con replace | S; contratto invariato |

## Overlay e moduli

| Famiglia | Contratto | Copertura |
|---|---|---|
| TransactionModal | richiesta chiusura dirty; dati/source/ordine invariati; picker torna al campo | I: dialog/draft/keypad/failure/backdrop, interactions, category regression, dismiss |
| PlanDialog + PlanEditor | top layer annidato; body unico scroller; footer montato; draft mensile | I: dismiss entrambi temi/844–500 px, tutte le suite Piano anche UI2 |
| DiscardConfirmation | conservativa iniziale; Escape/backdrop tornano all’editor; scarto esplicito | I: geometria, focus, 2 px, valori, quattro uscite dove presenti |
| OptionSheet / picker categoria | livello singolo, X nominata, back ripristina focus | I: category regression + investment regression |
| CategoryDetailSheet / AccountDetailSheet | lettura, tabella fonte, link contestuale periodo/tipo/conto/categoria | I: details, entrambi temi |
| InvestmentDetail / Deposit / Withdraw / CurrentValue | Back torna al dettaglio; X chiude flusso; dirty conserva; async/error | I: investment regression + details, errore controvalore; numeri nelle suite finanziarie |
| RefundSheet | firma draft, effetti finanziari esistenti, chiusura coerente | I: percorso storno interactions; writer remoto non esercitato |
| EditDefSheet | firma anagrafica, richiesta scarto; elimina/archivia secondo writer esistente | S/R; ritorno impostazioni I; operazioni reali non eseguite |
| ImportModal | file/preview/done; scarto se preview; errore conserva righe | I: CSV sintetico, preview/scarto/continua, successo singolo, fallimento conserva righe, chiusura; nessun estratto reale |
| FeedbackSheet | dirty; attesa invio, errore/ok; chiusura non su pointerdown | S/R via superficie condivisa; invio remoto non eseguito |
| ReorderHomeSheet | salva alla chiusura; nessuna promessa di rollback | S; contratto originale conservato |
| SeriesDetailSheet | dettaglio lettura, singola/serie, movimenti | S/R condizionale; modelli serie nelle suite esistenti |
| SeriesEditChoiceSheet | componente legacy non referenziato dalle rotte attive | S; non dichiarato runtime |
| BudgetEditSheet | percorso legacy autosalvato, distinto dal nuovo Piano | S; nuovo Piano verificato separatamente |
| InsightDetailSheet / MonthRhythmSheet | lettura, close/back, navigazione giorno/movimenti | S/R; infrastruttura dialog I nelle suite |
| ReleaseDialog / PushPromoSheet | coda avvisi dopo editor; un livello alla volta | I: interactions, nessuna notifica inviata |
| WhatsNewModal | note versione e chiusura | S; non forzata in produzione |
| RecapExportSheet | scelta export/stampa, annullamento sistema | S; unit export e print emulato; share sheet OS non provato |
| Login / onboarding | login errore, passi, indietro, import, demo, risparmio, pronto | I: onboarding light/dark, fallimento e scrittura locale lenta |
| Wrapped overlay/goal | interamente esclusi dal redesign | I + pixel/stili/hash; leggere relazione 05 |

## Impostazioni e stati condizionali

Screenshot e inventario dei controlli per `generali`, `gestione`, `accounts`, `categories`, `dati`, `info`, `versioni`, `investimenti`, `aspetto`, `budget`, `ai`, `notifiche`, `avanzate`, `riserva`. Le chiavi legacy possono mappare la nuova sezione equivalente. Ricerca e ritorno alla voce originaria sono azionati nei test.

Gates admin/UI2, AI disabilitata, investimento disabilitato, logout/cambio utente, importo invalido, errore rete movimento, bulk fallito, Piano vuoto/legacy/storico/errore/conflitto/lento sono provati negli script indicati. Vuoto, categorie archiviate/sconosciute e nomi lunghi hanno rendering a 320 px e testo 200%. Zero/negativo/serie corta e unità dei grafici hanno test unitari. Tabelle possono scorrere internamente: non devono allargare la pagina.

Azioni esterne sensibili (cancellare account/dati, inviare feedback/push, AI live, backfill) sono inventariate e ispezionate senza eseguirle su account reali. Non vengono presentate come test end-to-end riusciti.
