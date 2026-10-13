# Sunny UI 3.0 — piano di esecuzione

**Goal:** applicare 01-specifica.md e 02-schermate-e-flussi.md seguendo i lotti di 03-codex-e-verifiche.md.
**Architecture:** componenti React esistenti, conferma nativa nel top layer contenuta nell'editor; materiali positivamente circoscritti alla shell e agli overlay UI3. Nessun writer o gate nuovo.
**Tech Stack:** React 18, TypeScript, CSS, Vitest, preview Vite e Playwright Chromium.
**Spec:** tutti i documenti 01–03 in questa directory.

## Vincoli
Wrapped e suoi stili ereditati invariati. Resolver, permessi, formule e ordine del movimento invariati. Piano disponibile anche UI2. Nessun merge o deploy. Main di partenza a0085a7; importate solo le specifiche dal branch documentale.

## Fasi e verifiche
- [x] Baseline: tutte le route AppRoutes, controlli renderizzati, screenshot light/dark, hash Wrapped, suite UTC/Roma.
- [x] A: DiscardConfirmation e richiesta di chiusura condivisa; PlanDialog/PlanEditor, TransactionModal e SheetShell. Test prima della correzione: form montato, geometria/scroll entro 2px, focus conservativo, Escape singolo livello, quattro modalità di uscita, salvataggio/errore.
- [x] B: materiali in nuovo scope esplicito, senza token radice; verticale home/dettaglio/editor/scarto con screenshot e contrasto.
- [x] C: navigazione con identità entry/query, ritorno interno validato; quattro aree principali, informazioni progressive e grafici accessibili.
- [x] D: analisi, investimenti, impostazioni, onboarding e overlay; contratti di chiusura e copy reali; conservare gate.
- [x] E: typecheck, suite, build, test browser e stati, confronto Wrapped, inventario con limiti, commit e consegna del branch.

## Review focus
1. Dialog nativo sotto conferma: nessuna lotta tra focus trap.
2. Bozza locale Piano: scarto cancella solo la bozza pertinente.
3. Wrapped eredita token: verificare screenshot e stili, non solo hash.
4. Query e deep link: ritorno sicuro e posizione distinta.
5. Operazioni asincrone: una richiesta, errore conserva valori.

## Registro
- Baseline UTC: 819 pass, 5 skip. Roma: 817 pass, 2 fail, 5 skip (forecastBehaviorV3 e recapExport). Nessun codice modificato prima di queste misurazioni.
- Ambiente Linux: Chromium /usr/bin/chromium; gli script storici richiedono Edge. Rendere il browser configurabile senza modificare le asserzioni di comportamento.

## Direzione aggiornata dall'utente
Il 12 ottobre l'utente chiede esplicitamente una visione più nuova: meno schede rettangolari, sezioni aperte e divisori orizzontali. Questo supera il mantenimento dei contenitori precedenti. Gerarchia basata su spazio, tipografia e linee; glass concentrato su navigazione, controlli e overlay. Nessun cambiamento ai significati dei dati o a Wrapped.

## Revisione indipendente
Completata su interazioni, token Wrapped, query UI2/UI3, grafici, onboarding. Corretti indice grafico dopo cambio periodo, confine token della scheda Wrapped UI2, reset lista/scroll UI2 su cambio query, unità dei conteggi, riutilizzo demo e blocco navigazione durante salvataggio. Follow-up statico: nessun rilievo bloccante. Verifiche runtime distinte nella relazione 05.
