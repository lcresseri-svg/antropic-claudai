# Correzione dei due importi storici admin

Confronto fornito dall'utente il 2 novembre 2026: 2078 transazioni nel clone, 2080 nel live, 2075 uguali, 3 diverse, nessuna mancante nel live, 2 presenti solo nel live. Nessun investimento/rimborso/addebito automatico fra le righe diverse.

Piano di recupero dello storico:

| ID | Data | Live | Importo originale nel clone |
| --- | --- | --- | --- |
| IesVmTQn37lRtyTGsri4 | 2026-09-30 | 0,74 € | 1,24 € |
| gRiRZwS2p5Cx2nNyHX27 | 2026-08-31 | 0,74 € | 234,33 € |

L'altra differenza è `recurring.until=2026-10-30` sulla regola PUuX02gWcltFs6smLcCN; il recupero storico conserva il termine impostato nel live. Riattivare la regola richiederebbe una decisione distinta, non necessaria a riparare i due importi passati.

Lo script `scripts/restore-admin-amounts.mjs` legge i due export locali, valida progetto/UID/database/ID/tipo/importi, crea un ulteriore file con le due righe originali e invia UNA commit Firestore con due update mask limitate a `amount`. Prima di applicare il recupero, legge nuovamente i due documenti live: gli importi già corretti vengono saltati, un importo diverso da 0,74 e dal valore atteso blocca tutto. Ogni write usa come precondizione l'updateTime appena letto. Un cambiamento successivo a uno dei documenti rifiuta l'intero commit, evitando sovrascritture concorrenti. I dati presenti solo nel live restano presenti.

Anteprima senza rete o scritture:

```bash
node restore-admin-amounts.mjs /home/luca_cresso03/sunny-recovery-2026-11-02T08-08-49-879Z
```

Esecuzione richiesta dall'utente, in Cloud Shell autenticata:

```bash
node restore-admin-amounts.mjs /home/luca_cresso03/sunny-recovery-2026-11-02T08-08-49-879Z --apply
```

Dopo il commit lo script salva la risposta e legge nuovamente entrambi i documenti dal live, stampando `RECUPERO COMPLETATO` soltanto se gli importi sono corretti. Un errore di precondizione richiede un nuovo confronto. Se la richiesta commit va in timeout, l'esito può essere incerto: verificare gli importi prima di ripetere. I trigger carta esistenti continuano a riconciliare gli eventuali movimenti collegati.

Verifica locale: 10 test passati su esportazione+recupero, incluse esecuzione CLI simulata, backup fresco prima della commit, due GET preliminari, una sola POST e due GET di verifica, scope fisso e protezioni updateTime. Nessuna scrittura Firestore reale effettuata dall'assistente; l'esecuzione effettiva è nell'ambiente Cloud Shell dell'utente.

Aggiornamento dopo FAILED_PRECONDITION segnalato dall’utente: nessuna rimozione delle precondizioni. Il recupero usa letture aggiornate e mantiene le altre modifiche del documento; l’eventuale concorrenza successiva alle nuove letture continua a rifiutare atomicamente la commit.
