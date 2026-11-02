# Dettaglio e modifica della singola occorrenza

Problema: SeriesDetailSheet usava importo, descrizione e categoria del template per il riepilogo principale anche quando l'utente apriva un movimento storico. Un'occorrenza ripristinata o modificata appariva ancora con l'importo della regola. Inoltre il dettaglio conservava l'oggetto anchor precedente in caso di nuovi snapshot.

Correzione: risolve l'occorrenza sullo snapshot corrente, mostra il suo importo/data/descrizione/categoria, mantiene l'importo della regola in una riga esplicita e gli equivalenti della serie separati. I pulsanti operano sulla versione corrente del documento. La logica finanziaria e di salvataggio non cambia.

Esiti reali su dati sintetici:

- 2 regressioni del dettaglio fallite prima della correzione; 4 passate dopo.
- 1.167 test frontend passati in 117 file; TypeScript/build produzione passati.
- 10 test su emulatore Firestore, incluso salvataggio reale tramite replaceTransactionSynced di un'occorrenza con serie conclusa: 0,74 → 1,24, regola e sorella immutate.
- 8 scenari Chromium: UI2/UI3, chiaro/scuro, 390/1440 px. Il browser usa il gestore reale useTransactionEditing e il modulo reale con persistenza sintetica in memoria: apre il dettaglio a 1,24, modifica la singola occorrenza a 7,50, riapre e verifica 7,50. La sorella resta 234,33 e il template 0,74 con termine 30 ottobre. Zero errori JavaScript.

Le prove non accedono ai dati reali dell'utente. Il database live e l'esito del recupero manuale restano verificabili solo dall'ambiente autenticato dell'utente. Lo script di recupero esegue un commit atomico dei due importi, quindi la sola visualizzazione del dettaglio non prova un recupero parziale.
