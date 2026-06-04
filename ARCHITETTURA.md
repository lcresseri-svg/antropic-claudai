# Sunny — Come funziona tutto

> Versione corrente: **1.8.11** · branch di lavoro: `claude/sunny-finance-mvp-HRtWy`

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
│   │   ├── App.tsx         ← routing, init Firebase, guard auth
│   │   ├── types.ts        ← Transaction, CategoryDef, Account, ecc.
│   │   ├── utils.ts        ← formatCurrency, formatDate, ecc.
│   │   ├── lib/
│   │   │   └── firebase.ts ← init app/auth/firestore/messaging
│   │   ├── shared/
│   │   │   ├── providers/
│   │   │   │   └── settings.tsx   ← SettingsContext (categorie, conti, toggles)
│   │   │   ├── hooks/
│   │   │   │   ├── useTransactions.ts  ← listener Firestore realtime
│   │   │   │   └── useBudget.ts        ← budget su Firestore
│   │   │   ├── recurrence.ts      ← logica ricorrenze
│   │   │   └── push.ts            ← registrazione token FCM
│   │   └── features/
│   │       ├── dashboard/         ← Home, AIDigestCard
│   │       ├── transactions/      ← TransactionList, TransactionModal, TransactionRow
│   │       ├── insights/          ← InsightsScreen, insightsEngine.ts ← motore insight
│   │       ├── budget/            ← BudgetScreen, budgetUtils.ts ← motore previsioni
│   │       ├── investments/       ← InvestmentsScreen
│   │       └── settings/          ← SettingsScreen, EditDefSheet
├── functions/
│   └── src/index.ts        ← Cloud Functions: sendTestPush, generateDigest
├── firestore.rules         ← regole sicurezza Firestore
├── firebase.json           ← config hosting + functions
└── .github/workflows/
    ├── deploy-firebase.yml ← CI/CD hosting (solo push su main)
    └── deploy-functions.yml← CI/CD functions (solo push su main)
```

---

## Modello dati Firestore

Tutto è sotto `users/{uid}/` — ogni utente vede solo i propri dati.

```
users/{uid}/
  transactions/{txId}      ← ogni transazione
  meta/settings            ← un unico documento con categorie, conti, toggles
  meta/budget              ← obiettivi, budget per categoria, entrate/investimenti pianificati
  meta/push                ← token FCM per le notifiche push
```

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

**Variabile vs Ricorrente:** `!seriesId && !recurring` = spesa variabile (non pianificata). Questa distinzione guida tutto il motore di previsione.

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

## Cloud Functions (`functions/src/index.ts`)

Entrambe le funzioni richiedono autenticazione Firebase (token Bearer verificato via Admin SDK):

| Function | Trigger | Cosa fa |
|----------|---------|---------|
| `sendTestPush` | HTTP POST autenticato | Invia una notifica push di test al token FCM dell'utente |
| `generateDigest` | HTTP POST autenticato | Chiama Gemini con le transazioni del mese, restituisce 2-3 frasi di riepilogo AI |

CORS ristretto a origini esplicite. Nessun dato sensibile nei log di produzione.

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
- `create` e `update` validano che i campi obbligatori esistano e che `amount` sia positivo.

### Cloud Functions
- Il `uid` viene estratto dal token Firebase verificato lato server — non si fida mai del body della richiesta.
- CORS ristretto alle origini di produzione + localhost.

### Dati
- Tutto in chiaro su Firestore (cifratura E2E valutata e rimossa per semplicità operativa — v1.8.8).

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
