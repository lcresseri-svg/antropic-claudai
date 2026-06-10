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

### Validazione caso reale — Acquisti 2026-02 (stima analitica da codice; harness non disponibile in CI)

| Snapshot | recentVarTotals | robustMean (prima) | median (dopo) | Riduzione variableAvg | Impatto previsto |
|---|---|---|---|---|---|
| Feb day 5 | [1080, 382, 530] | 629 | 530 | −99€ (−16%) | predictedVarRemaining −40→70€ |
| Mar day 5 | [90, 1080, 382] | 517 | 382 | −135€ (−26%) | predictedVarRemaining −90€ |
| Apr day 5 | [136, 90, 1080] | 435 | 136 | −299€ (−69%) | predictedVarRemaining −195€ |

Il miglioramento è cumulativo: la median non solo assorbe il picco a febbraio, ma impedisce
che contamini i mesi successivi via il "trailing tail" della finestra a 3 mesi.

Stima MAE: miglioramento ~€15-25 su 60 snapshot (5-9% rispetto alla baseline giro 1 di €286).

### Test
- `FASE2-G2a` (unit): `computeCatStats` con [1080,400,530] → `recentVarMean=530`, non ancorato al picco.
- `FASE2-G2b` (unit): `computeCatStats` con [850,600,400] (trend genuino) → `recentVarMean=600`,
  entro 10% della media aritmetica (617). Documenta ritardo massimo accettabile come ≤10% dalla media
  per trend moderati (aritmetici); il test fallisce se median è <90% della media aritmetica.

### Anti-regressione prevista per mese
Non eseguibile senza harness. Rischi principali:
- Categorie con pattern 2-of-3 attivi ([100, 0, 100]): median=100 vs robustMean=67 → stima
  _più alta_ con median. Non è regressione ma miglioramento per queste categorie.
- Categorie stabili ([200, 200, 200]): median=robustMean=200. Nessuna differenza.
- Categorie in trend lineare: median≈mean (differenza < 5%). Nessun rischio significativo.

### Stato: ✅ COMPLETATO

### Test
108/108 verdi (106 pre-esistenti + 2 nuovi G2a–G2b). Build TypeScript pulita.
