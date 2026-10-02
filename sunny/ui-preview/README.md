# Anteprima locale UI 3.0

Componenti reali e dati illustrativi, confine I/O separato. Nessun accesso al database e nessun bypass di autenticazione nell'app di produzione.

Avvio dalla cartella `sunny`: `node node_modules/vite/bin/vite.js --config ui-preview/vite.config.mjs`. Aprire `http://127.0.0.1:4177/ui-preview/index.html`.

Parametri solo per questa entry locale: `ui=2`, `theme=dark`, `user=normal`, `editor`, `generic`, `singleSave`, `awaitSave`, `failSave`, `applePay`, `edit=expense`, `edit=investment`, `notices`, `empty`, `noAi`, `noInvest`. Le rotte interne si raggiungono tramite navigazione; ricaricare una rotta senza l'entry locale apre l'app normale. Nessun parametro della preview modifica il resolver di produzione.

Script Node: `check.mjs` (dialog/draft/keypad/failure/backdrop), `matrix.mjs`, `interactions.mjs`, `accessibility.mjs`, `regressions.mjs` (print/settings/category/budget/investment). Richiedono Playwright, Edge e `SUNNY_NODE_PACKAGES` impostata alla cartella delle dipendenze Node che contiene Playwright. Screenshot e risultati vengono generati in `artifacts/`, esclusa da Git.

Le verifiche desktop emulate non certificano Safari/iPad reali, VoiceOver/NVDA o prestazioni su dispositivi fisici. Il controllo di contrasto campiona superfici composte solide/traslucide; non è un audit WCAG completo di tutti i grafici o gradienti.
