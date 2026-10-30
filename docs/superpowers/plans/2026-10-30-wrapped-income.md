# Wrapped Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Dare alle entrate una storia riconoscibile e valorizzare gli incassi in crescita quando il confronto è valido.

**Architecture:** Il modello puro yearWrapped espone incassi, programmato e confronto tra incassi; WrappedStories e WrappedSummary riusano i componenti e token esistenti. Totali e funzionamento delle altre storie invariati.

**Tech Stack:** React, TypeScript, Vitest, preview Chromium già presente.

**Spec:** docs/superpowers/specs/2026-10-30-wrapped-income-design.md

## Global Constraints

Stile, temi, timer, gesti, accessi, formule preesistenti e salvataggi invariati. Nessuna query nuova o dipendenza. Nessuna crescita dichiarata usando entrate future.

## Review Focus

Periodi incompleti, riferimento zero, incassi in calo o invariati, bisestile, mese corrente e date delle carte; solo programmato; importi grandi su 320 px; sequenza e avanzamento automatici.

### Modello e racconto

- [x] Test rossi in yearWrapped.test.ts: incassi/programmate distinti, stessi giorni dei due anni, copertura non confrontabile, storni/trasferimenti esclusi, bisestile, nessun incasso e solo programmato.
- [x] Implementare campi incomeReceivedTotal, incomePlannedTotal e incomeComparison nel modello e aggiungere la storia income dopo expense.
- [x] Aggiungere WrappedStories e riepilogo con copia condizionale, importo e percentuale; test di rendering per crescita, parità, calo e dati insufficienti.
- [x] Test mirati verdi, suite completa e build; browser con fixture sintetiche di crescita/calo/assenza storico/programmate nei due temi, UI2/UI3 e mobile/desktop; regressione sequenza, obiettivo e chiusura.
- [ ] Revisione indipendente, evidenze, PR e pubblicazione secondo autorizzazioni persistenti dopo CI verde.

Revisione indipendente completata: un P2 sui ricorrenti in cache corretto con test rosso/verde. Corretto anche il testo del confronto tra 29 e 28 febbraio. Esiti locali in `docs/evidence/wrapped-income/README.md`; pubblicazione ancora da verificare con i workflow della PR.
