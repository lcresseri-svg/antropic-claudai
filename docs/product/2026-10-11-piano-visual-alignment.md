# Piano — riallineamento visivo a Sunny

Richiesta: correggere l'aspetto del nuovo Piano per integrarlo con il resto dell'app, senza riprogettare UI3 o cambiare calcoli, dati e salvataggi. Base: main 1375ad2. Branch: lcresseri-svg/antropic-claudai/piano-visual-alignment. Autorizzazione successiva esplicita: aggiungere il previsto per categoria, quindi PR, merge su main e pubblicazione.

## Cambiamenti

- Stesse classi condivise della Dashboard: hero-card, glass-card, shadow-elev-1/2, balance-num, label-caps, cta-gold-fill.
- Gerarchia compatta: margine principale, tre valori di riepilogo, obiettivi come righe con icona/importo/chevron. Spiegazioni degli obiettivi in un dettaglio espandibile; avvisi sugli incassi sempre visibili.
- Categorie con indicatore di speso e programmato; residuo e stato testuali restano leggibili anche senza colore.
- Pulsanti riconoscibili, mese in controllo compatto, filtri a segmenti.
- Finestra nativa con superficie elevata Sunny, in basso su mobile e centrata su desktop. Focus/Escape e conferma scarto preservati; riuso del blocco scroll condiviso.

Nessuna modifica alle formule finanziarie, repository di persistenza, Rules, Functions, permessi o resolver UI3. Il selettore include ora anche categorie con forecast positivo e senza spese/limiti nel mese: non riserva il previsto nel margine o nel cuscinetto. Dati usati nell'anteprima sintetici, isolati da Firebase.

## Verifica

- Baseline frontend UTC: 815 test superati, 5 saltati. Risultato con previsto per categoria: 819 superati, 5 saltati.
- TypeScript e build superati.
- Browser: piano.mjs, piano-acceptance.mjs, piano-review.mjs, regressions.mjs budget superati.
- Nuovo piano-style.mjs: differenza della hero rispetto alla Dashboard riprodotta prima della modifica; ora confronto delle superfici nei due temi superato. Verifica no overflow a 390/768/1440, posizione sheet mobile, blocco/ripristino scroll e focus.
- Screenshot ispezionati per pagina mobile/desktop, categorie ed editor. Non è una certificazione Safari o screen reader reali.
- Revisione indipendente: corretti due difetti riprodotti con test RED/GREEN, importi spezzati nel layout tablet e pulsanti parzialmente tagliati nel footer mobile. Layout a una colonna fino a 1023px; footer sempre entro l'area visibile. Verificati anche i limiti dei pulsanti a fine scorrimento.
- Le due anomalie dei test preesistenti nel fuso Europe/Rome, documentate nella consegna precedente, non sono oggetto di questa modifica visiva; nessun codice temporale è cambiato.

## Anteprime

- [Desktop scuro](piano-style-evidence/piano-1440-dark.png) / [chiaro](piano-style-evidence/piano-1440-light.png)
- [Telefono scuro](piano-style-evidence/piano-390-dark.png) / [chiaro](piano-style-evidence/piano-390-light.png)
- [Categorie](piano-style-evidence/categories-dark.png)
- [Editor scuro](piano-style-evidence/editor-dark.png) / [chiaro](piano-style-evidence/editor-light.png)
- [Dashboard di riferimento](piano-style-evidence/home-dark.png)

Per provare: server locale ui-preview già previsto dal repository, entry /ui-preview/index.html?pianoCase&theme=dark, poi scheda Piano. Le modifiche in anteprima restano simulate e non modificano il database.

## Previsto per categoria

- Il totale V4 già utilizzato dal Piano è visibile nella lista e nel dettaglio, con eventuale importo oltre il limite. Include già speso e programmato, senza sommarli nuovamente.
- Solo mese corrente con storico sufficiente (gate esistente di tre mesi precedenti). Nei mesi futuri compare indisponibilità, nei mesi passati rimane il consuntivo. Zero esplicito e stima mancante restano distinti.
- Incluse anche categorie presenti solo nel forecast positivo; nessuna categoria vuota aggiunta per soli zeri.
- RED/GREEN: selettore falliva per categoria prevista assente; browser falliva per stima mancante non esposta. Test reali passati dopo l'implementazione.
- Il primo scenario di sforamento usava spese storiche al giorno 5: il motore stima il residuo dopo il giorno corrente (10), quindi correttamente non le proiettava. Fixture corretta al giorno 25, senza modificare il motore. Caso verificato: 900 speso + 250 programmato + 1600 residuo = 2750 previsto, 1550 oltre limite 1200; categoria solo storica 75; margine invariato 550.
- Browser `piano-category-forecast.mjs`: due temi, 390/768/1440, lista/dettaglio coerenti, assenza storico, mesi passati/futuri, zero scritture. Screenshot `forecast-*` nella cartella evidenze.
- Revisione delegata della nuova aggiunta non disponibile per limite di utilizzo; controllo diretto del diff e verifiche automatiche completati. Resta valida la precedente revisione indipendente dello stile. Nessuna dichiarazione di nuova revisione indipendente completata.
