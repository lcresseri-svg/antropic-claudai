# Sunny UI3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** implementare il ripensamento Sunny approvato su tutte le schermate UI3, con esperienza distinta per telefono/tablet/desktop e più grafici/colori sobri.

**Architecture:** conservare motori finanziari e servizi. Navigazione UI3 a tre aree; `/budget` ospita Il tuo mese con Riepilogo/Piano/Scadenze. Componenti reali, dati reali e selettori esistenti; aggiornare presentazione, navigazione e stato di visualizzazione. UI2 e Wrapped mantengono i rispettivi contratti.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind/CSS, SVG esistenti, Vitest e Playwright.

**Spec:** `docs/product/ui3.1/README.md`; integrazione dell'utente del 19 ottobre: tutte le viste, adattamento al dispositivo, alcuni grafici e colori aggiuntivi, mantenendo stile Sunny.

## Global Constraints

- Lavoro nel worktree `/workspace/sunny-ui31-implementation`, branch `feat/sunny-ui31-experience`.
- Nessuna modifica a formule, Firestore Rules, Functions, auth, integrazione Apple Pay o rollout. Resolver UI2/UI3 invariato.
- UI3.1 è la revisione dell'esperienza UI3 pilot esistente, senza nuovo livello di autorizzazione.
- Wrapped chiaro/scuro, ingresso stagionale, timer, gesti, calcoli e obiettivo protetti. Nuovi selettori con confine positivo UI3, senza root token globali.
- Piano resta facoltativo e indipendente da UI3; UI2 conserva il proprio percorso attuale.
- Denaro registrato/programmato/stimato, capitale/controvalore, margine/saldo rimangono distinti. Niente dati dimostrativi nel prodotto.
- Mobile <768 px: dock tre destinazioni e Aggiungi distinto; tablet 768–1099 px: rail e spazi per touch; desktop >=1100 px: sidebar, colonne e grafici più ampi.
- Due temi, bersagli principali touch 44 CSS px, metadati 12–13 px, focus visibile, testo scalabile e reduced motion. Nessun riconoscimento dispositivo tramite user-agent.
- Oro per identità/CTA; verde/rosso semantici; blu e malva sobri per serie/contesti, senza una palette concorrente o decorazione su ogni riga.
- Nessuna dipendenza di prodotto aggiuntiva. Commit/integrazione gestiti dal coordinatore.

## Review Focus

- Piano incompleto, disattivato, non confermato, negativo o dipendente da incassi: nessun saldo presunto in Oggi.
- Rimozione di una chip e ritorno da modifica: ricerca, criteri indipendenti, scroll e focus conservati.
- Tablet/landscape, tastiera aperta e testo 200%: contenuto e azioni non coperti da dock/rail/footer.
- Storico con pochi punti, controvalori mancanti, valori negativi/importi lunghi: grafico veritiero e dati alternativi.
- Utente ordinario/cambio account e Wrapped: nessuna modifica dei gate né contaminazione da token/stato UI3.

## Ownership and interfaces

- Coordinatore: shell, `AdaptiveNav`, `AppHeader`, `AppRoutes`, CSS condiviso `ui31.css`, provider, test di integrazione/browser e raccolta evidenze.
- Dominio Oggi/Mese: dashboard e budget, nuovi `Ui31Today`/`Ui31MonthScreen`, CSS specifici. `DashboardV2` accetta `user?: User`; il coordinatore passerà l'utente reale.
- `Ui31MonthScreen` esporta props `{user: User; transactions: Transaction[]; loading?: boolean; error?: string|null; onAddScheduled?: (date:string)=>void}`. Legge enableBudget da settings. PlanScreen può ricevere `month?:string; onMonthChange?:(month:string)=>void` per periodo controllato, con comportamento legacy identico quando assenti.
- Dominio Movimenti: `features/transactions/`, stato di filtri/ricerca e CSS specifico; non modifica provider o shell.
- Dominio Patrimonio/analisi: wealth e analisi dashboard, grafici relativi e CSS specifico; non modifica DashboardV2 o monthRhythm di Oggi.
- Dominio impostazioni/ingresso: settings, onboarding, login e CSS specifico, mantenendo servizi e formato dati. Nessuna modifica alle aree finanziarie.
- CSS condiviso espone `--ui31-chart-gold`, `--ui31-chart-green`, `--ui31-chart-blue`, `--ui31-chart-rose`, `--ui31-chart-purple`, `--ui31-surface`, `--ui31-warm`, `--ui31-border` dentro `[data-liquid-ui="true"]`. I domini usano classi `ui31-*` e scope UI3.
- Le URL esistenti restano compatibili. Il mese usa query `view=overview|plan|due`; default `plan`. Il gruppo Oggi comprende il mese e le analisi delle spese, Patrimonio comprende conti/investimenti/storico.

## Task 1: shell adattiva e design system

**Files:** `sunny/src/shared/components/AdaptiveNav.tsx`, `sunny/src/app/AppHeader.tsx`, `sunny/src/shared/uiNavigation.test.ts`, `sunny/src/ui31.css`, `sunny/src/index.css`, eventuale helper di navigazione in shared.

**Interfaces:** produce navigazione tre aree, accessi secondari sempre raggiungibili e token condivisi; conserva firme callback esistenti.

- [ ] Aggiornare test nav per tre destinazioni, ramo mese attivo, azione Aggiungi e gate AI/Impegni; osservare il fallimento atteso.
- [ ] Implementare dock/rail/sidebar e profilo, preservando accessi a mese, consigli, AI abilitata, importazione e impostazioni. Titolo/periodo locale.
- [ ] Aggiungere token e layout responsivi per tutte le famiglie di pagine e overlay UI3, escluso Wrapped. Oro, colori serie sobri, tipografia leggibile.
- [ ] Verificare test nav e preview a 320/390/834/1440, tastiera e safe area.

## Task 2: Oggi e Il tuo mese

**Files:** `DashboardV2.tsx`, nuovi componenti in `features/dashboard/` e `features/budget/`, `PlanScreen.tsx`, CSS/test specifici. Coordinatore integra `AppRoutes.tsx`.

**Interfaces:** Ui31MonthScreen e props descritti sopra; calcoli da `useBudget`, `calculateMonthlyPlan/useMonthlyPlan`, `aggregateFlow`, `monthOccurrences`, mai formule parallele.

- [ ] Testare prima gli stati confermato/bozza/incompleto/disattivato/errore/incassi attesi; osservare fallimento per la nuova gerarchia.
- [ ] Oggi: titolo/data, sintesi mese, prima priorità visibile, saldo, tre movimenti recenti. Piccolo grafico di composizione o flussi utile alla lettura, non decorativo.
- [ ] Mese: Riepilogo/Piano/Scadenze, un periodo controllato e conservato, accessi a categorie/entrate/consigli/analisi; grafici di flussi e categorie con dati alternativi.
- [ ] Piano esistente riusato e disponibile anche in UI2; bozza/conferma, editor, formule e persistenza invariati.
- [ ] Verificare almeno una verticale categoria→movimenti→modifica e stati di margine senza introdurre dati demo.

## Task 3: ricerca, filtri e operazioni dei movimenti

**Files:** `features/transactions/TransactionList.tsx`, editor e CSS specifici, test unit/browser dei criteri.

**Interfaces:** URL supportate conservate; stato di sessione isolato per utente. Nessuna modifica ai payload delle scritture.

- [ ] Riprodurre con test la perdita della ricerca rimuovendo una categoria e Filtri fuori viewport; osservare fallimento.
- [ ] Titolo stabile, campo ricerca etichettato, Filtri fuori dallo scroller dei tipi, chip a capo, reset con ambiti distinti.
- [ ] Conservare criteri indipendenti, periodo, ordinamento e ritorno dal dettaglio; le viste da deep link mantengono contesto senza contaminare altre selezioni.
- [ ] Editor responsivo con importo dominante e CTA raggiungibile; nessun nuovo passaggio obbligatorio. Errori/scarto/focus e tipi esistenti preservati.
- [ ] Verificare bulk, draft, errore, storni, serie, tastiera e viewport estremi.

## Task 4: patrimonio, investimenti e analisi

**Files:** `features/wealth/WealthScreen.tsx`, componenti wealth, `features/dashboard/{InvestmentsScreen,AccountBalanceScreen,CategorySpendingScreen,IncomeScreen,WealthHistoryScreen}.tsx`, relativi grafici/CSS/test.

**Interfaces:** props pubbliche esistenti conservate; nessuna ridefinizione di capitale, mercato, quote o storico.

- [ ] Verificare test esistenti su dati storici e accessi alle serie; aggiungere solo regressioni di comportamento pertinenti.
- [ ] Composizione e lettura per conto/posizione, grafici adattivi con palette sobria e distinzioni non basate solo sul colore.
- [ ] Evidenziare capitale vs ultimo controvalore noto e aggiornamento; pochi punti e valori mancanti non producono curve inventate.
- [ ] Ottimizzare confronto/liste sul desktop e dettagli progressivi touch su mobile/tablet.
- [ ] Verificare periodo→movimenti riconciliabili, date, assenza investimenti, etichette lunghe e cifre estreme.

## Task 5: impostazioni, flussi iniziali e copertura delle viste secondarie

**Files:** `features/settings/`, `features/onboarding/`, `shared/components/LoginScreen.tsx`, CSS e test relativi; coordinatore rifinisce analisi avanzate/recap attraverso i confini condivisi.

**Interfaces:** firme servizi e dati onboarding esistenti; eventuale raggruppamento UI in tre momenti non altera Rules, auth o grant.

- [ ] Testare resume, modalità manuale/CSV/esempio, assenza dati e preferenze: niente attivazioni o preset impliciti.
- [ ] Applicare tre momenti di ingresso dove compatibile con i passi persistiti: origine dati, conti/validazione, prima lettura; piano/obiettivi restano facoltativi e contestuali.
- [ ] Impostazioni con gruppi leggibili, ricerca, azioni distruttive separate e feedback reale; layout specifici per touch e desktop.
- [ ] Allineare login, importazione, notifiche e conferme al linguaggio UI3.1; non aggiungere grafici dove non aiutano.
- [ ] Verificare tutte le rotte secondarie e i loro overlay, inclusi gate e Wrapped.

## Task 6: integrazione e consegna

**Files:** `AppRoutes.tsx`, `ui-preview/ui31-*.mjs`, `docs/product/ui3.1/implementazione/`, piano/progress.

- [ ] Integrare domini e controllare diff/contratti, senza interleaving delle modifiche agli stessi file.
- [ ] Eseguire typecheck, suite unit completa e build. Baseline: 852 passed, 5 skipped; build passata.
- [ ] Matrice di tutte le 19 rotte nei due temi a 320/390/834/1440; login/onboarding; tastiera, safe area, testo 200%, reduced motion e flussi funzionali pertinenti.
- [ ] Confrontare UI2 e Wrapped nei due temi; aggiornare soltanto aspettative UI3 cambiate dall'approvazione, preservando asserzioni di dati e comportamento.
- [ ] Revisione indipendente del diff completo e correzione dei rilievi verificati.
- [ ] Raccogliere screenshot reali, inventario/coprertura, esiti e limiti; commit del branch. Nessun merge o deploy.
