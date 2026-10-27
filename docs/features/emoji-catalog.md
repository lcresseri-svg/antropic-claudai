# Catalogo emoji e palette condivisa

## Utilizzo

In Impostazioni → Gestione l’amministratore trova Catalogo emoji (admin). La pagina mostra tutte le 262 scelte incluse in Sunny e le aggiunte globali. Il campo Nuova emoji accetta una singola emoji nativa, anche con carnagione, simboli combinati, bandiera o keycap. Aggiungi emoji conferma la pubblicazione soltanto dopo il salvataggio; in caso di errore conserva il testo.

Le aggiunte compaiono nei selettori condivisi di conti, categorie e macrocategorie per tutti gli utenti autenticati. La voce di gestione non compare agli utenti normali e il collegamento diretto non consente loro di aprirla. Non sono previsti upload di immagini, modifiche o eliminazioni del catalogo.

La selezione iniziale rimane compatta, con Mostra altre icone e Mostra meno. Selezionando una voce estesa l’elenco si richiude e il focus torna al comando. La palette comprende 56 colori, inclusi i 15 già disponibili, ordinati per famiglie cromatiche e tonalità vicine. Mostra altri colori / Mostra meno colori la espande o richiude; il colore scelto resta visibile anche nella vista compatta.

## Persistenza e permessi

- Le scelte incluse nel codice non vengono copiate nel database; ogni nuova aggiunta è un documento `emojiCatalog/{id}` con `emoji` e `createdAt` server.
- L’id deriva dai codepoint della chiave normalizzata NFC senza variation selector FE0F. Le carnagioni restano distinte. Una transazione impedisce doppioni, anche da due inserimenti simultanei o varianti di presentazione.
- Le regole consentono lettura agli utenti autenticati e creazione soltanto all’identità admin esistente, verificando campi, dimensione e timestamp. Update/delete sono negati anche all’admin. Gli altri percorsi e permessi restano invariati.
- La validazione Unicode del modulo rifiuta testo, più emoji e combinazioni ZWJ arbitrarie. Le nuove ZWJ richiedono riconoscimento RGI; se il browser non lo supporta si richiede un aggiornamento per inserirle. Il consumo del catalogo remoto conserva invece le aggiunte valide anche su questi browser.
- Un listener è posseduto dall’app autenticata e chiuso al cambio account. Durante errori o caricamento le scelte integrate restano utilizzabili. La pagina admin disabilita l’inserimento fino al caricamento e offre Riprova.
- Nessuna modifica a categorie già salvate, formule, movimenti, Wrapped o rollout UI3; nessuna dipendenza aggiunta.

## Verifica

[Evidenze del catalogo admin](../evidence/emoji-catalog/) e [palette ampliata](../evidence/definition-pickers/). Browser Chromium con fixture locali; autorizzazioni, concorrenza e ricezione degli aggiornamenti verificate anche con il repository reale contro l’emulatore Firestore. Non sono stati letti dati privati né aggiunte emoji al catalogo live durante le prove.
