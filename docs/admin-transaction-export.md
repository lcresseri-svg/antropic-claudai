# Esportazione transazioni admin per recupero

Sorgente `prima-aggiornamento-ricorrenti`, destinazione prevista `(default)`, progetto `sunny-a2a98`, UID `qPtCOJGRrwOZ2EfjxMHwW6ZISXX2`.

Lo script `scripts/export-admin-recovery.mjs` è esclusivamente di lettura. Richiede Node >=18 e gcloud autenticato, disponibili in Google Cloud Shell. Non richiede pacchetti npm, chiavi di servizio o modifiche alle regole Firestore.

1. Aprire https://console.cloud.google.com/?project=sunny-a2a98 e attivare Cloud Shell.
2. Caricare `export-admin-recovery.mjs` nella cartella corrente (menu del terminale → carica file).
3. Eseguire `node export-admin-recovery.mjs` e autorizzare Cloud Shell se richiesto.

Crea una cartella privata con:

- `default-prima-del-recupero.json`: tutte le transazioni attuali del solo UID admin, salvate prima di leggere il clone.
- `ripristinato-transazioni.json`: tutte le transazioni del clone per lo stesso UID.
- `confronto.json`: documenti diversi, mancanti nel live e presenti solo nel live; indicatori per regole, investimenti, rimborsi e addebiti carta.
- `riepilogo.json`: i conteggi mostrati nel terminale.

I file preservano la rappresentazione REST Firestore, inclusi timestamp, interi e campi annidati. Sono copie delle sole transazioni, non un backup completo dell'account o delle impostazioni. Le letture paginate non bloccano l'app: i campi `updateTime` consentono di verificare successivamente se i documenti sono cambiati. Un eventuale errore interrompe l'esportazione; una cartella già esistente non viene sovrascritta.

Il risultato serve a preparare il piano d'importazione con gli stessi ID. Non usare il JSON come CSV nell'app. Il trasferimento richiede riconciliare investimenti e rimborsi quando presenti e avanzare le vecchie regole ricorrenti alla scadenza corretta per evitare la rigenerazione dello storico. I movimenti presenti solo nel live devono essere valutati esplicitamente prima di un'eventuale cancellazione.

Inviare inizialmente solo il riepilogo testuale. Non condividere token di accesso o chiavi. Non è stata effettuata alcuna lettura o scrittura sui database reali in questa sessione: l'ambiente non ha accesso Firebase autenticato.

Verifica locale: `node --test scripts/export-admin-recovery.test.mjs` — 6 test passati, compresa esecuzione CLI con API simulate, paginazione, isolamento UID e verifica della copia live prima del recupero.
