# Catalogo emoji globale

L’amministratore vuole consultare tutte le emoji e inserirne di nuove da una voce di menu. Ha scelto esplicitamente che le aggiunte siano disponibili a tutti. La selezione ampliata di emoji e colori già preparata rimane parte della stessa PR.

Scelta implementativa: Impostazioni → Gestione → Catalogo emoji (admin), elenco delle emoji incluse e aggiunte, campo per incollare una singola emoji Unicode e comando Aggiungi. Nessun upload di immagini, modifica o eliminazione richiesti. Varianti di carnagione, combinazioni ZWJ, bandiere e tasti numerici supportati. Il form conserva il testo in caso di errore e informa del successo soltanto dopo la conferma del database.

Le aggiunte sono documenti nella nuova collection Firestore emojiCatalog. Gli utenti autenticati leggono il catalogo; soltanto l’identità admin esistente può creare documenti. Nessun client può modificarli o eliminarli. Una chiave deterministica e una transazione impediscono doppioni anche tra inserimenti concorrenti. La validazione del client rifiuta testo e più emoji; le regole limitano autore, campi, dimensione e timestamp.

Un provider dell’app autenticata distribuisce le aggiunte ai selettori condivisi di conti, categorie e macro. La lista integrata resta sempre disponibile durante caricamento o errore. Il menu admin espone caricamento, errore e riprova; non consente inserimenti prima del caricamento. Un utente normale non vede la voce e il collegamento diretto torna alle Impostazioni.

Alternative: preferenze personali non soddisfano la scelta globale; una modifica del codice per ogni emoji non soddisfa l’inserimento dal menu. I documenti separati sono preferiti a un unico array per evitare sovrascritture concorrenti e mantenere operazioni minime. Nessuna dipendenza nuova, modifica a Wrapped, formule, dati finanziari o rollout UI3.

Per le sequenze composte la creazione verifica il riconoscimento Unicode RGI. Sui browser che non lo supportano, le nuove ZWJ richiedono un aggiornamento; il consumo delle aggiunte remote mantiene invece le emoji disponibili senza imporre questo requisito di creazione.
