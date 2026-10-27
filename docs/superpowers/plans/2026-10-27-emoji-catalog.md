# Global Emoji Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Catalogo globale consultabile e ampliabile dall’admin, nuove emoji selezionabili da tutti.

**Architecture:** Dominio Unicode e repository Firestore separati dalla gestione UI. Provider con listener per l’app autenticata; preview con adapter in memoria. Le regole autorizzano creazione soltanto all’identità admin esistente.

**Tech Stack:** React, TypeScript, Firebase Firestore, Vitest, Playwright/Chromium.

**Spec:** docs/superpowers/specs/2026-10-27-emoji-catalog-design.md

## Global Constraints

- Nessuna dipendenza nuova, modifica a Wrapped, formule, dati finanziari o rollout UI3.
- Aggiunte globali per tutti gli utenti autenticati; gestione e creazione soltanto admin.
- Ogni documento contiene emoji e createdAt; aggiornamenti ed eliminazioni non necessari e negati.

## Review Focus

- Duplicati con variation selector o salvataggi concorrenti: un solo elemento aggiunto.
- Emoji composte, carnagioni e bandiere: conservare la sequenza Unicode.
- Errori di rete o permessi: nessun falso successo e input conservato.
- Cambio account: nessuna autorizzazione admin ereditata o listener residuo.
- Catalogo non disponibile: selettori integrati utilizzabili; admin può riprovare.

### Task 1: Dominio, repository e regole

Files: shared/emojiCatalog.ts, shared/emojiCatalogStore.ts, relativi unit, firestore.rules e firestore-tests/rules.test.ts.

Interfaces: emojiKey(string):string; mergeEmojiChoices(string[]):string[]; validateEmojiInput(string,readonly string[]):string. subscribeCatalog(next,error):()=>void; insertCatalogEmoji(string):Promise<void>.

- [x] Scrivere prove per Unicode, duplicati e conservazione dell’elenco integrato; osservarle fallire.
- [x] Implementare validazione, merge e scrittura transazionale con id deterministico.
- [x] Provare nell’emulatore lettura autenticata, creazione admin, rigetto scritture normali/anonime, dati malformati e update/delete; verificare le regole nuove.

### Task 2: Gestione e consumo

Files: providers/EmojiCatalogProvider.tsx, settings/EmojiCatalogManager.tsx, SettingsScreen.tsx, settingsNavigation.ts, App.tsx, EditDefSheet.tsx; adapter e ingresso preview.

- [x] Aggiungere flusso browser che fallisce per menu assente e prova creazione, duplicati, caricamento/errore, cambio account e selettore utente normale.
- [x] Collegare provider/listener, sezione admin in Gestione, lista completa e campo Unicode con esiti reali.
- [x] Consumare catalogo nel selettore condiviso mantenendo espansione, colori e salvataggio; adapter preview esclusivamente locale.
- [x] Eseguire flussi nei due temi e versioni, mobile/desktop; unit completi e build.

### Task 3: Revisione e pubblicazione

- [x] Revisione indipendente dei permessi, concorrenza e regressioni.
- [x] Evidenze e descrizione PR riscritte sul risultato finale.
- [ ] CI verde; merge e deploy autorizzati, verificare anche pubblicazione delle regole.
