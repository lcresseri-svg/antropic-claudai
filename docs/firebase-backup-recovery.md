# Recuperare dati Firestore di Sunny

Progetto: `sunny-a2a98`. Database usato dall'app: `(default)`.

## Verificare l'ultimo backup utile

Apri [Google Cloud → Firestore → Database](https://console.cloud.google.com/firestore/databases?project=sunny-a2a98), seleziona `(default)` e la sezione **Backup**. Controlla data/ora dello snapshot e stato. Per recuperare una modifica errata scegli il backup pronto più recente **precedente all'incidente**, non necessariamente l'ultimo creato. I timestamp API sono UTC: confrontali con l'ora italiana dell'incidente.

In alternativa, da un terminale con accesso al progetto:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest firestore:backups:list --project sunny-a2a98 --json
npx firebase-tools@latest firestore:backups:schedules:list --project sunny-a2a98 --database '(default)' --json
npx firebase-tools@latest firestore:databases:get '(default)' --project sunny-a2a98 --json
```

Nell'elenco verifica `database`, `state: READY`, `snapshotTime`, `expireTime` e `name`. L'elenco può comprendere più database: usa solo i backup del database interessato. Se la risposta contiene località `unreachable`, l'elenco può essere incompleto. Un errore di autenticazione o permessi non significa che non esistano backup.

L'ultimo comando mostra anche `pointInTimeRecoveryEnablement` ed `earliestVersionTime`. Se PITR è disponibile per l'istante necessario, si può recuperare uno stato più preciso del backup giornaliero. Attivarlo adesso non ricrea retroattivamente sette giorni di cronologia.

## Ripristinare una copia separata

Dalla console scegli il backup e **Ripristina**, indicando un **nuovo ID di database**, per esempio `sunny-recovery-20261102`. Oppure sostituisci il percorso segnaposto con il `name` esatto del backup:

```bash
npx firebase-tools@latest firestore:databases:restore \
  --project sunny-a2a98 \
  --database sunny-recovery-20261102 \
  --backup 'projects/sunny-a2a98/locations/LOCALITA/backups/ID_BACKUP'
```

Attendi il completamento dell'operazione e apri quel database nella console. Il comando avvia un ripristino: il suo successo iniziale non indica che i dati siano già pronti. Il database di destinazione deve essere nuovo; il ripristino non sovrascrive `(default)` e Sunny continua a usare il database attuale. Non cambiare la configurazione dell'app per puntarla alla copia di recupero.

Per una modifica errata di serie, confronta `users/UID/transactions` tra copia e produzione usando gli ID dei documenti e `seriesId`. Individua soltanto le occorrenze già contabilizzate interessate: importo, categoria, conto, data, note, quote condivise e collegamenti a storni. Conserva una copia dello stato attuale prima di applicare correzioni selettive. Non importare indiscriminatamente l'intero database: perderesti le modifiche valide avvenute dopo il backup.

Per gli investimenti, controlla anche `valueEffect` e `users/UID/meta/settings` (controvalori delle categorie); per rimborsi e carte verifica ricevute e addebiti collegati. Ripristinare soltanto l'importo del movimento può lasciare incoerenti valori aggiornati da altre scritture. La correzione selettiva va preparata come confronto prima/dopo degli ID coinvolti, poi applicata con la semantica finanziaria dell'app.

## Se non trovi un backup

Verifica il periodo disponibile tramite PITR e gli eventuali export Firestore in Cloud Storage. Un export Cloud Storage è diverso da un backup pianificato e non compare necessariamente in `firestore:backups:list`. Un vecchio JSON esportato da Sunny può aiutare a ricostruire i movimenti del tuo account, ma non è un backup completo del database Firebase. Senza una copia/versione precedente, i valori sovrascritti non sono ricostruibili con certezza.

## Verifica effettuata in questa sessione

Il 2 novembre 2026 il comando di sola lettura `firestore:backups:list` nell'ambiente di sviluppo ha restituito **Failed to authenticate, have you run firebase login?**. Non è quindi stato possibile verificare esistenza, data o contenuto dei backup del progetto. Nessun ripristino o scrittura sui dati di produzione è stato eseguito.

Comandi controllati rispetto alla CLI Firebase installata e documentazione ufficiale:

- [Backup pianificati e ripristino](https://firebase.google.com/docs/firestore/backups)
- [Recupero point-in-time (PITR)](https://firebase.google.com/docs/firestore/use-pitr)
