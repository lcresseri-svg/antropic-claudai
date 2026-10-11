# Piano — risultato implementazione
Data consegna: 11 ottobre 2026.

## Ambito
Nuovo Piano nella UI attuale, **indipendente da UI3**, secondo l'override esplicito dell'utente. Resolver UI3, gate enableBudget/AI, permessi e altre schermate invariati. Nessuna migrazione o cancellazione: investmentBudgets legacy e archivio sperimentale monthlyPlans restano separati e intatti. Nessun accesso a dati di produzione, merge su main o deploy.

Branch: `lcresseri-svg/antropic-claudai/piano-redesign`.
Base: specifica `9bba5cd`, figlia della main `3fd321c` (ancora origin/main alla verifica finale).
Commit di implementazione: `5836f66` calcoli; `02ac298` persistenza; `d2e0609` editor; `818783f` pagina. La chiusura aggiunge correzioni della revisione, test e queste prove.

## Cosa cambia
- Margine mensile principale con dettaglio del calcolo, obiettivi cash distinti dagli apporti esterni, categorie e programmati inclusi senza duplicazioni.
- Configurazione in tre passi e modifica contestuale: importi italiani, zeri espliciti, anteprima, confronto completo prima/dopo, copia mese e spostamento dei limiti.
- Bozze locali separate per utente/mese; conferma server esplicita, controllo revisione e gestione dei conflitti. Durante il salvataggio i controlli sono disabilitati.
- Storico e mesi futuri separati dal corrente; stima V4 solo sul mese corrente con storico sufficiente. Tutte le ricorrenze del mese alimentano la stima.
- Dati mancanti restano da impostare; nessun importo dimostrativo nel percorso di produzione.

## Formule e casi di accettazione
Calcoli in centesimi. E=2400, S=400, It=200, Ia+Ic=200, A=900, C=350:
Ir=max(200,200)=200; P=E-S-Ir=1800; M=P-A-C=550.
Con limiti complessivi 1700 e impegni coperti, U=100.
Forecast totale 1600 confrontato direttamente con P: scostamento 200, non A+C+1600.

| Casi della specifica | Verifica |
| --- | --- |
| 1–6 | Selettori: formule, cuscinetto, senza limite, sforamento, investimento effettivo superiore al target, TFR/apporti esterni. Fixture browser M550/U100. |
| 7–12 | Ricorrenza annuale alla scadenza, dedup serie/data, storni ricevuti/futuri e mese precedente, trasferimenti neutrali, forecast senza doppio conteggio. Regressioni settimanali/giornaliere V4. |
| 13–15 | Non revisionato vs zero, negativo, cancellazione input/annullamento, errore visibile con bozza conservata; test store offline prima della transazione. |
| 16–18 | Store reale nell'emulatore: futuro non aggiorna mirror; browser cambio mese a PWA aperta e isolamento utente; rollover di snapshot esistente aggiorna mirror. |
| 19–22 | Categorie archiviate/sconosciute, trasferimento esatto di 50, salvataggio atomico e writer legacy, modifica storico senza contaminazione del corrente. |
| 23 | Sostituito dall'override utente: nuovo Piano in UI corrente e pilot, senza abilitare UI3 o nuovi accessi admin. |
| 24–28 | Rules proprietà/payload, nessun fallback demo, forecast senza autosalvataggio, conflitto esplicito, date locali/mezzanotte/DST in UTC e Roma. |

File principali: `monthlyPlanSelectors.ts`, `useMonthlyPlan.ts`, `monthlyBudgetStore.ts`, `useBudget.ts`, `planDraft.ts`, `PlanEditor.tsx`, `PlanScreen.tsx`, `plan.css` e `firestore.rules`.

## Verifiche eseguite
- TypeScript: superato.
- Build frontend: superata.
- Suite frontend UTC: **815 superati, 5 saltati**, 820 totali.
- Suite frontend Europe/Rome: **813 superati, 2 falliti, 5 saltati**.
- I due fallimenti Roma sono già riprodotti sulla baseline prima delle modifiche: `forecastBehaviorV3.test.ts` (M9b, decomposizione) e `recapExport.test.ts` (data di generazione). Non modificati da questa PR; non si dichiara verde la suite Roma.
- Firestore emulator locale: **44 test superati**, incluso il repository transazionale di produzione importato nei test, conflitti, inizializzazione parziale, rollover, snapshot/mirror e rifiuto server senza scrittura parziale.
- Browser Edge/Playwright isolato da Firebase: `piano.mjs`, `piano-acceptance.mjs`, `piano-review.mjs` superati. Viewport 390/768/1440, chiaro/scuro, no overflow, tastiera/focus, testo lungo/ingrandito, reduced motion, annulla/salva/errore/conflitto/zero/deficit/copia/trasferimento/cambio utente e mese.
- Regressione browser esistente `regressions.mjs budget`: superata.
- Revisione indipendente dell'intero branch: cinque problemi importanti riprodotti e corretti con regressioni RED/GREEN (ricorrenze V4, onboarding parziale, rollover mirror, input durante save, bozza conservata nel trasferimento). Confronti copia/conflitto completati.

### Riproduzione
Frontend, dalla cartella `sunny`: `npx tsc --noEmit`, `npm test`, `npm run build`.
Ripetere `npm test` con variabile TZ impostata a UTC e Europe/Rome.
Rules: runner `scripts/test-piano-rules.ps1` con parametri NodePath, FirebaseCliPath (v13) e JavaBin (v17), progetto demo locale. Nessun collegamento a produzione.
Browser: avviare `node node_modules/vite/bin/vite.js --config ui-preview/vite.config.mjs`, impostare SUNNY_NODE_PACKAGES alla cartella contenente Playwright e lanciare i tre script sopra. Edge richiesto.
Ambiente locale verificato: Node24.19.0, npm12.2.0, Vitest frontend4.1.7, Rules4.1.11; CI conserva le versioni del repository.

## Screenshot
Tutti con fixture sintetiche e componenti reali, mai con dati degli account.
- [Desktop scuro](piano-evidence/piano-1440-dark.png) · [Desktop chiaro](piano-evidence/piano-1440-light.png)
- [Mobile scuro](piano-evidence/piano-390-dark.png) · [Mobile chiaro](piano-evidence/piano-390-light.png)
- [Tablet scuro](piano-evidence/piano-768-dark.png) · [Tablet chiaro](piano-evidence/piano-768-light.png)
- [Formula 550 / 100](piano-evidence/piano-formula.png)
- [Primo piano](piano-evidence/piano-first-plan.png) · [Disavanzo](piano-evidence/piano-deficit.png)
- [Conflitto](piano-evidence/piano-conflict.png) · [Errore salvataggio](piano-evidence/piano-save-error.png)
- [Archiviati e testo lungo](piano-evidence/piano-archived-long-text.png)

## Limiti dichiarati
- Suggerimento ricorrente entrate: propone solo le occorrenze ancora da incassare, etichettate esplicitamente; resta disponibile il suggerimento dallo storico. Non è una ricostruzione completa degli incassi ricorrenti già ricevuti.
- Rules: massimo 50 categorie di obiettivi cash e importi fino a 1 miliardo, validati senza allargare i permessi. Nessuna riscrittura degli importi storici.
- Nessuna certificazione Safari/dispositivi fisici/screen reader. Browser con fixture e persistenza reale nell'emulatore sono prove distinte, non una sessione end-to-end su Firebase produzione.
- Il test offline client verifica il rifiuto prima dell'invio; il test Rules verifica un rifiuto server reale. Non si dichiara verificata una perdita di rete durante una transazione di produzione.
- I workflow della PR eseguono controlli; gli step di deploy esistenti sono condizionati al push su main. Non attivati.

