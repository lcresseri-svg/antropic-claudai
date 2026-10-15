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
