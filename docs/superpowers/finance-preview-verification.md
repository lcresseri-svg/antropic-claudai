# Anteprima locale: carte e rimborsi multipli

La preview usa i componenti reali dell’app e conserva i salvataggi soltanto nella memoria della pagina. Gli alias Vite sostituiscono Firebase; nessun database è inizializzato e le chiamate esterne sono bloccate nei test browser.

Avviare da `sunny`:

```sh
node node_modules/vite/bin/vite.js --config ui-preview/vite.config.mjs
```

Aprire `/ui-preview/index.html?financeCase&financeMonth=2026-10&financeDate=2026-10-28&ui=3&theme=light` sul server locale `127.0.0.1:4177`. `financeMonth` ancora le sorgenti e la decorrenza; senza parametro usa il mese corrente. `financeDate` sceglie la data contabile e usa oggi come valore predefinito. Gli altri schermi continuano a leggere l’orologio browser: lo script lo imposta alla stessa data per una verifica coerente.

Il caso contiene Banca test con saldo iniziale 1.000 €, Carta test con saldo iniziale zero e addebito il giorno 10 del mese successivo. Le due spese, di 60 € e 40 €, sono registrate il 2 e il 3 del mese sorgente nelle categorie Spesa e Casa. La preview applica la vista canonica delle distinte, gli effetti di cassa e l’attribuzione statistica dei rimborsi; i saldi provengono da `calculateAccountPositions`.

| Stato | Banca | Carta | Liquidità | Patrimonio | Costi residui |
| --- | ---: | ---: | ---: | ---: | ---: |
| Prima dell’addebito | 1.000 | −100 | 1.000 | 900 | 60 + 40 |
| Rimborso 80 sulla banca | 1.080 | −100 | 1.080 | 980 | 12 + 8 |
| Ricevuta modificata a 120 sulla banca | 1.120 | −100 | 1.120 | 1.020 | 0 + 0; guadagno 20 |
| Ricevuta eliminata | 1.000 | −100 | 1.000 | 900 | 60 + 40 |
| Addebito, senza rimborsi | 900 | 0 | 900 | 900 | 60 + 40 alle date originali |

In Movimenti, la selezione di due spese apre il modulo multiplo; una sola apre `RefundSheet`. Le righe di una ricevuta aprono lo stesso modulo e l’eliminazione riguarda l’intera ricevuta. I controlli locali aggiuntivi aprono anche distinta e ricevuta per riprodurre rapidamente ogni stato. L’output `#preview-finance-snapshot` espone i valori verificabili senza riscrivere le sorgenti.

Eseguire lo script soltanto dopo aver fermato le modifiche ai sorgenti:

```sh
SUNNY_BROWSER=/usr/bin/chromium SUNNY_NODE_PACKAGES=/workspace/cloud-setup/node_modules \
  node ui-preview/with-server.mjs credit-cards-refunds.mjs
```

La matrice comprende UI2/UI3, tema chiaro/scuro e larghezze 390/1440. Verifica selezione, rimborsi 80 e 120, identità della ricevuta, modifica/eliminazione, modulo singolo, distinta in sola lettura, prima/dopo la scadenza, salvataggi falliti e configurazione carta fallita. Salva screenshot e risultati in `sunny/ui-preview/artifacts/credit-cards-refunds/`; `SUNNY_EVIDENCE` consente una directory alternativa. La preparazione dello script non equivale alla sua esecuzione: gli esiti effettivi sono nel file `results.json` della sessione eseguita.
