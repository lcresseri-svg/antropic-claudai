# Changelog — Sunny

Log condiviso delle modifiche fatte dagli assistenti AI che lavorano su questo
repository (**Claude Code** e **Codex**). Serve a entrambi per vedere cosa è
stato cambiato, quando e perché, senza dover ricostruire tutto dalla cronologia
git.

## Come aggiungere una voce

- Aggiungi le modifiche **in cima**, sotto la data di oggi (formato `AAAA-MM-GG`).
- Crea una nuova sezione data solo se non esiste già.
- Ogni voce: `**[Agente]** descrizione sintetica` + hash del commit tra backtick.
  - Agente = `Claude` oppure `Codex`.
- Registra solo modifiche significative (feature, fix, refactor, UI), non i
  commit di solo formato o WIP.
- Aggiorna questo file **nello stesso commit** della modifica che descrive.

---

## 2026-06-01

- **[Claude]** Schermata Investimenti: l'allocazione per categoria elenca ora **tutte le categorie di investimento**, anche quelle a €0 (mostrate sbiadite), oltre a eventuali categorie con valore non più presenti tra quelle attive. — `(pending)`
- **[Claude]** Dashboard: la statistica **Risparmio** ora mostra un sottotitolo ("dopo €X investiti" / "entrate − uscite − investimenti") e un indicatore **"!"** quando entrate − uscite − investimenti è negativo, per chiarire perché può risultare < 0 anche con entrate > uscite. Spiegazioni insight ulteriormente semplificate (rimossi termini come "regressione lineare", "pendenza", "deviazione standard" in favore di linguaggio comune). — `(pending)`
- **[Claude]** Previsione di fine mese unificata: nuova funzione condivisa `forecastSavings` usata sia dagli Insight sia dai "Consigli Sunny" del budget, così le due viste non si contraddicono più (prima una poteva dire −500 e l'altra +1000). Modalità "Vedi spese" della dashboard ora elenca **tutti i conti, anche a €0**. Spiegazione insight della proiezione riscritta in linguaggio semplice (niente più formule con ÷). Analisi stagionali/trend limitate agli **ultimi ~18 mesi** (le abitudini molto vecchie non sono più rappresentative). — `(pending)`
- **[Claude]** Nuova schermata **Investimenti** (`/investments`) accessibile dalla dashboard (voce "Investito" e card "Investimenti per categoria" cliccabili): totale investito, allocazione per categoria (donut + % + n. operazioni + flag capitale iniziale), versamenti ultimi 6 mesi, elenco operazioni. Impostazioni: layout desktop migliorato (container più largo, menu e Gestione a griglia di tile con sottotitoli, sezioni constrainte per leggibilità). Su desktop la sidebar torna "Sunny" e il saluto "Buon pomeriggio" appare nella dashboard. Spiegazione insight della proiezione di fine mese resa più chiara (formula esplicita delle uscite previste = uscite finora ÷ frazione di mese trascorsa). — `(pending)`
- **[Claude]** Transazioni: aggiunto **ordina per importo** (più alto / più basso) accanto a ordina per data nel pannello filtri. Selettori filtro-tipo e raggruppamento convertiti in **capsule pill** (stile selettore periodo della dashboard). Insight più intelligenti: l'alert "Sforamento" appare solo dopo metà mese e la proiezione di fine mese solo dopo ~il 15% del mese (niente più stime gonfiate da una singola spesa a inizio mese). Nuovo **saldo iniziale per le categorie di investimento** (capitale già investito prima di Sunny): editabile come per i conti, sommato a patrimonio investito e riepilogo per categoria. — `(pending)`
- **[Claude]** Budget più leggibile: nuova card **panoramica del mese** (`BudgetOverview`) con barra impilata Entrate/Spese/Investimenti/Risparmio, spaziatura più ariosa tra le sezioni. Suggerimenti di budget ora **consapevoli della stagionalità** (`suggestBudgets` alza il budget di una categoria al livello storico del mese corrente, es. regali a dicembre) + banner che lo spiega. Nuove funzioni `seasonalMonthlyAverage`/`seasonalHint` con test. — `(pending)`
- **[Claude]** Dashboard ridisegnata: saluto+nome ("Buongiorno, Luca") al posto di "Sunny" nell'header e nella sidebar, rimossa la foto profilo. Navigatore periodo con frecce ‹ › per scorrere i mesi/periodi passati (+ "Oggi" per tornare). Nuova card **FlowBar** (Entrate · Uscite · Investito a confronto), TrendChart ora a 3 linee con l'investito, nuova card **Investimenti per categoria** (donut + percentuali), "Saldo per conto" mostra 3 conti con "Mostra tutti". Gli insight in dashboard sono ora un **banner orizzontale scorrevole** di card compatte (stile telegiornale) che aprono la spiegazione al tap. — `(pending)`
- **[Claude]** Insight v3: ogni insight ha un pulsante "i" che apre un pannello (`InsightDetailSheet`) con spiegazione strutturata (cosa indica · come è calcolato · su quali dati) e un mini-grafico a barre con linea di riferimento. Nuova categoria **Stagionalità**: confronti year-over-year (stesso mese anno scorso) e rilevamento di categorie che storicamente salgono in un dato mese (es. regali a dicembre), con anticipo sul mese successivo. — `(pending)`
- **[Claude]** Insight v2: motore riscritto con 22 analisi raggruppate in 5 categorie (Priorità · Previsione · Tendenze · Abitudini · Questo mese). Nuove analisi: slope lineare spese/risparmio su 6 mesi, tasso investimento sul reddito, proiezione annuale, miglior mese anno, categoria in crescita rapida (3 mesi), weekend vs feriali, giorni senza spese, concentrazione Pareto top-3 categorie, spesa anomala (outlier vs media storica categoria), volatilità mensile (std dev), cash flow efficiency, diversità fonti di reddito. InsightsScreen rinnovata con strip riassuntiva entrate/uscite/risparmio e sezioni per categoria con contatore. — `(pending)`
- **[Claude]** Transazioni: nuovo pannello filtri accanto alla ricerca (ordina per data più/meno recenti + selezione periodo: tutto/ultimo mese/3/6 mesi/anno, con pill rimovibile e chiusura via Esc). Gruppi comprimibili cliccando sull'intestazione (mese, conto o categoria), con chevron, conteggio e pulsante "Comprimi/Espandi tutti". UI dei selettori uniformata: filtro tipo (Tutte/Uscita/Entrata…) e raggruppamento (Per mese/conto/categoria) ora condividono lo stesso stile segmented, con pallino colore per tipo. — `(pending)`
- **[Claude]** Dashboard: rimossa la sezione "Recenti". AccountsCard: il riquadro "Saldo/Spese per conto" non sparisce più passando a "Vedi spese" quando non ci sono spese nel periodo (header e toggle restano, con messaggio vuoto). Transazioni: nuovo raggruppamento "Per categoria" oltre a mese e conto. — `(pending)`
- **[Claude]** Insight potenziati: nuovo motore (`insightsEngine.ts`, con test) che aggiunge previsione di fine mese, previsione entrate e investimenti sulla base della media storica (ultimi 3 mesi attivi), voce di spesa più pesante, spese vs media. Nuovo setting in Generali per includere o no il capitale investito nel patrimonio netto (`includeInvestments`), con calcolo aggiornato. — `(pending)`
- **[Claude]** Aggiunte 60 emoji alla palette categorie: sport (⚽🏊🚴…), natura/montagna (🌲🏔️🌸…), shopping (🏪👠💎…), cibo/ristoranti (🍕🍴🍷…). — `(pending)`
- **[Claude]** Saldo iniziale nascosto per il conto Investimenti (`isInvestment: true`): il campo appare solo per conti correnti, risparmio, carta di credito e contanti. — `(pending)`
- **[Claude]** Fix sicurezza: chiave Firebase rimossa dal codice sorgente e spostata in variabili d'ambiente Vite (`VITE_FIREBASE_*`). `sunny/.env.local` gitignored. Workflow di deploy aggiornato per passare le `VITE_FIREBASE_*` alla build (chiave API via GitHub Secret `VITE_FIREBASE_API_KEY`, valori pubblici inline). — `4b8e5b3`

---

## 2026-05-31

- **[Claude]** Navbar riorganizzata in layout simmetrico `Home · Insight · (+) · Budget · Movimenti` e nuova sezione **Insight** dedicata (`/insights`); la Dashboard mostra un'anteprima di 3 insight con link "Vedi tutti". Aggiunte emoji vestiti da uomo (👔 👕 👖) alla palette categorie. — `6d9b1bb`
- **[Claude]** Nuova sezione **Budget** (copilota finanziario): obiettivo di risparmio mensile, budget per categoria con stati calmi (normale / vicino al limite / sopra il previsto), budget suggerito da Sunny, "Consigli Sunny". Persistenza in localStorage, dati demo di fallback, componente `ProgressBar` riutilizzabile. — `b812754`
- **[Claude]** Redesign UI verso estetica luxury fintech stile Trade Republic: sfondo quasi nero (#050505), card appena distinguibili, oro desaturato (#C8A05A), rimozione di glow/gradienti/blur, logo semplificato. — `099909b`
- **[Claude]** Semplificata l'inizializzazione di Firestore per risolvere la sincronizzazione cross-device. — `a63811f`

## 2026-05-30

- **[Claude]** Spostato il backdrop del dropdown fuori dallo stacking context dell'header (fix z-index avatar). — `1e9b8ca`
- **[Claude]** Layout desktop responsive con sidebar fissa (220px) e bottom nav solo su mobile. — `56420a3`
- **[Claude]** Impostazioni ristrutturate in tre voci di menu navigabili (Generali / Gestione / Dati). — `18510b0`
- **[Claude]** Saldo iniziale per conto, fix trasparenza glass in dark mode, restructure impostazioni. — `b62059d`
- **[Claude]** Vari fix tema chiaro/scuro: toggle, glass-nav/header in light mode, persistenza senza stale-closure. — `d7e386e`, `15185b0`, `e34a4ec`, `58d8ff6`
