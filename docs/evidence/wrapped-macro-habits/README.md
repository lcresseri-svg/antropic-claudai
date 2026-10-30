# Wrapped: macro aree e abitudini — 30 ottobre 2026

Branch `feat/wrapped-macro-habits`, base main `50b0c9550b30a6de3c99e2ab4343f3eb75536b9c`.

Lo [studio del subagente](research.md) ha portato a una sequenza dalle macro alle categorie, alla spesa maggiore e alla voce più frequente. Due storie nuove; quella della frequenza sostituisce il solo conteggio quando ci sono dati sufficienti. Stile, temi, animazioni, timer, gesti, entrate e obiettivo conservati. Nessuna modifica ai calcoli preesistenti, scritture, rollout o permessi.

## Esiti reali

- Frontend: **1.144 test passati in 116 file**, nessuno skipped; [log](unit-tests.log).
- TypeScript e build produzione: **passati**; [log](build.log). Avviso Vite sulle dimensioni dei bundle già presente.
- Nuove storie: **20 scenari browser passati, zero errori JS**, [risultati](results.json) e [log](browser.log). UI3 chiaro/scuro a 320/390/1440, UI2 chiaro/scuro a 390; sei casi aggiuntivi nei due temi a 320 (nomi lunghi con spazi, macro da 80 caratteri senza spazi, macro eliminate, descrizioni anonime, programmati, serie con descrizioni differenti).
- Regressione entrate: **22 scenari passati, zero errori JS**, [risultati](regression/income-results.json). Crescita, calo, parità, assenza/storico parziale, solo programmato, crescita più programmato e incassi grandi.
- Regressione shell Wrapped: **4 percorsi completi passati**, UI3 nei due temi a 320/1440, [rapporto](regression/shell-report.json). Compresi contrasto chiaro, pulizia dell'editor, riepilogo, obiettivo e chiusura.
- Revisione indipendente finale: due P2 riprodotti e corretti. Parità monetarie: accumulo in centesimi, regressione che riordina l'input red→green. Macro senza spazi: overflow della storia categoria riprodotto in Chromium (280px disponibili, testo oltre il contenitore), corretto con ritorno a capo e verificato nei due temi. Nessun altro P1/P2 e nessun rilievo lasciato sospeso.

Un primo tentativo della regressione entrate si è interrotto dopo 15 casi a causa del reload globale di Vite durante l'aggiunta dei test. Il log del server ha identificato il reload, non un errore del prodotto. Tutte le verifiche finali sono state rieseguite senza modifiche al sorgente, usando il supporto esistente `SUNNY_PREVIEW_STATIC=1`.

## Inventario dei controlli

| Elemento | Verifica |
| --- | --- |
| Barre di progresso | Numero adattivo, massimo 13 storie, percorso completo in 20 scenari |
| Tocco a destra | Tutte le storie fino al riepilogo |
| Tocco a sinistra | Ritorno macro dalla categoria, UI3 390 chiaro/scuro |
| Pressione prolungata | Pausa oltre 15 secondi senza cambio storia, UI3 390 nei due temi |
| Timer | Ripresa e avanzamento automatico, UI3 390 nei due temi |
| Swipe orizzontale | Avanti e indietro tra macro/categoria, UI3 390 nei due temi |
| X | Uscita e ripristino tema, regressioni entrate e shell |
| Escape | Uscita dall'obiettivo e ripristino tema, 20 scenari |
| Imposta l'obiettivo | Raggiungibile dal riepilogo in tutti i percorsi |
| Pulsanti ±50 € | Aumento e ritorno al valore iniziale, tutti i percorsi |
| Editor precedente | Nessun inert residuo all'apertura di Wrapped, regressione shell |
| Macro e frequenza | Sole viste di lettura; nessun nuovo controllo o salvataggio |

Il salvataggio persistente dell'obiettivo e lo swipe verticale di chiusura non sono stati modificati e non sono stati riprovati in questa estensione. Accesso stagionale/admin coperto dai test esistenti della finestra Wrapped.

## Screenshot principali

- Macro: [scuro 390](ui3-dark-390-rich-macros.png), [chiaro 390](ui3-light-390-rich-macros.png).
- Voce frequente: [scuro](ui3-dark-390-rich-frequent.png), [chiaro](ui3-light-390-rich-frequent.png).
- Categorie e spesa maggiore: [categoria](ui3-light-390-rich-categories.png), [spesa](ui3-light-390-rich-largest.png).
- [Riepilogo](ui3-light-390-rich-summary.png), [macro senza spazi a 320](ui3-light-320-unbroken-macros.png), [caso programmato](ui3-dark-320-planned-macros.png).

Prove Chromium con dati sintetici nella preview dedicata. Nessun accesso a conti privati e nessuna prova su iPhone/Safari fisico. Le assegnazioni macro sono quelle attuali, esplicitato in UI. La frequenza confronta serie oppure descrizioni esatte nella stessa categoria: non riconosce negozi, visite o abbonamenti.
