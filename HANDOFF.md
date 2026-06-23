# Sunny — Stato del progetto al 2026-06-16

> **Versione corrente:** `1.9.32` · **branch attivo:** `claude/sunny-finance-mvp-HRtWy`
> **Ultimo merge su `main`:** PR #25, SHA `89a7d319`

---

## Stack

| Layer | Tecnologia |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite (PWA) |
| Stile | Tailwind CSS + variabili CSS custom (dark/light) |
| Backend dati | Firebase Firestore + IndexedDB offline |
| Auth | Firebase Auth — solo Google Sign-In |
| Cloud Functions | Node 20, `europe-west1` |
| AI | Gemini REST via Cloud Function (chiave non esposta al client) |
| Push | Firebase Cloud Messaging (FCM) |
| Deploy | GitHub Actions → Firebase Hosting + Functions (solo su push a `main`) |

---

## Struttura monorepo

```
/
├── sunny/src/
│   ├── App.tsx                         ← routing, init Firebase, guard auth, portfolio useMemo
│   ├── types.ts                        ← Transaction, CategoryDef, Account
│   ├── utils.ts                        ← formatCurrency, formatDate, ecc.
│   ├── appInfo.ts                      ← APP_VERSION + VERSIONS changelog
│   ├── lib/firebase.ts                 ← init app/auth/firestore/messaging
│   ├── shared/
│   │   ├── providers/settings.tsx      ← SettingsContext (categorie, conti, toggles)
│   │   ├── hooks/useTransactions.ts    ← listener Firestore realtime
│   │   ├── hooks/useBudget.ts          ← budget su Firestore
│   │   ├── hooks/usePush.ts            ← toggle notifiche + ReminderPrefs
│   │   ├── push.ts                     ← registrazione token FCM, sendTestNotification
│   │   ├── featureFlags.ts             ← isAdminUser (UID allowlist)
│   │   └── recurrence.ts              ← logica ricorrenze
│   └── features/
│       ├── dashboard/Dashboard.tsx     ← Home desktop
│       ├── dashboard/DashboardV2.tsx   ← Home mobile
│       ├── insights/
│       │   ├── insightsEngine.ts       ← MOTORE PRINCIPALE (1781 righe)
│       │   ├── insightsEngine.test.ts  ← 174 test (tutte passing)
│       │   ├── InsightsScreen.tsx      ← UI insight (tutti utenti)
│       │   ├── InsightsScreenV2.tsx    ← UI insight V2 (con pool encouraging)
│       │   ├── InsightTicker.tsx
│       │   └── InsightDetailSheet.tsx
│       ├── budget/
│       │   ├── budgetUtils.ts          ← forecastSavings, forecastByCategory, robustAvg
│       │   ├── BudgetScreen.tsx / BudgetScreenV2.tsx
│       │   └── MonthGoalCard.tsx
│       ├── forecast/
│       │   ├── forecastEngineV3.ts     ← computeForecastV3, forecastSavingsV3, forecastBehaviorV3
│       │   └── forecastStats.ts        ← mad(), median helpers
│       ├── transactions/TransactionModal.tsx / TransactionList.tsx
│       ├── aiCoach/AICoachScreen.tsx   ← admin-only AI Coach
│       ├── goals/GoalsScreen.tsx       ← admin-only Obiettivi
│       ├── feedback/
│       │   ├── InsightFeedback.tsx     ← micro-feedback 👍👎 su ogni insight
│       │   ├── FeedbackSheet.tsx       ← bottom sheet feedback generale
│       │   └── useFeedback.ts          ← hook + submitFeedback
│       ├── onboarding/OnboardingScreen.tsx
│       └── settings/SettingsScreen.tsx
├── functions/src/index.ts              ← tutte le Cloud Functions (1023 righe)
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── .github/workflows/
    ├── deploy-firebase.yml             ← CI hosting (solo push main)
    └── deploy-functions.yml           ← CI functions (solo push main)
```

---

## Modello dati Firestore

```
users/{uid}/
  transactions/{txId}
  meta/settings          ← categorie, conti, toggles (enableBudget, enableInvestments, aiEnabled, insightDepth)
  meta/budget            ← savingsTarget, categoryBudgets, monthlyIncome, monthlyInvestments
  meta/push              ← tokens FCM + reminders (ReminderPrefs)
  meta/onboarding        ← completed, currentStep, dataMode, demoTransactionIds
  meta/aiCoach           ← dailyCount, lastResetDay (rate limit AI Coach)
  derived/encouraging    ← pool di insight positivi per la push notifica incoraggiamento
  goals/{goalId}         ← obiettivi di risparmio (admin-only)
  meta/activity          ← metriche presenza { lastActiveAt, activeDays[] } (DAU/WAU/MAU)
  events/{autoId}        ← metriche comportamento { name, ts } SOLO — mai dati finanziari

feedback/{fid}           ← top-level (non per-user): tutti i feedback utente
metrics/{YYYY-MM-DD}     ← top-level: aggregato giornaliero metriche (Admin SDK scrive, admin legge)
```

**Metriche self-hosted (no GA4):** layer proprietario in `sunny/src/shared/analytics/metrics.ts`,
fire-and-forget. `recordActivity(uid)` aggiorna `meta/activity` (debounced 1×/sessione via
sessionStorage `sunny_activity_done`). `logEvent(uid, name)` scrive `events/{autoId}` con **solo**
`{name, ts}`; allowlist `name`: `app_open`/`insights_view`/`insight_open`/`notif_open`/`tx_add`/
`forecast_view`/`aicoach_open` (duplicata in `metrics.ts`, `firestore.rules` e funzione rollup —
tenere in sync). Aggregato giornaliero in `metrics/{day}` via Cloud Function `rollupMetrics`, letto solo admin.

---

## Cloud Functions

| Funzione | Tipo | Schedule | Note |
|----------|------|----------|------|
| `processRecurringTransactions` | Scheduled | `0 3 * * *` | Materializza ricorrenti |
| `remindLogExpenses` | Scheduled | `0 13,21 * * *` | Promemoria log spese |
| `sendMonthlySummary` | Scheduled | `0 9 1 * *` + `0 19 L * *` | Riepilogo mensile |
| `remindUpcomingPayments` | Scheduled | `0 18 * * *` | Pagamenti imminenti |
| `remindInactivity` | Scheduled | `0 21 * * *` | Nessun movimento da 5+ gg |
| `remindMonthEnd` | Scheduled | `0 19 27-31 * *` | Avviso fine mese |
| `sendEncouragingInsight` | Scheduled | `0 11 */2 * *` | Insight positivo ogni ~48h (**OPT-IN, default OFF**) |
| `sendTestPush` | HTTP | — | Test push da Settings |
| `generateDigest` | HTTP | — | AI digest giornaliero (Gemini) |
| `generateAffordabilityAdvice` | HTTP | — | AI Coach "posso permettermi?" (admin-only, rate-limit 20/giorno) |
| `onUserDeleted` | Firestore trigger | — | Elimina dati utente |
| `onFeedbackCreated` | Firestore trigger | — | Push admin su nuovo feedback |

---

## Notifiche push (ReminderPrefs in usePush.ts)

| Chiave | Default | Descrizione |
|--------|---------|-------------|
| `logExpenses` | ✅ ON | Promemoria giornaliero log spese (13:00 + 21:00) |
| `recurring` | ✅ ON | Transazione ricorrente auto-registrata stanotte |
| `monthly` | ✅ ON | Riepilogo inizio/fine mese |
| `upcomingPayments` | ✅ ON | Pagamento programmato il giorno prima |
| `inactivityReminder` | ✅ ON | Nessun movimento da 5+ giorni |
| `encouragement` | ❌ OFF | Insight positivo ogni ~48h (opt-in, aggiunto in 1.9.32) |

---

## Motore insight (`insightsEngine.ts`)

### Interfacce chiave

```typescript
export type InsightDepth = 'minimal' | 'medium' | 'advanced';
export type InsightCategory = 'alert' | 'forecast' | 'seasonal' | 'trend' | 'habit' | 'highlight';

export interface Insight {
  icon: string; title: string; detail: string; accent: string;
  tone: 'positive' | 'neutral' | 'caution';
  urgent?: boolean; category: InsightCategory;
  minDepth?: InsightDepth;   // stamped by push()
  _family?: string;           // dedup: eom-projection
  explain?: InsightExplain;
}

export interface InsightInput {
  transactions: Transaction[];
  monthlyIncome: number; monthlyExpenses: number; monthlyInvestments: number;
  getCat: (id: string) => { icon: string; label: string };
  depth?: InsightDepth;
  forecastV3Categories?: CategoryDef[];  // se omesso → fallback a forecastSavings()
  portfolio?: { controvalore: number; versato: number };  // solo se investimenti attivi
  isAdmin?: boolean;    // sblocca insight avanzati FASE 4
  budgets?: Record<string, number>;  // per il budget-adherence insight
}

export function buildInsights(input: InsightInput): Insight[]
```

### Livelli di profondità

- `minimal` — visibile a tutti (produzione di default)
- `medium` — visibile con insightDepth `medium` o `advanced`
- `advanced` — visibile solo con insightDepth `advanced`

### Famiglie / dedup

Il motore deduplica automaticamente gli insight con `_family === 'eom-projection'`: viene mostrato solo il primo trovato (evita duplicazione tra logica V3 e heuristica).

### Admin guard

```typescript
// featureFlags.ts
export function isAdminUser(user: User | null): boolean {
  return canUseDetailedInvestments(user); // stesso UID allowlist
}
// UID admin: qPtCOJGRrwOZ2EfjxMHwW6ZISXX2
```

Gli insight FASE 4 (`isAdmin: true`) e i percorsi `/goals` e `/ai-coach` sono accessibili solo a questo UID.

---

## Consumers di buildInsights

| File | Nota |
|------|------|
| `InsightsScreen.tsx` | passa `portfolio` |
| `InsightsScreenV2.tsx` | passa `portfolio`, `isAdmin`, `budgets`; scrive il pool `derived/encouraging` una volta per sessione |
| `Dashboard.tsx` | passa `portfolio` |
| `DashboardV2.tsx` | passa `portfolio` |

---

## Pool "encouraging"

`InsightsScreenV2` scrive in `users/{uid}/derived/encouraging` gli insight con `tone === 'positive'`, una sola volta per sessione utente (guard con `Set<string>` module-level). La Cloud Function `sendEncouragingInsight` legge questo pool ogni 48h per scegliere cosa mandare, filtrando per `minDepth` dell'utente.

---

## Previsione (Forecast V3)

Il motore di previsione attivo in produzione è **V3** (`forecastEngineV3.ts`). Il vecchio V2 è rimosso da `insightsEngine.ts`. Tutti i consumer passano `forecastV3Categories`.

Funzioni chiave:
- `computeForecastV3(transactions, categories, now)` → dati grezzi per categoria
- `forecastSavingsV3(transactions, categories, monthlyIncome, monthlyInvestments, now)` → `MonthForecast`
- `forecastBehaviorV3(transactions, categories, now)` → comportamento per UI
- `forecastByCategory(transactions, categoryIds, now)` → stima per ogni categoria (per BudgetScreen)
- `robustAvg(values)` → media con winsorizing (cap a 2.5× mediana)

---

## Regole Firestore (principali)

```
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
  match /meta/{doc} { allow read, write: if request.auth.uid == userId; }
  match /transactions/{txId} { allow read, write: if request.auth.uid == userId; }
  match /goals/{goalId} { allow read, write: if request.auth.uid == userId; }
  match /derived/{doc} { allow read, write: if request.auth.uid == userId; }
}
match /feedback/{fid} {
  allow create: if request.auth != null;
  allow read:   if request.auth.uid == 'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';
}
```

---

## Versioni recenti

| Versione | Data | Descrizione |
|----------|------|-------------|
| 1.9.32 | 2026-06-15 | Messaggi di incoraggiamento (push opt-in ogni ~48h) |
| 1.9.31 | 2026-06-15 | 4 insight avanzati admin-only (FASE 4) |
| 1.9.30 | 2026-06-15 | 5 insight medium (portafoglio, net-worth, abbonamenti, payday, anticipo) |
| 1.9.29 | 2026-06-15 | 5 insight minimali (autonomia, dormiente, cluster, prima volta, tasso risparmio) |
| 1.9.28 | 2026-06-15 | Rimozione branch V2 morto, aggiunto tone su tutti gli insight |

---

## Regole di lavoro

- **Mai force-push o rebase cosmetici**
- **Nessun comando distruttivo senza conferma esplicita** (push, rm, deploy)
- **Non riscrivere Sunny da zero**, non rimuovere funzionalità esistenti
- **Non applicare bias a componenti fissi/ricorrenti** nelle previsioni
- **Deploy solo via CI** (push a `main`) — mai `firebase deploy` diretto dal branch
- Admin gate UID: `qPtCOJGRrwOZ2EfjxMHwW6ZISXX2` — non modificare senza conferma

---

## Comandi utili

```bash
# Build client
cd sunny && npm run build

# Test insight engine
cd sunny && npm test

# Build functions
cd functions && npm run build

# Verifica tipi
cd sunny && npx tsc --noEmit
cd functions && npx tsc --noEmit

# Stato git
git log --oneline -10
git status
```

---

## Prossimi possibili task

Il piano in `.github/plans/joyful-weaving-turing.md` descrive **Sunny UI User-Friendly (v2.0.0)** — refactor visivo di nav label, dashboard, insights grouping, settings, onboarding. Non ancora iniziato. Non obbligatorio.

Nessun task pendente al momento dell'ultimo merge.
