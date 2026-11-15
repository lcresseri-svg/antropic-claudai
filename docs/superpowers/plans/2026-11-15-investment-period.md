# Versamenti del periodo Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Aggiungere versamenti e capitale rimborsato filtrabili per periodo.
**Architecture:** Componente autonomo con controlli e hook esistenti, aggregatore puro per gli importi effettivi.
**Tech Stack:** React, TypeScript, Vitest.
**Spec:** docs/superpowers/specs/2026-11-15-investment-period-design.md

## Global Constraints
Nessuna modifica ai dati o alle valutazioni del portafoglio. Riutilizzare tutti gli intervalli esistenti.

## Review Focus
Confini di mese inclusivi; date future escluse; template/proiezioni esclusi; TFR non duplicato; prelievi non sottratti dai versamenti.

### Task 1: Riepilogo per periodo
- [x] Scrivere test in sunny/src/features/investments/investmentPeriodSummary.test.ts per confini, filtri, TFR, prelievi e ripartizione statistica.
- [x] Eseguire il test e verificare il fallimento.
- [x] Implementare investmentPeriodSummary(transactions, range) con deposits e returnedCapital arrotondati ai centesimi.
- [x] Creare InvestmentPeriodSummaryCard.tsx con useAnalysisPeriod, getPeriodRange e PeriodControls; inserire in InvestmentsScreen dopo il riepilogo portafoglio.
- [x] Verificare test, suite e build; rileggere il diff.

Verifica: 5 test dedicati superati; build completata. Suite generale: 1174 superati, 2 falliti in forecastBehaviorV3 (M9b) e recapExport (data generazione), aree non modificate. Test di rendering aggiunti per scheda e stato vuoto.

Verifica prima della PR: `TZ=UTC npm test` supera tutti i 1178 test in 119 file; `npm run build` completata. I due fallimenti locali sopra riportati dipendono dal fuso Europe/Rome; UTC coincide con il runner CI.
