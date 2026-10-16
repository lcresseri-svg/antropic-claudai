# Coerenza di spazi, caratteri e densità UI3

Richiesta: rendere Sunny coerente con le convenzioni di una app mobile anche nelle impostazioni e nei modali. Conservare identità, bianco/nero, divisori orizzontali, azioni e informazioni progressive. Wrapped, formule, ordine del movimento e resolver esclusi dalle modifiche.

Scala comune: corpo 16 px, testo secondario 14 px, metadati 13 px, sezioni 17 px, titoli 22 px, intestazioni dialoghi 18 px. Spazi di sezione 20 px, righe 10–12 px per lato verticale, controlli almeno 44 px, dialoghi con raggio 24 px. Il saldo resta dominante ma le cifre delle statistiche sono subordinate. Importo dell'editor mantiene la scala numerica originale.

CSS dedicato e opt-in sui contenitori liquid UI; nessuna nuova dipendenza. Classi semantiche per etichette e sottotitoli delle impostazioni e griglia icone. Griglia adattiva per garantire touch target senza overflow; testo normale dei campi a 16 px per evitare zoom iOS. Scorrimento, viewport tastiera, scarto e focus preservati.

## Verifica e copertura

- 19 rotte × 2 temi × 3 larghezze (390/834/1440): 114 viste, nessun errore JS o overflow. Inventario dei controlli visibili in `evidence/consistent-density/routes.json`.
- 23 suite funzionali passate: scarto/focus, azioni collettive, grafici, importazione, dettagli, impostazioni, onboarding, editor, errori di salvataggio, tastierino, backdrop, accessibilità, stampa e Piano. Log individuali nella cartella `functional/`.
- 8 verifiche di densità (320/390/834/1440 × chiaro/scuro): righe categoria 65,6 px, sottotitoli almeno 13 px, campi almeno 16 px, icone almeno 44 px, nessun overflow del modale conto.
- 32 scenari a 320 px e testo al 200%, dati vuoti e categorie estreme: passati. La prova ha rilevato due intestazioni rigide in Patrimonio; sono state rese adattive e la matrice estrema ripetuta con successo. Ricontrollate anche Patrimonio e Investimenti alle tre larghezze normali.
- 4 scenari tastiera/visualViewport e 8 safe area passati; nessuna modifica alla gestione di focus o scarto.
- Wrapped: screenshot mobile chiaro/scuro identici byte per byte al commit di partenza. Nessuna modifica al suo codice o ai token ereditati.
- Inventario sorgente: 591 dichiarazioni di controlli, incluse quelle generate.

Le prove sono eseguite nella preview con dati sintetici e Chromium. Tastiera e safe area sono simulate: nessuna verifica su iPhone fisico. Screenshot rappresentativi inclusi nell'evidenza; matrice completa prodotta in `/workspace/density-final-routes`.

Build/TypeScript passati. Suite unitaria: 839 test passati, 5 saltati (70 file passati, uno saltato).

UI2: 12 screenshot (home, patrimonio, Piano, movimenti, impostazioni, impegni × due temi) identici pixel per pixel alla baseline precedente. Dettagli in `ui2-comparison.json`.

## Liste aperte anche per le schede cliccabili

Le regole precedenti aprivano le sezioni `div/section/article` ma lasciavano i `button.glass-card` rettangolari. Posizioni investimento, conti, ripartizione del patrimonio e apertura operazioni ora usano la classe esplicita `ui-open-row`: fondo trasparente, niente ombra o angoli arrotondati, un divisore superiore, margini laterali allineati al contenuto. Le barre delle righe sono alte 4 px, i nomi lunghi possono andare a capo. Pulsanti d'azione, campi, avvisi e superfici dei modali mantengono la propria forma.

`liquid-open-rows.mjs` falliva sul vecchio raggio di 22 px; dopo la correzione passano 18 viste (3 rotte × 2 temi × 3 larghezze), con verifica dei divisori, assenza di bordi laterali/ombre/sfondi, assenza di overflow e apertura/chiusura del dettaglio investimento. Evidenza in `evidence/open-rows/`.

## Estensione a tutte le pagine e menu Altro

Controllo sorgente e inventario delle superfici su 18 rotte ordinarie: home, patrimonio, Piano, movimenti, investimenti, entrate, spese per categoria, saldo per conto, storico patrimonio, impostazioni, consigli, AI Coach, patrimonio avanzato, impegni, piano mensile, forecast, metriche e recap. Wrapped resta escluso dalle modifiche.

Sono stati uniformati anche il carosello e le righe dei consigli, le sezioni `bg-card` delle analisi avanzate, i confronti degli scenari e i riquadri statistici interni ai dettagli. Le righe movimento mantengono selezione e divisori senza sfondi arrotondati. L'inventario runtime conserva soltanto due avvisi distinti: controvalori non aggiornati e concentrazione delle entrate; campi, pulsanti, badge e contenitori dei modali mantengono la forma funzionale.

Rimosso il duplicato Altro dalla barra laterale UI3 e le relative regole CSS. Il menu superiore rimane l'unico accesso Altro, verificato a 390/834/1024/1440 px nei due temi, con apertura del menu e navigazione a Impostazioni. Inventario sorgente aggiornato: 590 dichiarazioni di controlli.

Verifica finale dell'estensione: 114 viste, 23 suite funzionali, 32 casi stress generali, 6 viste estreme di investimenti/conti/patrimonio a 320 px e testo 200%, 18 viste delle righe, 8 casi menu Altro, 4 tastiera e 8 safe area passati. Build/TypeScript e 839 test unitari passati (5 skipped). La leggenda investimenti e l'avviso controvalori ora vanno a capo senza overflow. I gruppi di movimenti programmati mantengono un divisore tratteggiato, senza riquadro; ricontrollati selezione multipla e Movimenti alle tre larghezze.

Confronto finale UI2: 9/12 immagini identiche; le altre 3 differiscono per 18–40 pixel nelle aree di rasterizzazione delle icone, senza spostamenti di layout. Wrapped mobile identico byte per byte in entrambi i temi. Rimane il limite delle prove Chromium: tastiera e safe area simulate, nessun iPhone fisico.

### Storico nel dettaglio di un fondo — 15 ottobre 2026

Il raggruppamento mensile del dettaglio poteva comprimere tutti i movimenti
registrati nello stesso mese in un solo punto. In UI3 il dettaglio ora apre
**Tutto** lo storico disponibile, con selettore **6 mesi / 1 anno / Tutto**.
La curva mantiene le date reali, le distanze temporali e il saldo di fine
giornata; i salti rappresentano versamenti e disinvestimenti. Nessun dato
precedente alla prima data nota viene inventato. La data iniziale è esplicita;
un solo giorno o una storia priva di data hanno messaggi dedicati.
Il capitale iniziale viene riportato correttamente all'inizio delle finestre
più brevi. Il controvalore storico resta escluso perché non disponibile.
La tabella espone tutte le date rappresentate, senza diradare i movimenti.
UI2 conserva il grafico precedente; nessun cambiamento a formule o Wrapped.

Verifica dedicata: build/TypeScript passati; 29 test su performance e finestre
storiche passati; 12 viste browser (320/390/1440 px, chiaro/scuro,
storico pluriennale e confinato allo stesso mese) passate, compresi selettore
da tastiera, invarianza del saldo finale, Escape e assenza di overflow.
Evidenza in `evidence/fund-history/`. Test su Chromium, non Safari fisico.
Anche la suite dettagli è passata nei due temi: apertura dei sottomodali di
versamento/disinvestimento/controvalore, ritorno al fondo, errori di salvataggio
e conservazione della bozza; controlli delle altre sezioni impostazioni inclusi.
Nuovi controlli del grafico: tre pulsanti periodo (stato `aria-pressed`),
riepilogo espandibile “Vedi dati · Capitale versato”; tutti dentro il focus trap
esistente del dettaglio.
