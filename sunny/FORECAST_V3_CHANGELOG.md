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

### Stato: ACCETTATO (decisione utente 2026-06-10)
La regressione di 2026-02 (+€31, 1,4% del mese) è rumore su base piccola.

### Test
106/106 verdi (100 pre-esistenti + 6 nuovi). Build TypeScript pulita.

---

## Giro 2 — 2026-06-10 · `recentVarMean`: robustMean → median (spike post-picco Auto/Acquisti)

### Causa
Sovra-previsione variabile sui mesi immediatamente successivi a un picco di spesa in categorie
`variable_frequent`/`variable_sparse`: errore +€230 su Acquisti e +€243 su Auto al snapshot
2026-02-05 (mese dopo il picco Jan 2026 di Acquisti €1080).

### Esclusione M9 (verificata prima della diagnosi)
Acquisti e Auto non sono categorie `fixed_monthly`/`periodic_fixed`; il gap locked-shortfall
(artefatto M9) non si applica. La diagnosi opera sull'errore variabile puro.

### Diagnosi causa-radice
In `forecastHistory.ts` (pre-fix):

```typescript
const recentVarMean = robustMean(recentVarTotals);  // k=3.0, n=3
```

Con n=3, `winsorize(k=3.0)` ha breakdown point 33%: un solo mese-picco corrompe la media.

Caso Acquisti snapshot 2026-02-05:
- `recentVarTotals = [1080, 382, 530]`; median=530, MAD=148
- `cap = 530 + 3.0×148 = 974`; `robustMean = (974+382+530)/3 = 629`

Il spike contamina il `recentVarMean` per i 3 mesi successivi al picco (restando in finestra):
- Feb 2026: recentKeys=[Jan=1080, Dec=382, Nov=530] → robustMean=629 (vs median=530)
- Mar 2026: recentKeys=[Feb=90, Jan=1080, Dec=382] → robustMean=517 (vs median=382)
- Apr 2026: recentKeys=[Mar=136, Feb=90, Jan=1080] → robustMean=435 (vs median=136)
  ← miglioramento maggiore: lo spike è all'ultimo posto nella finestra

### Motivo della scelta: median come estimatore L1

La median è scelta non per "rilevare" uno spike (nessuna soglia), ma per proprietà statistiche:
- **L1-ottimale** per n piccolo: minimizza la somma degli scarti assoluti.
- **Breakdown point 50%**: richiede che il 50% dei valori sia spike per corrompere la stima.
  Con robustMean e k=3.0 basta il 33% (un valore su tre).
- **Aritmetica preservata**: per progressioni lineari (trend reale), `median = mean`.
  Esempio: [850, 600, 400] → median=600 = mean=617 entro 2.7%. Il trend viene seguito.
- **Nessuna soglia arbitraria**: a differenza di k tighter (parametro) o finestra estesa
  (altra scelta di design), la median è l'unica alternativa senza nuovi iperparametri.

Auto: categoria volatile throughout (€1–741). La median non "doma" Auto; il modello la
classifica correttamente come `volatile_mixed` per via dell'alto CV, indipendentemente
dall'estimatore usato per recentVarMean.

### Modifica (1 file sorgente)
- `forecastHistory.ts`: `recentVarMean = robustMean(recentVarTotals)` → `median(recentVarTotals)`.
  `recentCountMean` rimane `robustMean` (i conteggi tx non hanno spike da ammortizzare).

### Risultato MISURATO su dati reali (stessi dati, stesso `now` 2026-06-10, 12 mesi × 5 snapshot)

Top-line vs baseline giro 1:
- MAE €286→**€287** (+0,3%, entro il rumore) · MedAE 186→**179** (−3,8%)
- WAPE 13,3%→**13,3%** (invariato) · R² 0,40→**0,40** (invariato)
- Bias −242→**−238**: NON peggiorato. La sotto-previsione sistematica si riduce
  leggermente — nessuna sovra-correzione da median (la median alza le stime nei
  pattern con mese-basso in finestra, compensando l'abbassamento sui pattern con picco).

### Anti-regressione per mese MISURATA (soglia X = 10% + pavimento €5)

| mese | MAE prima | MAE ora | Δ | Δ% | verdetto |
|---|---|---|---|---|---|
| 2025-06 | €70 | €63 | −€7 | −10% | miglioramento |
| 2025-07 | €146 | **€167** | **+€21** | **+14,4%** | **REGRESSIONE** |
| 2025-08 | €259 | €249 | −€10 | −3,9% | miglioramento |
| 2025-09 | €503 | €502 | −€1 | −0,2% | entro il rumore |
| 2025-10 | €64 | €67 | +€3 | +4,7% | entro il rumore |
| 2025-11 | €541 | €549 | +€8 | +1,5% | entro il rumore |
| 2025-12 | €242 | €233 | −€9 | −3,7% | miglioramento |
| 2026-01 | €838 | €834 | −€4 | −0,5% | entro il rumore |
| 2026-02 | €117 | €109 | −€8 | **−6,8%** | **miglioramento** ✓ |
| 2026-03 | €373 | €383 | +€10 | +2,7% | entro il rumore |
| 2026-04 | €117 | €119 | +€2 | +1,7% | entro il rumore |
| 2026-05 | €167 | €168 | +€1 | +0,6% | entro il rumore |

4 mesi migliorano, 7 entro il rumore, **1 regredisce: 2025-07 +14,4%** (+€21 in
assoluto, su un mese da €1.866 di spesa → errAbs passa da 7,8% a 8,9% del mese).

**2026-02 (il mese fragile del giro 1) MIGLIORA del 6,8%** — la median non lo peggiora.

### Causa della regressione 2025-07 (misurata via drill per categoria, prima/dopo)

Effetto simmetrico della median: ignora anche i mesi *bassi*, non solo i picchi.
- Acquisti, finestra luglio = [giu 342, mag 772, apr 767] → median 767 vs robustMean 627.
  Il giugno basso (342) è il valore scartato → stima più alta. Proiezione day 5: 812→826
  (reale 705, errore +107→+121).
- Auto, finestra = [494, 411, 70] → median 411 vs robustMean 325. Proiezione day 5:
  288→297 (reale 238, errore +50→+59).

Nota: per Acquisti la median (767) era più vicina al reale di luglio (705) come stima
di livello — l'errore extra viene dal blend pace/tail che già sovra-prevedeva e che la
variableAvg più alta amplifica. È il prezzo intrinseco e simmetrico dell'estimatore:
nessuna soglia può eliminarlo senza reintrodurre asimmetria arbitraria.

### Validazione caso reale — Acquisti 2026-02 MISURATA

| Snapshot | proj robustMean (prima) | proj median (dopo) | reale | err prima | err dopo |
|---|---|---|---|---|---|
| Feb day 5 | €320 | €309 | €90 | +230 | +219 (−11) |
| Feb day 10 | €292 | €278 | €90 | +202 | +188 (−14) |
| Feb day 15 | €224 | €212 | €90 | +134 | +122 (−12) |

Il miglioramento c'è ma è MOLTO più piccolo della stima analitica pre-misura (~€400→~€90
attesi). Motivo misurato: la previsione di Acquisti a day 5 è dominata dal segnale di coda
(tail median/P75 sui 12 mesi storici, con cap P75×1,25), non dal `recentVarMean`. La
riduzione di variableAvg (629→530, −16%) si traduce in −11€ sulla proiezione perché il cap
di coda era già il fattore vincolante. Il reale di febbraio (€90) è 2,4× più basso di
QUALSIASI mese dei 12 precedenti (range 212–1080): nessun estimatore basato solo sullo
storico lo avrebbe previsto a day 5. La parte restante dell'errore su Acquisti/Auto
2026-02 è un limite del segnale di coda, non dell'estimatore di livello.

### Stato: ⚠ STOP-TRIGGER — in attesa di decisione utente
La regola "nessun mese reale peggiora oltre il 10%" è formalmente violata su 2025-07
(+14,4%, +€21 assoluti). Trade-off misurato del giro 2: 4 mesi migliorano (incluso il
fragile 2026-02), bias e MedAE migliorano, MAE top-line invariato, 1 mese peggiora di €21.
Decisione richiesta: accettare il giro 2 o fare rollback a robustMean.

### Test
108/108 verdi (106 pre-esistenti + 2 nuovi G2a–G2b). Build TypeScript pulita.
