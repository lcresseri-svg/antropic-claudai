# Wrapped: una storia anche per le entrate

30 ottobre 2026. Base `db43070`, branch `feat/wrapped-income-story`. Dati sintetici locali; nessuna lettura di conti personali e nessuna scrittura remota.

La nuova storia segue Uscite, usando lo stesso impianto grafico: etichetta, numero grande, battuta e nota. Con un confronto valido e incassi in aumento dice «Beh dai: quest’anno sono entrati più soldi». La buona notizia compare anche nel riepilogo e nel confronto finale quando il bilancio delle spese è meno favorevole.

| Verifica | Esito |
| --- | --- |
| Suite frontend completa | 1.127 test passati in 114 file |
| TypeScript + Vite | Passati |
| Nuova storia nel browser | 22 scenari passati, zero errori di pagina |
| Percorso Wrapped preesistente | 4 percorsi completi: chiaro/scuro, 320/1440 px; 48 schermate registrate |
| Revisione indipendente | Un P2 sui ricorrenti in cache corretto con test rosso/verde |

## Casi verificati

| Scenario | Risultato atteso e osservato |
| --- | --- |
| Crescita | 30.000 € incassati contro 28.000 €, +2.000 € / +7,1%; storia e buona notizia nel riepilogo |
| Spese in aumento | Uscite 35.000 €, risparmiato negativo; la crescita delle entrate resta riconoscibile senza alterare i totali |
| Calo | 25.000 € contro 28.000 €; nessuna congratulazione né scheda di crescita |
| Parità | 28.000 € nei due periodi; incassi dichiarati in linea, nessuna crescita inventata |
| Storico assente | Totale leggibile, nessun confronto con un anno privo di dati |
| Storico incompleto | Mesi non corrispondenti: nessuna crescita attribuita alla maggiore copertura dello storico |
| Solo programmato | 4.000 € futuri, zero incassi: «Entrate in programma», «non ancora in tasca» |
| Incassi più programmato | 30.000 € reali + 4.000 € futuri; confronto positivo calcolato sui soli 30.000 € |
| Importo molto grande | 10 miliardi: numero adattivo, nessuno scorrimento laterale nel contenuto a 320 px |
| Ricorrenti in cache | Stesse regole di realizzazione nei due anni: 2.000 € contro 2.000 €, non un falso +100% |
| Bisestile | 29 febbraio confrontato con il 28 febbraio dell’anno precedente; il testo espone le due date reali |
| Movimenti estranei | Storni, trasferimenti e capitale disinvestito non diventano entrate; le annotazioni di cassa delle carte non alterano gli importi statistici |

La matrice comprende UI3 nei due temi a 320/390/1440 px e UI2 nei due temi a 390 px. Verificati avanzamento automatico dalla nuova storia, tap per avanzare, riepilogo, passaggio all’obiettivo, incremento/decremento, chiusura e conservazione del tema. La regressione controlla anche contrasto dei token nel tema chiaro e rilascio dell’editor prima di entrare nel Wrapped.

Palette, CSS, timer, gesti, finestra stagionale/admin, obiettivo e salvataggi invariati. Le formule e gli importi delle altre storie restano quelli esistenti. L’adattamento del numero si applica soltanto alla nuova storia. Nessuna prova su Safari/iPhone fisico.

## Screenshot e log

- [Storia, scuro](ui3-dark-390-growth-income.png)
- [Storia, chiaro](ui3-light-390-growth-income.png)
- [Riepilogo, chiaro](ui3-light-390-growth-summary.png)
- [Solo entrate future](ui3-light-390-planned-income.png)
- [Importo grande a 320 px](ui3-light-320-large-income.png)
- [Risultati dei 22 scenari](results.json)
- [Regressione Wrapped](regression/report.json)
- [Esiti sintetici](test-results.txt)

## Riproduzione

Avviare la preview da `sunny` e usare i casi `wrappedIncome=growth|decline|flat|noHistory|partial|planned|growthPlanned|large`. Gli script fissano l’orologio al 20 ottobre 2026 per confronti ripetibili.

```sh
node node_modules/vite/bin/vite.js --config ui-preview/vite.config.mjs
SUNNY_BROWSER=/usr/bin/chromium node ui-preview/wrapped-income.mjs
SUNNY_BROWSER=/usr/bin/chromium SUNNY_WIDTHS=320,1440 node ui-preview/liquid-wrapped.mjs
npm test
npm run build
```
