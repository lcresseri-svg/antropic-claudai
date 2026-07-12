# IMPLEMENTATION_PROGRESS — consolidamento + funzioni admin

Branch: `claude/sunny-consolidate-refactor-87ug0n` · sessione 2026-07-12.
Solo decisioni, test, blocchi e prossimo passo (dettagli in HANDOFF.md).

## Fatto (commit sul branch)

1. Consolidamento frontend — rimossi V1 (Dashboard/Insights/Budget),
   ForecastV2Screen, flag sempre-true, barrel morti, sunny-preview.html;
   App.tsx → bootstrap; `src/app/` (routes lazy, header, editing hook,
   ErrorBoundary, banner offline). Bundle 702→~360 kB.
2. Functions monolite → moduli (nomi/regioni/schedule invariati, verificato
   sull'export compilato). App Check soft (`APPCHECK_ENFORCE` opt-in).
3. Flag centralizzati (`featureRollout.ts`, stadi deterministici) + Rules:
   meta/* specifiche legacy-compatibili, aiCoach read-only,
   forecastSnapshots validati, wealthSnapshots/monthlyPlans/
   derived-monthlyAggregates nuove.
4. Admin: Patrimonio V2 + snapshot (idempotenti, Europe/Rome, backfill
   dry-run reale/stimato/mancante) + liquidità disponibile + impegni.
5. Admin: ForecastService unificato (adapter V3/V4, breakdown che somma
   sempre alla stima) + backtest vs 4 baseline; Piano mensile V2;
   ranking insight V2 (un solo prioritario); Decision Coach deterministico.
6. Qualità: aggregati mensili predisposti (versionati+fallback), veri button
   in InvestmentsScreen, reduced-motion CSS, CI con typecheck/build/Rules,
   docs (README/ARCHITETTURA/HANDOFF) allineate.

## Decisioni chiave

- Serie patrimoniale ufficiale (versato) INTATTA: il rendimento del periodo
  resta 0 finché non c'è storico di snapshot (mai inventare valori storici);
  il rendimento latente è mostrato a parte.
- Il rollout dei flag si avanza SOLO in `featureRollout.ts`; l'admin vede
  tutto a ogni stadio; i dati sensibili restano autorizzati lato server.
- Backfill snapshot: month-end, sempre dry-run prima, qualità dichiarata.
- Il fallback `meta/{doc}` resta per i doc legacy non enumerati (hardening
  graduale, zero regressioni).

## Test

- Frontend: 440 unit test (376 baseline + 64 nuovi) — verdi.
- Rules: 31 test emulatore — verdi. Typecheck e build frontend/functions ok.

## Blocchi

- Nessuno. Gli E2E browser non esistono ancora (fuori portata della sessione).

## Prossimo passo

- Vedi "Prossimi passi possibili" in HANDOFF.md (rendimento storicizzato,
  paginazione con aggregati, split fisico insightsEngine, rollout flag,
  App Check enforcement, E2E).
