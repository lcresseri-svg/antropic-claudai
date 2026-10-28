# Sunny 2.2.0 — carte di credito e rimborsi multipli

Verifica del 28 ottobre 2026. Branch `feat/credit-cards-multi-refunds`, base `2837d5e` (main aggiornata). Nessun dato personale letto; prove su fixture locali e progetti demo dell’emulatore Firestore. Le prove browser simulano i salvataggi in memoria; i test di repository/backend eseguono transazioni reali nell’emulatore con le regole di produzione.

## Esiti

| Verifica | Esito effettivo |
| --- | --- |
| Frontend `npm test` | 1.111 passati, 26 saltati; 113 file passati, 3 saltati |
| Repository finanziari su Firestore | 21 passati, inclusi concorrenza, errori e ricevuta atomica di 100 sorgenti |
| Suite `firestore-tests` con emulatore | 77 passati: regole, backend carte, notifiche e statistiche AI |
| Frontend TypeScript + Vite | Passato |
| Functions TypeScript | Passato |
| Audit functions con soglia high | Passato: zero high/critical; 8 moderate già presenti nelle dipendenze |
| Browser: flussi completi | 8/8 combinazioni UI2/UI3 × chiaro/scuro × 390/1440 px |
| Browser: scarto bozza, geometria, scroll, focus e overflow | 4/4 combinazioni UI3 × chiaro/scuro × 390/1440 px |
| Browser: riepilogo cassa mensile e scadenza carta | 4/4 combinazioni UI3 × chiaro/scuro × 390/1440 px |
| Regressione moduli Movimento/Piano | 8/8 casi: temi chiaro/scuro e viewport alti 844/500 px |
| Revisione indipendente | Due incoerenze P2 nei consumatori del Piano/riepilogo corrette e riverificate; nessun rilievo residuo confermato |

I 26 casi saltati della suite ordinaria includono i test che richiedono emulatore. I 21 nuovi casi di repository sono stati eseguiti separatamente, non dichiarati passati perché saltati. La vecchia suite `investmentValueSync.emulator.test.ts`, che richiede un diverso assetto Auth, resta saltata nella suite ordinaria e non è inclusa nel conteggio dei 21 nuovi casi.

Risultati browser strutturati: [matrice](results.json), [scarto/focus](dismiss-results.json), [cassa mensile](month-results.json). Gli screenshot sono file PNG in questa directory; `regression/` contiene quelli dei moduli Movimento/Piano. I log sintetici sono in [test-results.txt](test-results.txt).

## Inventario dei controlli

| Area | Controlli/stati coperti |
| --- | --- |
| Gestione conti | Flag Carta di credito, giorno 1–31, conto abbinato, mese di decorrenza corrente predefinito, salvataggio e errore con bozza conservata; configurazioni storiche mantenute; esclusioni di conto uguale/archiviato/investimento/carta; banca abbinata non eliminabile finché in uso |
| Distinta | Una riga per carta e mese, febbraio/bisestile/fine anno, quota condivisa, storni su carta/banca, crediti riportati, modifiche e cancellazioni sorgente, retry e concorrenza, oltre 500 distinte, app chiusa/catch-up |
| Saldi/patrimonio | Liquidità prima/dopo scadenza, debito conservato nel patrimonio, saldo iniziale e movimenti anteriori alla decorrenza, conti esclusi, storico, andamento, cambio data Roma con schermata aperta |
| Piano/riepilogo | Formule del Piano identiche con input originali anche per investimenti con carta; addebiti/accrediti carta espliciti nel grafico di cassa e nelle scadenze; nessuna seconda spesa |
| Movimenti | Seleziona, selezione di 1 o più spese, azione Rimborso, selezione mista incompatibile, esclusione delle distinte da operazioni massive, riepiloghi statistici e gruppi |
| Storno singolo | Modulo `RefundSheet.tsx` invariato; nuovi salvataggi coordinati con le ricevute multiple e ID stabile nei retry |
| Rimborso multiplo | Ricevuto 80 su 60+40 → copertura 48+32 e residuo 12+8; ricevuto 120 → copertura 100 e guadagno 20; conto, data, nota, anteprima, modifica e cancellazione intera ricevuta, sorgenti con allocazione arrotondata a zero, importi in centesimi |
| Salvataggi | Atomicità della ricevuta, concorrenti singoli/multipli, modifiche/cancellazioni sorgente concorrenti, importo personale sotto quota coperta bloccato, nessuna conferma falsa in caso di errore |
| Modali | X, Escape, Indietro e backdrop aprono la stessa conferma; Continua preserva bozza/posizione e focus; Scarta ripristina il focus al comando iniziale; nessuno scorrimento laterale nei casi provati |
| Accesso | Letture/scritture solo del proprietario, controlli/ricevute con schema valido, distinte gestite dal server non modificabili dal client, regressione delle regole esistenti |

## Casi numerici verificati

Banca 1.000 €, carta con due spese di 60 € e 40 €, addebito il 10 novembre:

| Stato | Banca | Carta | Liquidità | Patrimonio |
| --- | ---: | ---: | ---: | ---: |
| 28 ottobre | 1.000 | −100 | 1.000 | 900 |
| Rimborso 80 sulla banca | 1.080 | −100 | 1.080 | 980 |
| Ricevuta modificata a 120 | 1.120 | −100 | 1.120 | 1.020 |
| Ricevuta eliminata | 1.000 | −100 | 1.000 | 900 |
| 10 novembre, senza rimborsi | 900 | 0 | 900 | 900 |

Il rimborso sulla banca non riduce il debito della carta; un rimborso sulla carta riduce invece la relativa distinta. Test distinti coprono entrambe le opzioni. Gli impegni riservano 100 € alla data di addebito, senza riservare una seconda volta le spese differite.

## Riproduzione

Da `sunny`, con preview già avviata su 4177:

```sh
npm test
npm run build
SUNNY_BROWSER=/usr/bin/chromium node ui-preview/credit-cards-refunds.mjs
SUNNY_BROWSER=/usr/bin/chromium node ui-preview/credit-cards-refunds-dismiss.mjs
SUNNY_BROWSER=/usr/bin/chromium node ui-preview/credit-cards-month.mjs
SUNNY_BROWSER=/usr/bin/chromium node ui-preview/liquid-dismiss.mjs
```

Con emulatore locale Firestore attivo, dalla radice:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm --prefix firestore-tests test
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm --prefix sunny test -- src/features/investments/investmentRefundGuards.emulator.test.ts src/features/transactions/refundReceiptStore.emulator.test.ts
npm --prefix functions run build
npm --prefix functions audit --audit-level=high
```

La CI installa anche le dipendenze backend/client necessarie ai nuovi test di integrazione ed esegue i repository con l’emulatore, oltre alle verifiche già presenti.

## Limiti e vincoli

Nessuna prova su un iPhone fisico né su circuiti bancari esterni. Le modifiche di movimenti esistenti e i rimborsi richiedono rete; i fallimenti conservano la bozza. Nuove creazioni ordinarie ancora accodabili offline. Ricevuta atomica fino a 100 spese; operazioni ordinarie massive per blocchi di 180 documenti, come prima. L’importazione generica non accetta righe rimborso/ricevuta gestite fuori dal repository dedicato.

Wrapped invariato, inclusi i file/stili ereditati; `RefundSheet.tsx` e ordine del modulo movimento invariati. Nessun cambio alle formule del Piano, al rollout UI3 o ai ruoli. La rettifica del focus riguarda il contenitore UI3 dei moduli, non usato da Wrapped.
