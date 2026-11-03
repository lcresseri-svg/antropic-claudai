# Wrapped: stile uniforme e tono umano

Richiesta: uniformare le nuove storie alle altre e aggiungere un tono positivo e ironico.

Intervento limitato alla presentazione: stesso titolo di dettaglio da 34px per macro, categoria e voce frequente; spaziature delle bande coerenti con le grafiche esistenti; conteggio della frequenza senza ripetizione, totale e media separati dalle spiegazioni. Nessuna formula o metrica modificata.

Esempi di tono:
- Macro: «I soldi non sono spariti. Si erano solo divisi i compiti.»
- Senza macro: «Anche i soldi senza etichetta hanno una storia. La loro è ancora un po’ misteriosa.»
- Categoria: «Ha vinto lei. Il premio, però, è a carico tuo.»
- Frequenza: «La costanza non ti manca. Anche il conto se n’è accorto.»
- Spesa maggiore avvenuta: «Una spesa da ricordare. Il conto, di sicuro, non se la dimentica.»
- Spesa maggiore futura: «Il conto si sta preparando. Almeno questa non arriva a sorpresa.»

Le storie delle entrate e i loro confronti positivi rimangono invariati.

## Verifiche

- **1.144 test frontend passati in 116 file** e build produzione/TypeScript passati; log nella cartella. **32 scenari browser passati** (14 standard, 14 bassi, 4 regressioni shell). Zero errori JS nelle due matrici che li rilevano.
- Matrice a 844px di altezza: 14 scenari, UI3 nei due temi a 320/390/1440, UI2 nei due temi a 390, casi aggiuntivi con nomi lunghi, macro da 80 caratteri senza spazi e spese programmate. Risultati in results.json.
- Stessa matrice a soli 568px di altezza: altri 14 scenari in short/results.json. Ogni storia verifica inizio visibile, assenza di overflow orizzontale e ripartenza dall’inizio dopo avere scorso la precedente fino in fondo.
- Regressione shell: quattro percorsi completi a 320/1440 nei due temi, contrasto, riepilogo, obiettivo, pulsanti ±, X e ripristino tema. Rapporto in regression/shell-report.json.
- Inventario completo dei controlli e della logica delle nuove storie nella [verifica precedente](../wrapped-macro-habits/README.md); questi percorsi riprovano tap, swipe, pausa, avanzamento automatico, riepilogo, obiettivo ed Escape.

La prova a 320×568 ha riprodotto un difetto reale della centratura: intestazione a y −119 dentro un contenitore che iniziava a y 62,5. Tolta la centratura forzata del contenitore scorrevole; i margini automatici delle storie centrano soltanto quando rimane spazio. Il contenitore è ricreato al cambio storia, così non eredita lo scroll della precedente. Log red/green e screenshot dell’inizio raggiungibile nella cartella.

Revisione indipendente prima del merge: corretta la frase della categoria che suggeriva un pagamento già avvenuto; il testo definitivo è valido anche per spese programmate. Nessun altro rilievo concreto su layout, scorrimento, timer o calcoli.

Prove Chromium e dati sintetici, nessuna lettura di account privati e nessuna prova su Safari/iPhone fisico. Nessuna dipendenza, nuova scrittura, modifica a rollout, permessi, versione o obiettivo.
