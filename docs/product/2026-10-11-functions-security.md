# Correzione audit Functions prima del merge Piano

L'11 ottobre 2026 l'utente ha autorizzato la correzione del controllo di sicurezza, la verifica e il successivo merge della PR #140, incluso il deploy automatico su main.

## Diagnosi e modifica

Audit iniziale riprodotto: 16 segnalazioni (11 moderate, 4 alte, 1 critica). Manifest e lockfile erano identici a main.

- firebase-admin 12.7.0 → 13.10.0: rimuove node-forge; conserva API namespace e compatibilità con Node 20.
- firebase-functions 5.1.1 → 6.6.0: peer compatibile con Admin 13. Tutti gli import applicativi sono già esplicitamente v2.
- Aggiornamenti compatibili del lockfile per busboy, grpc-js, proxy-addr, qs e dipendenze correlate; nessun audit --force, override arbitrario o allentamento della soglia di sicurezza.
- Nessuna modifica al codice delle funzioni, ai nomi esportati, alle regioni, alle schedule, alle regole applicative di cancellazione o ai dati degli account.

Riferimenti consultati: [Firebase Admin release notes](https://firebase.google.com/support/release-notes/admin/node), [Functions 6.0](https://github.com/firebase/firebase-functions/releases/tag/v6.0.0), [Functions 6.6](https://github.com/firebase/firebase-functions/releases/tag/v6.6.0).

## Verifiche e limiti

Installazione pulita dal lockfile, TypeScript e build; controllo npm audit --audit-level=high mantenuto. Smoke test locale con progetto demo: caricamento di tutte le 21 esportazioni Cloud Functions v2 senza invocare handler; rifiuto del bearer assente senza rete. Il controllo CI verifica anche il runtime Node 20 effettivo, mentre il runtime locale è Node 24.

Audit finale dopo installazione pulita: nessuna vulnerabilità alta o critica; 7 moderate nella catena uuid / google-gax / teeny-request / Firestore / Storage (il precedente audit di installazione ne riportava 8). Non si dichiara un audit totalmente privo di segnalazioni. La rimozione completa suggerita da npm richiede un ulteriore major di Admin (14, Node >=22 e rimozione namespace), separato da questo sblocco verificato del gate high/critical.

Le verifiche frontend, Rules e browser della funzionalità Piano sono documentate nel [resoconto Piano](2026-10-10-piano-implementation-results.md). Lo stato autorevole dei controlli remoti e del merge rimane sulla PR #140. Nessun deploy manuale dal branch.
