# Wrapped chiaro

19 ottobre 2026 — `feat/wrapped-light`.

Su richiesta esplicita dell’utente, Wrapped ora segue il tema di Sunny, in UI2 e UI3. Questa richiesta aggiorna il precedente vincolo di non modificare Wrapped limitatamente alla nuova palette chiara.

Fondo bianco, alone dorato leggero, superfici neutre e testi scuri. Oro del testo separato dal riempimento dei pulsanti; verde/rosso leggibili e istogramma più contrastato. Copertina, storie, riepilogo, obiettivo e stato vuoto condividono i token del contenitore. Nessuna modifica a calcoli, flussi, timer, animazioni, salvataggio o rollout. Il tema scuro conserva i valori precedenti.

## Verifica

- Build e TypeScript passati; 852 test unit passati, 5 skipped.
- Percorso completo delle 10 storie, riepilogo, obiettivo, incremento/decremento e chiusura su UI3 a 320/390/1440 px, chiaro e scuro; nessun overflow orizzontale del contenitore.
- Stesso percorso in UI2 a 390 px nei due temi.
- Tutti i sei colori semantici di testo verificati >=4,5:1 su bianco, superficie delle schede e punto più caldo dell’alone. Verificati separatamente i colori del pulsante principale.
- Tema dell’app conservato dopo la chiusura.
- 12 screenshot scuri a 390 px identici pixel per pixel alla baseline: 10 storie, riepilogo, obiettivo.
- Verifica visiva di copertina, riepilogo e obiettivo a 320/390 px. Test Chromium con dati illustrativi, nessuna prova su Safari fisico.

Applicata la skill UI/UX Pro Max: indicazioni sui colori semantici e contrasto leggibile, senza cambiare il linguaggio visivo delle storie.

[Evidenze e screenshot](evidence/wrapped-light/).
