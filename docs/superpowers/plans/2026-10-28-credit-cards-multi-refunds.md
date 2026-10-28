# Credit Cards and Multi Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Addebiti carta differiti e idempotenti, rimborsi di più spese con residuo proporzionale e guadagno separato.

**Architecture:** Dominio puro delle carte condiviso dal client e dal backend, distinte come transfer con id deterministico e metadata protetti. Ricevute rimborso come gruppi di refund compatibili con i consumatori esistenti e income per eccedenza, con repository transazionale e controlli per sorgente. Integrazione UI e aggregati conserva acquisti e statistiche nelle date originali.

**Tech Stack:** React/TypeScript, Firebase client/Admin SDK, Firestore emulator, Vitest, Chromium fixture preview; nessuna nuova dipendenza.

**Spec:** docs/superpowers/specs/2026-10-28-credit-cards-multi-refunds.md

## Global Constraints

- Wrapped, formule del Piano, ordine dei campi movimento e rollout UI3 invariati.
- Decorrenza carta scelta, inizialmente mese corrente; storico precedente immutato.
- Residuo rimborsi sulle categorie/mesi originali, singolo modulo attuale invariato.
- Tutti gli importi di riconciliazione/allocazione in centesimi; server e client stessa logica.
- Nessun accesso a dati privati nelle prove; nessuna operazione bancaria esterna.

## Review Focus

- Gennaio31→febbraio e dicembre→gennaio senza deriva; Europe/Rome e app aperta oltre mezzanotte.
- Quote condivise, rimborsi su banca o carta e crediti riportati senza doppi addebiti.
- Concorrenza/retry, modifica data/conto/importo, disattivazione e archiviazione carta.
- Sorgenti dei rimborsi modificate/eliminate o residue cambiate mentre il modulo è aperto.
- Cancellazione completa, collegamenti, modalità offline/errore e nessuna falsa conferma.

### Task 1 — Dominio carte e backend

Files: functions/src/domain/creditCards.ts, functions/src/creditCards.ts, functions/src/index.ts, workflow deploy-functions, unit dominio e test emulator.

Interfaces: CreditCardPolicy {fromMonth,enabled,paymentDay,paymentAccountId}; CreditCardSettlement {cardId,period,paymentDay,paymentAccountId,policyFromMonth}. Account.creditCardPolicies?:CreditCardPolicy[]. Transaction.creditCardSettlement?:CreditCardSettlement. Dominio esporta creditCardPolicyForMonth(account,period), deferredCardDelta(transaction,account), buildCreditCardSettlements(transactions,accounts,todayISO), resolveCreditCardTransactions(transactions,accounts,todayISO), withCreditCardCashEffects(transactions,accounts). Ultimo aggiunge cashDelta derivato, mai persistito.

- [x] Test rossi su addebito unico,31/bisestile/anno, decorrenza, quote condivise, crediti, rimborsi, cambio configurazione e idempotenza.
- [x] Implementare transfer canonici e riconciliazione server transazionale con query lette all’interno; usare helper di data Roma.
- [x] Trigger di cambi movimenti/configurazione e scheduler/catch-up; aggiungere gli export al deploy esplicito.
- [x] Emulatore: stessi ID sotto concorrenza, variazioni di importo/data/conto, cancellazione sorgenti e nessuna ricreazione dopo reset.

### Task 2 — Dominio e repository rimborsi

Files: sunny/src/shared/multiRefunds.ts, sunny/src/features/transactions/refundReceiptStore.ts, MultiRefundSheet.tsx, unit ed emulator. Parent integra tipi, hook e bulk.

Interfaces: refundGroupId opzionale separato da groupId. Una riga refund per sorgente, income con categoria sistema per eccedenza; receiptId stabile. Il repository coordina anche singoli storni nuovi e modifica/eliminazione di ricevute tramite controlli per sorgente. Nessuna scrittura di refundedTotal sulle spese.

- [x] Test rossi:60/40, ricevuto80/100/120, storni precedenti e quote condivise, arrotondamenti e selezioni incompatibili.
- [x] Implementare allocazione proporzionale con totale esatto e modulo multiplo con conto/data/nota e anteprima dei residui/guadagno.
- [x] Salvataggio/modifica/cancellazione atomici e idempotenti; transazioni impediscono sovraallocazione concorrente.
- [x] Emulatore: retry, due ricevute contemporanee, gruppo edit/delete e sorgenti assenti o modificate.

### Task 3 — Integrazione Sunny

Files: types.ts, SettingsScreen/EditDefSheet, shared financialFlow/useTransactions, financial projections/wealth analytics, TransactionList, useTransactionEditing, App/AppRoutes; firestore.rules; preview adapter/fixtures.

- [x] Collegare configurazione datata carta e validazione del conto abbinato senza perdere campi esistenti.
- [x] Applicare vista canonica e cashDelta a tutti gli aggregati di cassa; separare debito dalla liquidità mantenendolo nel patrimonio. I totali statistici continuano a usare le spese originali e ownShare.
- [x] Proteggere distinte da editing ordinario; dettaglio leggibile; data Roma aggiornata con app aperta.
- [x] Azione Rimborso in selezione multipla: singolo→modulo esistente, più spese→modulo multiplo; lifecycle di gruppo e blocchi delle sorgenti invalidanti nei CRUD, bulk e replaceGroup.
- [x] Regole per metadata sistema e nuovi controlli, test di accesso e integrità; strip dei campi derivati in ogni percorso di scrittura.

### Task 4 — Verifica e consegna

- [x] Build frontend/functions, unit completi ed emulator con esiti reali.
- [x] Browser UI2/UI3, chiaro/scuro, mobile/desktop: configurazione, flusso carta prima/dopo scadenza, saldo/liquidità/patrimonio/grafici e rimborsi singoli/multipli con successo/errore/scarto/focus.
- [x] Revisione indipendente, correzione rilievi, inventario e screenshot.
- [ ] Branch e PR con descrizione finale e CI verdi; completare pubblicazione secondo autorizzazioni persistenti e verificare hosting, regole e funzioni necessarie.

Implementazione e verifiche locali concluse. Esiti, limiti, inventario e screenshot: `docs/evidence/credit-cards-refunds/README.md`. Ultimo passo di pubblicazione da verificare tramite i workflow del commit che verrà integrato.
