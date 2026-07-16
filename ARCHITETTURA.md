# Sunny — Come funziona tutto

> Versione corrente: **1.15.0** · branch di lavoro: `claude/fervent-dirac-mjlbmq`
> Le sezioni sui motori (previsione, insight, ricorrenze) restano la
> descrizione autorevole; struttura, Functions e sicurezza sono aggiornate al
> refactor di consolidamento (vedi anche HANDOFF.md).

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite (PWA) |
| Stile | Tailwind CSS + variabili CSS custom (tema chiaro/scuro) |
| Backend dati | Firebase Firestore (con persistenza IndexedDB offline) |
| Autenticazione | Firebase Auth — solo Google Sign-In |
| Cloud Functions | Node 20, deploy su `europe-west1` |
| AI digest | Google Gemini via Cloud Function (lato server, chiave non esposta) |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Deploy | GitHub Actions → Firebase Hosting + Functions |

---

## Struttura del monorepo

```
/
├── sunny/                  ← app React
│   ├── src/
│   │   ├── App.tsx         ← SOLO bootstrap: splash, guard auth, provider, layout
│   │   ├── app/            ← shell applicativa
│   │   │   ├── AppRoutes.tsx          ← routing (schermate lazy, gate feature)
│   │   │   ├── AppHeader.tsx          ← header mobile
│   │   │   ├── useTransactionEditing.ts ← stato modale/serie + handleSave
│   │   │   ├── ErrorBoundary.tsx      ← nessuna schermata bianca
│   │   │   └── SyncStatusBanner.tsx   ← stato offline/sincronizzazione
│   │   ├── types.ts        ← Transaction, CategoryDef, AccountDef, ecc.
│   │   ├── utils.ts        ← formatCurrency, formatDate, ecc.
│   │   ├── lib/firebase.ts ← init app/auth/firestore (+ App Check opzionale)
│   │   ├── shared/
│   │   │   ├── providers/settings.tsx ← SettingsContext (categorie, conti, toggles)
│   │   │   ├── hooks/      ← useTransactions, useBudget, usePush, useAuth
│   │   │   ├── featureFlags.ts        ← identità admin (SOLO data-access)
│   │   │   ├── featureRollout.ts      ← flag centralizzati funzioni in anteprima
│   │   │   ├── monthlyAggregates.ts   ← aggregati mensili derivati (predisposti)
│   │   │   └── recurrence.ts          ← logica ricorrenze/serie
│   │   └── features/
│   │       ├── dashboard/  ← DashboardV2 (unica Home), analytics, WealthHistory
│   │       ├── transactions/ ← lista, modale, import, riconoscimento categoria
│   │       ├── insights/   ← InsightsScreenV2 (unica), insightsEngine, ranking V2
│   │       ├── budget/     ← BudgetScreenV2 (unica), budgetUtils, monthlyBudget,
│   │       │                  monthlyPlanV2 (+ store/screen, admin)
│   │       ├── forecast/   ← engine V2 (baseline) / V3 (ufficiale) / v4/ (admin),
│   │       │                  service/ (ForecastService unificato + baseline backtest)
│   │       ├── wealth/     ← Patrimonio V2, snapshot, liquidità disponibile,
│   │       │                  impegni (tutti admin-only)
│   │       ├── investments/ ← sheet operazioni investimento
│   │       ├── aiCoach/    ← AI Coach + Decision Coach deterministico (admin)
│   │       └── settings/   ← SettingsScreen, export, shortcut iOS
├── functions/src/
│   ├── index.ts            ← SOLO re-export (i nomi esportati = nomi deployati)
│   ├── shared.ts           ← init Admin SDK, auth/CORS/push helper, App Check soft
│   ├── recurring.ts        ← materializzazione ricorrenti
│   ├── notifications.ts    ← promemoria schedulati + push di test + encouraging
│   ├── ai.ts               ← generateDigest, generateAffordabilityAdvice (Gemini)
│   ├── shortcuts.ts        ← API shortcut spese iOS (token dedicati)
│   ├── metrics.ts          ← rollup metriche DAU/WAU/MAU
│   ├── deletion.ts         ← onUserDeleted (pulizia completa)
│   └── feedback.ts         ← onFeedbackCreated (notifica admin)
├── firestore.rules         ← regole sicurezza Firestore
├── firestore-tests/        ← test Rules su emulatore
├── firebase.json           ← config hosting + functions
└── .github/workflows/
    ├── ci-tests.yml        ← PR: typecheck+test+build frontend, functions, Rules
    ├── deploy-firebase.yml ← deploy hosting (solo push su main)
    └── deploy-functions.yml← deploy functions (solo push su main)
```

---

## Modello dati Firestore

Tutto è sotto `users/{uid}/` — ogni utente vede solo i propri dati.

```
users/{uid}/
  transactions/{txId}      ← ogni transazione
  meta/settings            ← categorie, conti, toggles (rules con validazione)
  meta/budget              ← obiettivi, budget per categoria (rules con validazione)
  meta/push                ← token FCM + preferenze promemoria
  meta/onboarding          ← stato onboarding
  meta/activity            ← metriche presenza { lastActiveAt, activeDays[] }
  meta/aiCoach             ← rate-limit AI (SOLO Admin SDK; client read-only)
  budgetHistory/{YYYY-MM}  ← snapshot budget mensile (status/source)
  monthlyPlans/{YYYY-MM}   ← Piano mensile V2 (admin, flag monthly_plan_v2)
  wealthSnapshots/{YYYY-MM-DD} ← snapshot patrimoniali (admin, flag wealth_v2)
  forecastSnapshots/{id}   ← audit backtest forecast (create-only, validati)
  derived/encouraging      ← pool insight positivi per la push opzionale
  derived/monthlyAggregates← aggregati mensili derivati (versionati, on-demand)
  events/{autoId}          ← metriche comportamento { name, ts } SOLO

feedback/{fid}             ← top-level: feedback utenti (create per tutti, read admin)
metrics/{YYYY-MM-DD}       ← top-level: aggregato giornaliero (Admin SDK; read admin)
expenseTokens/{sha256}     ← top-level: token shortcut iOS (SOLO Admin SDK)
```

### Metriche self-hosted (DAU/WAU/MAU + engagement)

Sunny **non usa GA4** (`@firebase/analytics` non viene inizializzato). Layer
metriche proprietario, pseudonimo per UID, separato dai dati operativi
(`sunny/src/shared/analytics/metrics.ts`, fire-and-forget):

- `meta/activity` — presenza: `lastActiveAt` (ms) + `activeDays` (≤35 `YYYY-MM-DD`, dedup/sorted/trim). Scritta `recordActivity(uid)`, **debounced una volta per sessione** (sessionStorage `sunny_activity_done`).
- `events/{autoId}` — eventi comportamentali: **solo** `{ name, ts }`. Allowlist `name`: `app_open`, `insights_view`, `insight_open`, `notif_open`, `tx_add`, `forecast_view`, `aicoach_open`. **MAI** importi/descrizioni/categorie/merchant.
- `metrics/{YYYY-MM-DD}` — aggregato giornaliero (DAU/WAU/MAU/stickiness, readers, adoption, newUsers/totalUsers) scritto dall'Admin SDK (Cloud Function `rollupMetrics`), leggibile **solo dall'admin**.

L'allowlist degli eventi è duplicata in 3 punti che vanno tenuti in sync: `metrics.ts`, `firestore.rules` (`validEvent`), e la funzione di rollup.

### Transaction (campi principali)

| Campo | Tipo | Note |
|-------|------|------|
| `id` | string | generato lato client |
| `date` | string | `YYYY-MM-DD` |
| `description` | string | |
| `amount` | number | sempre positivo |
| `type` | `'expense'`/`'income'`/`'investment'`/`'transfer'` | |
| `category` | string | id della CategoryDef |
| `account` | string | id dell'Account |
| `seriesId` | string? | se è un'istanza di una serie ricorrente |
| `recurring` | object? | `{freq, until?}` — solo sul template della serie |
| `projected` | boolean? | `true` = occorrenza futura, solo display, non scritta su Firestore |
| `split` | object? | `{totalAmount, myShare}` — spesa condivisa |
| `direction` | `'in'`/`'out'`? | solo investimenti: assente/`in` = deposito, `out` = disinvestimento |
| `tfr` | number? | quota TFR di un versamento in fondo pensione (≤ amount) |
| `valueDelta` | number? | investimenti: delta esplicito sul controvalore (vince su ±amount) |
| `valueEffect` | object? | stamp `{category, delta, appliedAt}` del delta controvalore APPLICATO (doc "managed") |
| `valuePending` | boolean? | investimento con data futura: effetto controvalore rinviato al reconciler |
| `statsSpreadMonths` | int? | 2–120: distribuzione SOLO statistica di un deposito una tantum |

**Variabile vs Ricorrente:** `!seriesId && !recurring` = spesa variabile (non pianificata). Questa distinzione guida tutto il motore di previsione.

### Flusso finanziario unico (`shared/financialFlow.ts`)

Helper puro, singola fonte di verità per il cash flow (dashboard, saldi conto,
analytics, subtotali Movimenti, recap, AI digest):

```
cashIn  = entrate ordinarie + apporti esterni non-TFR + capitale rientrato dai disinvestimenti
cashOut = spese effettive + depositi non-TFR finanziati dai conti
netFlow = cashIn − cashOut          (in UI: "Flusso netto")
```

- TFR (`clamp(tfr ?? 0, 0, amount)`): **mai** nel flusso e **mai** a carico del
  conto; resta in capitale investito / controvalore / patrimonio.
- Deposito senza conto (`account === ''`): apporto esterno → entrata del flusso.
- Gamba `out` del disinvestimento = capitale rimborsato → entrata; plus/minus e
  commissioni restano nelle rispettive transazioni (zero doppi conteggi).
- Trasferimenti interni esclusi dal flusso globale.
- Il campo legacy `countInvestmentsInExpenses` in `meta/settings` è IGNORATO
  (mai letto né cancellato).

### CategoryDef investimento

`initialBalance` (capitale pre-Sunny), `fundType`, `tfrAmount`, `currentValue` +
`lastValueUpdate` (controvalore manuale, sincronizzato atomicamente da
`investmentValueSync` — nessun fallback plain-write: o commit atomico o errore
con Retry in form; date future → `valuePending` + reconciler idempotente
all'avvio), `subscriptionDate` (mai futura: àncora `initialBalance` per durata e
XIRR; con `initialBalance=0` vale la prima operazione; con `initialBalance>0`
senza data il rendimento annualizzato non è disponibile).

La performance della posizione (XIRR money-weighted, guadagno totale, durata) è
in `features/investments/investmentPerformance.ts`; la distribuzione statistica
dei depositi in `investmentStatsSpread.ts` (quote al centesimo, residuo
sull'ultimo mese, competenza fino al mese corrente).

---

## Tutto il filtering/sorting è client-side

Firestore serve solo `orderBy('date', 'desc')` senza limite. Tutti i filtri (periodo, tipo, conto, categoria, ricerca) vengono applicati in-memory nel browser con `useMemo`. Questo semplifica le query ma significa che si scaricano tutte le transazioni dell'utente ad ogni sessione (IndexedDB le cachea offline).

---

## Motore di previsione (`budgetUtils.ts`)

È la **singola fonte di verità** usata sia dagli Insight sia dal Budget — i due schermi non possono mai contraddirsi.

### `forecastSavings(o)` — previsione fine mese

```
uscite_previste = speso_questo_mese + variabile_residua + ricorrenti_residue
```

**Spesa variabile residua:**
1. `paceMonthly = variabileSpesa / avanzamento` (ritmo attuale del mese)
2. `paceReliability = min(1, speso / atteso_a_oggi)` — se a metà mese non hai ancora registrato nulla, non collassa a zero ma resta sulla media storica
3. `effectiveW = avanzamento × paceReliability` — quanto peso dare al ritmo reale vs media storica
4. `projectedVar = effectiveW × paceMonthly + (1 − effectiveW) × variableAvg`
5. `variabile_residua = (1 − avanzamento) × projectedVar`

**`variableAvg` — blend adattivo recente + stagionale:**
- `sw = SEASONAL_MAX_WEIGHT (0.4) × min(1, anniStagionali / SEASONAL_FULL_YEARS (2))`
- Stagionale pesa al massimo 40%, e solo se ci sono ≥ 2 anni di dati
- Con un solo anno anomalo: peso stagionale = 20% (non può distorcere)

**Ricorrenti:** calcolate esplicitamente con `upcomingRecurringThisMonth()` e sommate, non più usate come "pavimento".

**Entrate/investimenti:** `max(reale_del_mese, media_storica)` — lo stipendio arriva spesso tutto insieme.

### `robustAvg(values)` — media resistente agli outlier

Winsorizza i valori sopra `2.5 × mediana` dei valori non-zero. Con ≤ 2 valori usa la media normale (troppo pochi dati per rilevare outlier). Usato sia per la media recente in `history()` sia per la media stagionale in `seasonalVariableMonthly()`.

### `seasonalVariableMonthly(txs, monthIdx, now)` — storico stagionale

Somma le spese variabili per lo stesso mese in anni precedenti (finestra 18 mesi, mese corrente escluso). Restituisce `{avg, years}`. `years` determina il peso nella blend.

### `forecastByCategory(txs, categoryIds, now)` — previsione per categoria

Stessa logica adattiva di `forecastSavings`, calcolata in un unico passaggio su tutte le categorie. Restituisce `{categoryId → proiezione fine mese}`. Mostrata nel Budget sotto ogni voce ("Stima fine mese ~€…").

---

## Motore degli insight (`insightsEngine.ts`)

`buildInsights(input)` produce una lista ordinata di `Insight`, ognuno con titolo, dettaglio, icona, colore e una spiegazione dettagliata (campo `explain`) mostrata nel drawer "Come è stato calcolato".

**Insight principali (in ordine):**

| # | Categoria | Quando appare |
|---|-----------|---------------|
| 0 | Alert | Pagamento ricorrente in scadenza entro 14 giorni |
| 1 | Alert | Sforamento entrate < uscite (solo dopo metà mese) |
| 2 | Forecast | Fine mese stimato (risparmio/disavanzo proiettato) |
| 3 | Forecast | Risparmiato finora questo mese |
| 4 | Forecast | Entrate sopra/sotto la media |
| 5 | Forecast | Ritmo investimenti |
| 6 | Seasonal | Categoria storicamente più cara questo mese |
| 7 | Seasonal | Heads-up sul mese prossimo |
| 8 | Seasonal | Anno su anno (solo dopo il 40% del mese) |
| 9 | Trend | Spese in crescita/calo costante (6 mesi) |
| 10 | Trend | Tasso di risparmio in crescita/calo |
| 11 | Trend | Quota reddito investita |
| 12 | Trend | Proiezione annuale (con stagionalità) |
| 13+ | Habit | Categoria cresciuta di più, risparmio streak, ecc. |

`history(txs, N)` calcola le medie su N mesi recenti con dati (i mesi vuoti non abbassano la media). `avgVariableExpense` usa `robustAvg` per smussare mesi anomali.

**Soglie di ingresso degli insight chiave:**
- Forecast fine mese: `h.avgVariableExpense > 0 || prog > 0.15` (appare presto se c'è storico)
- Anno su anno: `prog > 0.4 && monthlyExpenses > 0` (troppo volatile nei primi giorni)

---

## Ricorrenze

- Il **template** porta `recurring: {freq, until?}`.
- Le **istanze materializzate** portano `seriesId` (collegato al template) e vengono scritte su Firestore quando l'utente conferma.
- Le **occorrenze future** (`projected: true`) sono generate solo in memoria da `generateProjected()` e non scritte su Firestore.
- `upcomingRecurringThisMonth(txs, today, monthEnd)` calcola le occorrenze ricorrenti ancora da registrare entro fine mese — usata nel forecast.

---

## Budget

Salvato su `users/{uid}/meta/budget` in Firestore:

```typescript
{
  savingsTarget: number,          // obiettivo di risparmio mensile
  categoryBudgets: Record<string, number>,    // budget per categoria di spesa
  incomeBudgets: Record<string, number>,      // entrate attese per categoria
  investmentBudgets: Record<string, number>,  // investimenti pianificati per categoria
}
```

`suggestBudgets()` genera suggerimenti dalla media degli ultimi 3 mesi, alzata al livello stagionale se questo mese è storicamente più caro. `generateBudgetInsights()` produce i testi di coaching (mai giudicanti).

---

## Cloud Functions (`functions/src/`)

`index.ts` è solo un layer di re-export: i NOMI esportati sono i nomi
deployati e non cambiano; regioni (`europe-west1`) e schedule vivono accanto a
ogni funzione nel proprio modulo.

| Funzione | Modulo | Trigger/Schedule (Europe/Rome) |
|----------|--------|--------------------------------|
| `processRecurringTransactions` | recurring | `0 0 * * *` |
| `sendTestPush` | notifications | HTTP POST autenticato |
| `remindLogExpenses` | notifications | `0 13,21 * * *` |
| `sendMonthlySummary` | notifications | `0 10 1 * *` |
| `remindUpcomingPayments` | notifications | `0 18 * * *` |
| `remindInactivity` | notifications | `0 21 * * *` |
| `remindMonthEnd` | notifications | `0 19 28-31 * *` |
| `sendEncouragingInsight` | notifications | `0 11 */2 * *` (opt-in) |
| `generateDigest` / `generateAffordabilityAdvice` | ai | HTTP POST autenticato, rate-limit per utente, App Check soft |
| `issueExpenseToken` / `listExpenseTokens` / `revokeExpenseToken` / `getExpenseOptions` / `addExpense` | shortcuts | HTTP (token dedicati) |
| `rollupMetrics` / `testMetricsRollup` | metrics | `15 0 * * *` / HTTP admin |
| `onUserDeleted` | deletion | Firestore trigger |
| `onFeedbackCreated` | feedback | Firestore trigger |

CORS ristretto a origini esplicite. Nessun dato finanziario/PII nei log
(`logError` logga solo code/message). Le funzioni AI verificano anche l'header
App Check in modalità "soft": il rifiuto scatta solo con `APPCHECK_ENFORCE=true`.

---

## CI/CD

```
push su main
  └─► deploy-firebase.yml  →  npm build sunny → Firebase Hosting
  └─► deploy-functions.yml →  npm build functions → Firebase Functions
```

- **Solo push su `main` fa il deploy** (le PR fanno solo CI build/check).
- Il workflow delle functions scrive la chiave Gemini da GitHub Secrets in `functions/.env` al momento del deploy (il file è gitignored).
- Rollback: basta revertire il commit su `main` e ripushare.

---

## Sicurezza

### Firestore rules
- Ogni documento sotto `users/{uid}/` è accessibile solo all'utente autenticato con quell'UID.
- Transazioni: `create`/`update` validano tipi, enum, range, lunghezze (amount > 0, date ISO, seriesMeta ben formato).
- `meta/*`: regole SPECIFICHE per settings/budget/push/onboarding/activity con
  validazione leggera e compatibile coi dati legacy (es. `theme: 'system'`
  resta valido); `meta/aiCoach` è read-only per il client; i doc meta non
  ancora enumerati mantengono il fallback owner-only (hardening graduale).
- `forecastSnapshots`: owner-only, create-only (audit trail), payload validato.
- `wealthSnapshots`: owner-only, create+update idempotente (stesso giorno →
  stesso doc), MAI delete; `monthlyPlans` e `derived/monthlyAggregates`
  validati per shape/enum.
- I test in `firestore-tests/rules.test.ts` coprono tutte queste regole.

### Feature gating
- `shared/featureFlags.ts`: SOLO identità admin per accesso a DATI riservati
  (feedback, metrics). Mai per nascondere UI generalmente disponibile.
- `shared/featureRollout.ts`: registro centrale dei flag delle funzioni in
  anteprima (`wealth_v2`, `available_cash`, `forecast_unified`,
  `monthly_plan_v2`, `commitments`, `decision_coach`, `insight_ranking_v2`)
  con stadi deterministici admin → allowlist → percentuale (hash FNV-1a per
  utente) → tutti. I flag client nascondono UI: l'autorizzazione sui dati
  resta sempre lato server (Rules/Functions).

### Cloud Functions
- Il `uid` viene estratto dal token Firebase verificato lato server — non si fida mai del body della richiesta.
- CORS ristretto alle origini di produzione + localhost; body cap 100 KB;
  rate-limit atomici per utente sulle funzioni AI.
- App Check: client inizializzato solo se `VITE_APPCHECK_SITE_KEY` è
  configurata (rollout non bloccante); server in modalità log-only finché non
  si imposta `APPCHECK_ENFORCE=true` sulle functions.

### Dati
- Tutto in chiaro su Firestore (cifratura E2E valutata e rimossa per semplicità operativa — v1.8.8).
- Nei log delle Functions mai importi, descrizioni, token o PII.

---

## Impostazioni utente (`meta/settings`)

```typescript
{
  categories: CategoryDef[],     // expense / income / investment
  accounts: Account[],
  theme: 'system' | 'dark' | 'light',
  analysisDepth: 'minimal' | 'medium' | 'advanced',
  enableInvestments: boolean,
  enableBudget: boolean,
  aiEnabled: boolean,            // default false
  pushEnabled: boolean,
  currency: string,
}
```

Le categorie e i conti sono completamente personalizzabili dall'utente. I campi `seriesId`/`recurring` nelle transazioni si basano sugli `id` di queste definizioni.

---

## Flusso di avvio app

```
App.tsx
  └─► Firebase Auth listener
        ├─► non autenticato → <LandingPage>
        └─► autenticato
              ├─► useTransactions()  ← listener Firestore realtime
              ├─► SettingsProvider   ← carica meta/settings
              ├─► useBudget()        ← carica meta/budget
              └─► routing React Router
                    ├─► /           → DashboardScreen
                    ├─► /insights   → InsightsScreen
                    ├─► /budget     → BudgetScreen (o BudgetDisabled)
                    ├─► /transactions→ TransactionList
                    ├─► /investments → InvestmentsScreen
                    └─► /settings   → SettingsScreen
```

---

## Versioni recenti

| Versione | Data | Cosa |
|----------|------|------|
| **1.8.11** | 2026-06-04 | Pannello filtri compatto/scrollabile, fix insight anno-su-anno |
| **1.8.10** | 2026-06-04 | `robustAvg` per outlier, `paceReliability`, `forecastByCategory` |
| **1.8.9** | 2026-06-03 | Ridisegno previsione: variabili vs ricorrenti, pesi adattivi stagionali |
| **1.8.8** | 2026-06-03 | AI off di default, budget disattivabile, impostazioni per aree |
| **1.8.7** | 2026-06-03 | Categorie tap-to-edit, "Salva e aggiungi un'altra", chip Recenti |
| **1.8.6** | 2026-06-03 | Previsioni multi-segnale (stagionalità + ricorrenti) |
