# FORECAST V3 — Changelog FASE 2 (loop di miglioramento su dati reali)

Convenzioni: errore = previsto − reale (positivo = sovrastima). Metriche dal
backtest canonico `runBacktestV3` (12 mesi, 5 snapshot/mese, filtro as-of attivo)
eseguito via `scripts/forecastRealDataHarnessV3.ts` su export reale `sunny-dati`.
I dati reali e le baseline NON sono nel repo (gitignored).

---

## Giro 1 — 2026-06-10 · Classificazione `stale`: inattività consecutiva, risveglio, guardia di recency

### Misura baseline (pre-fix)
MAE €297 · MedAE €194 · WAPE 13,8% · bias **−€265** (sotto-previsione sistematica) · R² 0,36 · biasFactor saturo a 1,25.
Componente variabile: bias −€496. Peggior behavior per errore sistematico: `stale`
(105 campioni, bias −€82/campione ≈ metà del bias totale; previsto = 55% del reale).

### Diagnosi causa-radice
1. `detectStaleCategoryV3` contava i mesi inattivi **non consecutivi**: 2 mesi
   inattivi qualsiasi negli ultimi 3 facevano scattare stale anche con il mese
   scorso attivo (osservato su categoria reale riattivata: nov✗ dic✗ gen✓ → stale
   → coda azzerata → errore −100% su quella categoria).
2. Nessun **risveglio**: attività già registrata nel mese corrente non usciva
   dallo stato stale (coda zero con spese in corso).
3. (Emersa rimuovendo 1–2) Un **singolo mese attivo dopo dormienza** entrava nel
   percorso variabile pieno: `recentVarMean` su un solo mese-picco gonfiava la
   coda del mese successivo (sovra-previsione osservata sul backtest reale).
4. (Emersa rimuovendo 1–2) `detectFixedMonthlyV3` accettava 3/5 mesi attivi con
   importi dispersi ([200, 200, 300] → CV robusto 0 per MAD=0) e bloccava un
   importo che la categoria in dismissione non onorava più.
5. Il ramo `rare_variable` prediceva la coda scalata per frequenza per tutto il
   mese, anche al giorno 25 (mancava lo scaling per tempo residuo).

Esclusione M9 verificata PRIMA della diagnosi (vincolo): le due categorie
deterministiche flaggate "artefatto M9 — non correggere" dal rilevatore
(assicurazione annuale, finanziamento auto) non sono state toccate; il fix opera
su `stale`/`rare_variable`/`fixed_monthly` (classificazione), non sul gap di
scomposizione del backtest.

### Modifiche (3 file sorgente)
- `forecastBehaviorV3.ts`:
  - stale = inattività **consecutiva e finale** (conteggio trailing dai mesi più recenti);
  - risveglio immediato con attività nel mese corrente (`hasCurrentMonthActivity`);
  - guardia di recency: ≤ 1 mese attivo negli ultimi 6 → percorso `rare_variable`
    (stima scalata per frequenza), non percorso variabile pieno;
  - guardia di occupazione fixed: con 3/5 mesi attivi serve deviazione max ≤ 10%
    dalla mediana, altrimenti confidence `low`.
- `forecastEngineV3.ts`: coda `rare_variable` scalata per tempo residuo `(1 − prog)`.
- `forecastBehaviorV3.test.ts`: +6 test sintetici di reazione (G1a–G1f), incluse
  le regressioni intermedie osservate sui dati reali (risveglio, picco isolato).

### Risultato (vs baseline, stessi dati, stesso `now`)
- Top-line: MAE €297→€286 (−3,7%) · MedAE 194→186 · WAPE 13,8→13,3% · bias −265→−242 · R² 0,36→0,40.
- Campioni `stale`: 105→23 (restano solo categorie realmente ferme, forecast 0);
  82 campioni migrati a `rare_variable` con bias quasi bilanciato (−14 vs −82).
- Anti-regressione per mese (soglia 10% + pavimento €5): 6 mesi migliorano
  (fino a −22%), 5 invariati/entro il rumore, **1 regredisce: +36% MAE**
  (in assoluto +€31 ≈ 1,4% del totale mese, su una baseline mensile
  eccezionalmente buona; ridotta da +201% della prima iterazione).

### Stato: ⚠ STOP-TRIGGER — in attesa di decisione utente
La regola "nessun mese reale peggiora oltre il 10%" è formalmente violata su un
mese. Causa del residuo: piccole code `rare_variable` su categorie risorte
(false positive da ~€20–40/snapshot) e perdita della cancellazione fortuita con
le sovrastime pre-esistenti di due categorie variabili (presenti identiche anche
in baseline). Decisione richiesta: accettare il giro 1 o fare rollback.

### Test
106/106 verdi (100 pre-esistenti + 6 nuovi). Build TypeScript pulita.
