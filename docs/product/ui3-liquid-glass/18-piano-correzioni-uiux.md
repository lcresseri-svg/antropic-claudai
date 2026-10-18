# Correzioni UI/UX Sunny — Implementation Plan

> For agentic workers: esecuzione diretta con `superpowers:executing-plans`, una correzione verificabile alla volta.

**Goal:** applicare lo studio UI/UX Pro Max alla UI3 conservando identità e funzioni di Sunny.
**Architecture:** componenti semantici per periodi e importi, token opt-in per il contrasto; area interattiva separata dalle barre del grafico; chiusura comune dei filtri con ritorno del focus.
**Tech Stack:** React 18, TypeScript, Tailwind, CSS, preview Playwright/Chromium.
**Spec:** [Studio approvato](17-studio-uiux-pro-max.md).

## Global Constraints
- Wrapped completamente intoccato, anche per gli stili ereditati.
- Formule del Piano, ordine del movimento, permessi e rollout invariati.
- Righe compatte con divisori, bianco/nero netti, oro Sunny.
- Chiaro e scuro verificati separatamente; dati illustrativi della preview.

## Review Focus
- Contrasto su badge e selezioni, non soltanto sullo sfondo della pagina.
- Importi lunghi e tastiera mobile: visibilità, bozza e focus preservati.
- Giorni con valori piccoli o nulli: selezione del grafico possibile senza falsare la barra.
- Escape, backdrop e scelta di un filtro: ritorno al trigger senza scroll.
- Storico lungo, valori non aggiornati e dati mancanti: significato dichiarato senza inventare rendimenti.

## Task 1 — Regressioni e baseline
- [x] Creare `sunny/ui-preview/liquid-ux-polish.mjs`: verificare contrasto selettori/badge, campo importo >=32 px, focus Escape, area grafico e dati invariati.
- [x] Eseguire sulla base e registrare i difetti dello studio; acquisire UI2 e Wrapped per confronto.

## Task 2 — Colori, importi e selettori
- [x] Aggiornare `ui3-liquid.css` e `ui3-density.css`: colori opt-in leggibili su superfici, importo semantico e metadati.
- [x] Creare `shared/components/PeriodSelector.tsx`, usarlo nei due storici investimento; esporre selezione e minimi 44 px.
- [x] Correggere `investments/SheetShell.tsx`: campo importo e placeholder senza ridurre input normali.
- [x] Verificare contrasto >=4,5:1 di testo e selezioni, >=3:1 dei dati grafici; input normale >=16 px.

## Task 3 — Focus e grafici
- [x] In `TransactionList.tsx` centralizzare la chiusura dei filtri e ripristinare il trigger con preventScroll.
- [x] In `AccountBalanceLineChart.tsx` aggiungere selezione del giorno su area ampia, frecce/Home/End e azione esplicita per i movimenti; mantenere le geometrie dei dati.
- [x] In `InvestmentTrendChart.tsx` aggiungere altezza adattiva, valore consultabile con tastiera/tocco e legenda dell'ultimo valore noto.
- [x] Verificare movimento corretto, cronologia, assenza di overflow e focus visibile.

## Task 4 — Dettagli e coerenza
- [x] In `InvestmentsScreen.tsx` esporre la qualità/attualità del controvalore vicino al totale.
- [x] In `InvestmentDetailSheet.tsx` dare priorità al grafico e rendere progressive le metriche secondarie.
- [x] Uniformare metadati e badge di Forecast; icone strutturali vettoriali nelle righe impostazioni, mantenendo emoji personali di conti/categorie.
- [x] Verificare dettagli e gerarchia dei sottomodali, senza variazioni al draft.

## Task 5 — Consegna
- [x] Build, unit test pertinenti, suite funzionali UI3 e matrice responsive/stress nei due temi.
- [x] Confrontare Wrapped/UI2 con baseline; esaminare screenshot e contrasti.
- [x] Salvare risultati reali, screenshot e limiti, poi creare PR con descrizione aggiornata.

## Registro delle decisioni e verifica finale

- Esecuzione diretta delle correzioni già approvate nello studio; revisione indipendente finale richiesta dalla skill executing-plans.
- Il template separato code-reviewer.md non era leggibile dal provider; il revisore ha ricevuto requisiti, vincoli, Review Focus e diff completo.
- I rilievi su Wrapped, continuità del mese selezionato e legenda del calendario sono stati trattati come regressioni da correggere, con prove rosse e verdi. Nessun rilievo lasciato irrisolto.
- Lo stress al 200% ha evidenziato un'ulteriore necessità di reflow delle metriche del Piano; corretta la griglia, mantenendo leggibilità e valori.
- Distinti i token del testo funzionale, del riempimento e delle serie. Verificata separatamente anche la linea tratteggiata del controvalore.
- Esiti e limiti completi in 19-risultati-correzioni-uiux.md.
