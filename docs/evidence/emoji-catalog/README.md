# Catalogo emoji globale — esiti reali

27 ottobre 2026. Gestione in Impostazioni → Gestione → Catalogo emoji (admin), aggiunte disponibili a tutti gli utenti autenticati. Vedi [funzionamento e permessi](../../features/emoji-catalog.md).

- Prima della modifica il browser falliva perché mancava la voce admin (`before.log`).
- **Build e TypeScript passati**. Suite frontend: **1017 passati, 5 skipped**, zero fallimenti.
- **50 test Firestore passati** contro emulatore locale, inclusi sei nuovi test di catalogo. Verificati lettura autenticata, rifiuto anonimi, creazione soltanto admin, schema/timestamp, update/delete negati, due inserimenti concorrenti con variation selector → un solo documento, listener di un utente normale che riceve l’aggiunta admin. Repository di produzione con database emulato, nessuna chiamata live.
- **12 combinazioni browser** UI2/UI3 × chiaro/scuro × 320/390/1440 px: voce admin, ritorno a Gestione, validazione e duplicati, aggiunta e conferma reale della fixture, focus dopo successo, cambio account, voce nascosta e collegamento diretto bloccato per utente normale, nuova emoji selezionata e salvata da utente normale nel modulo macro. Nessun errore JS, overflow o scrittura di movimenti.
- Tre stati aggiuntivi: scrittura fallita con testo conservato; lettura fallita con emoji integrate disponibili e Riprova funzionante; caricamento lento con inserimento disabilitato.
- Due prove nei temi chiaro/scuro simulano un browser senza flag Unicode v: un utente normale riceve e salva la ZWJ globale 👩🏽‍🚀. Il dominio verifica anche l’assenza di crash, la validazione della creazione e le varianti di presentazione/carnagione.
- Regressione dei nuovi selettori: quattro combinazioni UI2/UI3 × temi a 390 px, salvataggio/rilettura, espansione e focus passati. La prima matrice completa dei selettori è in [definition-pickers](../definition-pickers/).
- Revisione indipendente: corretti sia l’accettazione di combinazioni ZWJ arbitrarie sia il loro consumo sui browser meno recenti; nessun rilievo residuo.

Script riproducibile: `sunny/ui-preview/liquid-emoji-catalog.mjs`, incluso nel runner delle suite. Screenshot selezionati a 390 px. Chromium con fixture illustrative e richieste esterne bloccate; nessuna prova su Safari/iPhone fisico e nessun accesso a dati privati. Nessuna aggiunta effettuata nel catalogo live durante le prove.
