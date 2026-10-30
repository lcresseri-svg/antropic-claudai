# Wrapped macro areas and habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Raccontare le spese dalle macro aree alle singole voci e alle abitudini, conservando il Wrapped.

**Architecture:** Helper puro per aggregare categorie e identificare descrizioni/serie frequenti. YearWrapped espone i dati e seleziona le storie; componenti esistenti rendono le nuove storie e il riepilogo usando gli stessi token.

**Tech Stack:** React, TypeScript, Vitest, Playwright Chromium.

**Spec:** docs/superpowers/specs/2026-10-30-wrapped-macro-habits-design.md

## Global Constraints

- Massimo 13 storie, timer e gesti invariati.
- Macro risolte con resolveMacroId; nessuna deduzione semantica delle abitudini.
- Frequenza: almeno 3 spese reali su 3 date, ownShare positivo.
- Nessuna query, scrittura, dipendenza, modifica a rollout, permessi o formule esistenti.

## Review Focus

- Macro eliminata e omonima investimento: nessuna riassegnazione inventata.
- Rimborsi/condivisioni: totale e conteggio delle abitudini usano solo il residuo positivo.
- Serie rinominata e descrizione generica vuota: identità stabile senza unire spese anonime.
- Pari frequenza e input riordinati: risultato deterministico.
- Nomi lunghi e importi grandi a 320px: contenuto leggibile senza overflow.

### Task 1: Modello e selezione narrativa

Files: nuovo wrappedSpendingStories.ts e test; yearWrapped.ts e test; WrappedScreen.tsx e WrappedEntryCard.tsx.

Interfaces: buildWrappedMacroAreas(categories, getCat, macros) -> WrappedMacroArea[]; buildWrappedFrequentExpense(realized,getCat) -> WrappedFrequentExpense|null. YearWrapped aggiunge macroAreas e frequentExpense; input aggiunge macroCategories opzionale.

- [x] Test red per macro, legacy, eliminazione, ambito, netti, futuri, descrizioni, serie, soglie, tie e ordine storie.
- [x] Implementare helper e collegare settings ai builder.
- [x] Eseguire test mirati fino a green, mantenere tutti i totali precedenti.

### Task 2: Storie e riepilogo

Files: WrappedStories.tsx, WrappedSummary.tsx, nuovo WrappedSpending.test.tsx.

- [x] Test red per macro prima del dettaglio, messaggi veritieri, frequenza senza promesse di cadenza.
- [x] Render macro con prime tre righe etichettate e frequenza con totale/media; aggiornare note largest e topCategory.
- [x] Elenco macro e voce frequente nel riepilogo, mantenendo celle esistenti.
- [x] Test frontend completo e build produzione.

### Task 3: Verifica e consegna

Files: fixture/scenari browser, docs/evidence/wrapped-macro-habits, CHANGELOG.md.

- [x] Browser UI2/UI3, light/dark, 320/390/1440: sequenza, timer, tap, indietro, riepilogo, obiettivo, chiusura; edge senza macro/serie e nomi lunghi.
- [x] Revisione indipendente finale con casi del Review Focus; correggere eventuali rilievi con regressioni.
- [ ] Registrare esiti e screenshot; commit, PR, controlli verdi, merge e deploy automatico già autorizzati.
