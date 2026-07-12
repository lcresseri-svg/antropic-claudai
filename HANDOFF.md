# Sunny — Stato del progetto al 2026-07-12

> **Versione corrente:** `1.14.0` · **branch attivo:** `claude/sunny-consolidate-refactor-87ug0n`
> Dettagli tecnici in ARCHITETTURA.md · registro lavori in IMPLEMENTATION_PROGRESS.md

---

## Stack

| Layer | Tecnologia |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite (PWA) |
| Stile | Tailwind CSS + variabili CSS custom (dark/light, reduced motion) |
| Backend dati | Firebase Firestore + IndexedDB offline |
| Auth | Firebase Auth — solo Google Sign-In (+ App Check opzionale) |
| Cloud Functions | Node 20, `europe-west1`, moduli per dominio |
| AI | Gemini REST via Cloud Function (chiave server-side, rate-limit) |
| Push | Firebase Cloud Messaging (FCM) |
| Deploy | GitHub Actions → Hosting + Functions (solo push a `main`) |

---

## Cosa è stato consolidato (refactor 2026-07)

- **Una sola versione ufficiale** di Dashboard (`DashboardV2`), Insights
  (`InsightsScreenV2`) e Budget (`BudgetScreenV2`): i componenti V1 e la
  ForecastV2Screen (route) sono stati rimossi. Il motore forecast V2 resta
  come baseline di confronto nel V3 screen e nei backtest.
- **App.tsx = solo bootstrap** (splash, auth, provider). Shell in `src/app/`:
  `AppRoutes` (schermate lazy — bundle principale 702 kB → ~360 kB),
  `AppHeader`, `useTransactionEditing`, `ErrorBoundary`, `SyncStatusBanner`
  (stato offline).
- **Functions divise in moduli** (recurring / notifications / ai / shortcuts /
  metrics / deletion / feedback / shared); `index.ts` fa solo re-export, nomi
  regioni e schedule invariati.
- **Rules rafforzate**: `meta/{doc}` generico sostituito da regole specifiche
  validate (fallback owner-only per i doc legacy non enumerati);
  forecastSnapshots validati (sempre create-only); nuove collezioni
  `wealthSnapshots`, `monthlyPlans`, `derived/monthlyAggregates`.
- **CI** (`ci-tests.yml`): typecheck + test + build frontend, typecheck +
  build + audit functions, test Rules su emulatore.

## Funzioni nuove (SOLO admin, flag in `shared/featureRollout.ts`)

Tutte a stadio `admin`; rollout futuro deterministico
admin → allowlist → percentuale → tutti. UID admin: `qPtCOJGRrwOZ2EfjxMHwW6ZISXX2`
(replicato in firestore.rules e functions/shared.ts — tenere in sync).

| Flag | Cosa | Dove |
|------|------|------|
| `wealth_v2` | Patrimonio V2: decomposizione Δ = risparmio netto + rendimento + rettifiche, composizione, freschezza controvalori; snapshot patrimoniali idempotenti + backfill dry-run | `/wealth-v2`, `features/wealth/` |
| `available_cash` | Liquidità disponibile = liquidità − impegni (7/14/30gg/fine mese) − riserva, mesi di autonomia, spiegazione | card in `/wealth-v2` |
| `commitments` | Impegni: abbonamenti/rate/ricorrenti, costo mensile equivalente, residui, scadenze 30gg | `/commitments` |
| `monthly_plan_v2` | Piano mensile V2 (`monthlyPlans/{YYYY-MM}`): semina da mese precedente o ricorrenti+stagionalità, conferma esplicita, piano≠consuntivo≠forecast | `/monthly-plan` |
| `forecast_unified` | ForecastService: contratto unico su motori V3/V4 + backtest vs 4 baseline naive (MAE/MdAE/bias/err.rel./coverage) | pannello in `/forecast-v3` |
| `insight_ranking_v2` | Ranking deterministico (impatto/urgenza/confidenza/novità/azionabilità), 6 domini, un solo insight prioritario in cima | Consigli |
| `decision_coach` | Scenari deterministici acquisto/taglio/rinvio (l'AI spiega, non calcola) | pannello in AI Coach |

I dati di queste funzioni sono comunque autorizzati lato server (Rules).

## Regole di lavoro (invariate)

- Mai force-push o rebase cosmetici; nessun comando distruttivo senza conferma.
- Deploy SOLO via CI (push a `main`); mai `firebase deploy` dal branch.
- Non modificare silenziosamente i risultati finanziari esistenti: le serie
  ufficiali (versato-based) sono rimaste intatte; ogni nuova metrica è additiva.
- Admin gate UID: non modificare senza conferma.

## Comandi utili

```bash
cd sunny && npx tsc --noEmit && npm test && npm run build
cd functions && npx tsc --noEmit && npm run build
npx -y firebase-tools@13 emulators:exec --only firestore --project sunny-test \
  "npm --prefix firestore-tests run test"
```

## Prossimi passi possibili

1. Storicizzare il rendimento: quando esistono wealthSnapshots sufficienti,
   popolare `investmentReturn` nella decomposizione di Patrimonio V2
   (oggi 0 per non inventare storia).
2. Paginazione transazioni: `shared/monthlyAggregates.ts` è pronto
   (versionato, rigenerabile, fallback); manca il repository che carica solo
   la finestra recente e usa gli aggregati per trend/medie.
3. Split fisico di `insightsEngine.ts` nei 6 domini già classificati dal
   ranking V2.
4. Rollout: avanzare i flag per stadi dal registro centrale; App Check
   enforcement (`APPCHECK_ENFORCE=true`) dopo il monitoraggio dei log.
5. E2E dei flussi principali (aggiungi/modifica/serie) — oggi coperti da
   440 unit test + 31 test Rules, nessun E2E browser.
