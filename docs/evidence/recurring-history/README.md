# Serie ricorrenti: conservazione dello storico

Verificato il 2 novembre 2026 su dati sintetici. Nessuna scrittura nel database di produzione.

## Difetti riprodotti e corretti

- `seriesInstanceUpdates` propagava il nuovo contenuto a tutte le occorrenze già registrate: ora seleziona solo quelle programmate dopo il giorno corrente Europe/Rome, preservando anche quelle di oggi.
- Le serie condivise legacy prive di `seriesId` potevano includere trasferimenti storici fra i documenti da ricostruire. Il gruppo del template è separato dalle occorrenze contabilizzate; le commissioni future di investimenti/trasferimenti restano editabili.
- Il modulo a rate conserva la prima data storica: salvandola nel template si poteva riavviare il recupero delle rate passate. I payload delle serie esistenti avanzano alla prossima scadenza futura, conservando giorno di riferimento e limite finale, comprese le commissioni collegate.
- Un'azione “Modifica serie” senza template poteva ripiegare sull'editing della vecchia occorrenza. Ora l'azione è disponibile solo con un template e il gestore verifica nuovamente la presenza prima di aprire l'editor.

## Esiti

| Controllo | Esito |
| --- | --- |
| Regressione storico prima del fix | 8 fallimenti attesi: helper, salvataggio nei quattro tipi, gruppo legacy |
| Regressione date prima del fix | 2 fallimenti attesi: rate e gruppo retrodatato |
| Cadenza dopo febbraio prima del fix | 1 fallimento atteso: marzo 28 anziché marzo 31 |
| Suite frontend completa | **1.163 test passati, 116 file** |
| TypeScript e build produzione (`npm run build`) | **Passati** |
| Revisione indipendente finale | Nessun nuovo P1/P2 residuo |
| Accesso elenco backup Firebase | Non autenticato: esistenza e data dei backup non verificabili da questa sessione |

I test esercitano i calcoli reali delle ricorrenze e il gestore di salvataggio; le scritture Firestore sono sostituite da spy, così si verificano ID e payload inviati senza dati reali. Copertura: spese, entrate, investimenti, trasferimenti, storico/oggi/futuro, serie legacy, rimborsi e quote storiche, commissioni, rate concluse, calendario/intervalli, cambio giorno, modifica esplicita della singola occorrenza e serie senza template.

La cessazione esplicita di una serie mantiene la precedente semantica: scollega le occorrenze passate senza cambiare i loro dati economici. La correzione non ricostruisce automaticamente dati eventualmente sovrascritti in precedenza. Per questo serve il confronto con un backup: [procedura](../../firebase-backup-recovery.md).

I log includono avvisi preesistenti Vite/Browserslist e dimensione bundle; nessun errore di test o build. Nessuna modifica a formule Piano, Wrapped, rollout o permessi.
