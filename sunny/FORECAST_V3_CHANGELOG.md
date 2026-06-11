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

### Stato: ACCETTATO (decisione utente 2026-06-11)
La violazione formale su 2025-07 (+14,4%, +€21 ≈ 1,1% del totale mese) è accettata:
stesso ordine di grandezza del +€31 accettato come rumore nel giro 1, a fronte di
4 mesi migliorati (incluso il fragile 2026-02), MedAE e bias migliorati.
Baseline giro 2 salvata come riferimento per il giro 3.

---

## Giro 3 — 2026-06-11 · `periodic_fixed`: gap mediano < 2 mesi = pattern mensile, mai periodico

### Causa
Sotto-previsione sistematica su categorie frequenti classificate `periodic_fixed`
(flag harness: `missing_periodic_fixed`). Caso dominante: Uscite a giugno 2025 —
categoria sociale con 10-14 tx/mese prevista come "già pagata" al giorno 5.

### Esclusione M9 (verificata prima della diagnosi — vincolo)
Le categorie diagnosticate SONO `periodic_fixed`, quindi l'esclusione M9 è obbligatoria.
Il rilevatore dell'harness classifica gli errori come REALI, non artefatti:
- Uscite: |err totale| medio €255 vs actual medio €482 → errore vero
- Arrampicata: €88 vs €105 → errore vero
- Extra: €70 vs €17 → errore vero
Gli artefatti M9 confermati (Assicurazioni €5 di errore vero, Finanziamento auto €0)
non sono stati toccati.

### Diagnosi causa-radice
`detectGapInterval` accettava un gap mediano di **1 mese** come cadenza periodica
("ogni ~1 mesi"). Una categoria attiva in mesi consecutivi è l'opposto di periodica.
Concatenazione del bug per Uscite a giugno 2025:
1. Storia: attiva OGNI mese da giu 2024 → 12/24 mesi attivi → spendRatio
   esattamente 0,50 → passa il gate `> 0.50`;
2. gap tutti = 1 → mediana 1 → `detectGapInterval` → "irregular, ~1 mese" ≠ 0 → periodica;
3. importi mensili stabili (CV robusto 0,14 < 0,15) → confidence HIGH;
4. nel ramo `periodic_fixed` "mese attivo": `actualPeriodicSoFar > 0` →
   `periodicFutureExpected = 0` → la previsione collassa sull'actual del giorno 5
   → errore −€240 a inizio mese (reale giugno: €270).
Da luglio 2025 (13/24 = 54% > 50%) la categoria tornava `variable_frequent`: il bug
colpiva solo le finestre in cui spendRatio ≤ 0,50 — Uscite (giu 2025), Arrampicata
ed Extra (gap mediani 1–1,5) in vari snapshot.

### Motivo della scelta: fix definitorio, nessuna soglia tarata
"Periodico" significa per definizione cadenza NON mensile: il dominio mensile
appartiene a `fixed_monthly` (importi stabili, con il suo test dedicato) o ai percorsi
variabili (stima statistica). Il valore 2 non è un parametro ottimizzato: gap mediano
< 2 ⇔ attività in mesi (quasi) consecutivi ⇔ pattern mensile. I periodici veri
(trimestrale 3, semestrale 6, annuale 12, anche bimestrale 2) non sono toccati.

### Modifica (1 file sorgente)
- `forecastBehaviorV3.ts` (`detectGapInterval`): `if (med < 2) return { interval:
  'irregular', intervalMonths: 0 }` → il chiamante scarta la classificazione periodica.

### Test
- `FASE2-G3a` (unit): 12 mesi attivi consecutivi su 24 (spendRatio 0,50, gap 1,
  importi stabili) → NON periodica. FALLISCE sul codice pre-fix (verificato).
- `FASE2-G3b` (unit): cadenza trimestrale vera (gap 3) → resta periodica.
  Passa anche pre-fix: è la guardia di non-regressione sui periodici veri.
- `FASE2-G3c` (engine): categoria frequente attiva ogni mese, 1 tx da €20 al giorno 3,
  snapshot giorno 5 → behavior ≠ periodic_fixed e projected > €150 (il mese NON è
  considerato "già pagato"). FALLISCE sul codice pre-fix (verificato).

### Risultato MISURATO su dati reali (vs baseline giro 2, stesso `now` 2026-06-10)

Top-line:
- MAE €287→**€282** (−1,7%) · MedAE 179→187 (+€8) · WAPE 13,3→**13,1%**
- Bias −238→**−226** (la sotto-previsione si riduce: il fix RIPRISTINA code che il
  ramo periodico azzerava) · R² 0,40→**0,41**
- Per categoria: Uscite MAE €68→€63 · Arrampicata €37→€34 · Extra €28→€26
  (tutte e tre migliorano su base annua)

### Anti-regressione per mese MISURATA (soglia X = 10% + pavimento €5)

| mese | MAE prima | MAE ora | Δ | Δ% | verdetto |
|---|---|---|---|---|---|
| 2025-06 | €63 | €48 | −€15 | **−23,8%** | miglioramento (il mese del bug Uscite) |
| 2025-07 | €167 | €167 | €0 | 0% | invariato |
| 2025-08 | €249 | €228 | −€21 | −8,4% | miglioramento |
| 2025-09 | €502 | €508 | +€6 | +1,2% | entro il rumore |
| 2025-10 | €67 | **€78** | **+€11** | **+16,4%** | **REGRESSIONE** |
| 2025-11 | €549 | €522 | −€27 | −4,9% | miglioramento |
| 2025-12 | €233 | €228 | −€5 | −2,1% | entro il rumore |
| 2026-01 | €834 | €831 | −€3 | −0,4% | entro il rumore |
| 2026-02 | €109 | €111 | +€2 | +1,8% | entro il rumore |
| 2026-03 | €383 | €381 | −€2 | −0,5% | entro il rumore |
| 2026-04 | €119 | €119 | €0 | 0% | invariato |
| 2026-05 | €168 | €168 | €0 | 0% | invariato |

### Causa della regressione 2025-10 (drill per categoria)
Extra (gap mediani 1,5–2, importi piccoli): pre-fix era pseudo-periodica e nei mesi
"non attivi" prevedeva ~0 — risposta giusta per ragione sbagliata quando l'actual era
basso (ottobre: €10). Post-fix è `variable_sparse` e prevede una piccola coda
(€36-46 ai giorni 5-15) → +€30/snapshot su quel mese. Su base annua Extra MIGLIORA
(MAE €28→€26): è una ridistribuzione dell'errore, non un peggioramento della categoria.
+€11 medi su un mese da €1.427 = 0,8% del totale mese.

### Stato: ⚠ STOP-TRIGGER — in attesa di decisione utente
La regola "nessun mese reale peggiora oltre il 10%" è formalmente violata su 2025-10
(+16,4%, +€11 assoluti — il più piccolo dei tre giri: giro 1 +€31, giro 2 +€21).
Trade-off misurato: 4 mesi migliorano (fino a −23,8%), MAE/WAPE/bias/R² migliorano
tutti, 1 mese peggiora di €11. Decisione richiesta: accettare il giro 3 o rollback.

### Candidato residuo per il giro 4 (dal ranking aggiornato, esclusi M9 e Auto-volatile)
Soldi casa (`fixed_monthly`, bias +66, WAPE 104%): 12 pagamenti storici sempre nei
giorni 10-14, poi la categoria salta mesi interi (lug/set 2025) mantenendo il lock
€200 → +€200/snapshot anche ai giorni 15-25 quando il pagamento non può più arrivare.
Fix candidato: rilascio del lock quando lo snapshot supera il giorno massimo storico
di pagamento — richiede però la RISCRITTURA DEL CONTRATTO del test M4
("pagamento assente → proietta comunque il lock"), che oggi asserisce il
comportamento opposto al giorno 20. Da decidere esplicitamente prima di procedere.
Il bucket `stale` residuo (28 campioni, −€184/campione) è in gran parte irriducibile:
categorie dormienti da 6-17 mesi risvegliate da un singolo pagamento a fine mese
(Università €1.025 a gennaio, Cene €239 dopo 17 mesi) — nessun segnale nello storico.

### Test
111/111 verdi (108 + 3 nuovi G3a–G3c). Build TypeScript pulita.

### Test
108/108 verdi (106 pre-esistenti + 2 nuovi G2a–G2b). Build TypeScript pulita.
