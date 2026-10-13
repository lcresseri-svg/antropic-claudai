# Anteprima locale Sunny

Piano usa ora la UI corrente ed è indipendente da UI3. `ui=3` forza il pilot nella preview per le verifiche di compatibilità. Dal 13 ottobre 2026 il resolver di produzione abilita UI3 per il solo admin già presente nella lista pilot; gli altri utenti restano in UI2.

Verifiche Piano: `node ui-preview/piano.mjs`, `node ui-preview/piano-acceptance.mjs`, `node ui-preview/piano-review.mjs`. Richiedono il server qui sotto, un browser Playwright e `SUNNY_NODE_PACKAGES` come gli altri script. Screenshot sintetici in `docs/product/piano-evidence/`; risultati e limiti in `docs/product/2026-10-10-piano-implementation-results.md`.

Componenti reali e dati illustrativi, confine I/O separato. Nessun accesso al database e nessun bypass di autenticazione nell'app di produzione.

Avvio dalla cartella `sunny`: `node node_modules/vite/bin/vite.js --config ui-preview/vite.config.mjs`. Aprire `http://127.0.0.1:4177/ui-preview/index.html`.

Parametri solo per questa entry locale: `ui=2`, `theme=dark`, `user=normal`, `editor`, `generic`, `singleSave`, `awaitSave`, `failSave`, `applePay`, `edit=expense`, `edit=investment`, `notices`, `empty`, `noAi`, `noInvest`. Le rotte interne si raggiungono tramite navigazione; ricaricare una rotta senza l'entry locale apre l'app normale. Nessun parametro della preview modifica il resolver di produzione.

Script Node: `check.mjs` (dialog/draft/keypad/failure/backdrop), `matrix.mjs`, `interactions.mjs`, `accessibility.mjs`, `regressions.mjs` (print/settings/category/budget/investment). Richiedono Playwright, un browser e `SUNNY_NODE_PACKAGES` impostata alla cartella delle dipendenze Node che contiene Playwright. Screenshot e risultati vengono generati in `artifacts/`, esclusa da Git.

Le verifiche desktop emulate non certificano Safari/iPad reali, VoiceOver/NVDA o prestazioni su dispositivi fisici. Il controllo di contrasto campiona superfici composte solide/traslucide; non è un audit WCAG completo di tutti i grafici o gradienti.

## Revisione Liquid Glass — preview admin

Avviare con `ui=3&theme=light` oppure `ui=3&theme=dark`. L’admin sintetico è il solo utente ammesso a UI3; `user=normal` resta UI2. Senza parametro `ui`, la preview segue il resolver di produzione: UI3 per l’admin pilot, UI2 per gli altri utenti.

Per Linux impostare `SUNNY_BROWSER=/usr/bin/chromium` e `SUNNY_NODE_PACKAGES` alla directory che contiene Playwright (in questo ambiente `/workspace/cloud-setup/node_modules`). Senza `SUNNY_BROWSER` resta il canale Edge degli script storici.

Esempio dalla directory sunny:
```sh
SUNNY_BROWSER=/usr/bin/chromium SUNNY_NODE_PACKAGES=/workspace/cloud-setup/node_modules node ui-preview/with-server.mjs liquid-suites.mjs
```

Suite aggiuntive: `liquid-details.mjs`, `liquid-onboarding.mjs`, `liquid-stress.mjs`, `liquid-wrapped.mjs`, `liquid-entry.mjs`. `liquid-baseline.mjs` con `SUNNY_MATRIX=1` cattura 19 rotte × 2 temi × 3 viewport; `SUNNY_EVIDENCE` sceglie la directory di output. `liquid-inventory.mjs` rigenera l’inventario AST dei controlli.

Nuovi scenari locali: `onboarding`, `login`, `import`, `failBulk`. `onboardingMemory&slowIo` simula soltanto scritture in memoria per verificare avanzamento e doppio tap, non inoltra chiamate a Firebase. Le altre scritture remote sono bloccate.

La consegna UI3 e gli screenshot sono in `docs/product/ui3-liquid-glass/`; gli script Piano scrivono ora in questa directory senza sovrascrivere le prove storiche.

Verifica overflow mobile: `node ui-preview/with-server.mjs liquid-mobile-overflow.mjs` usa `manyCategories` (15 categorie di spesa), entrambi i temi e larghezze 320/390/430. Il controllo misura lo scroller interno `#app-scroll`, non solo il documento. Per la matrice rotte si può impostare `SUNNY_WIDTHS=320,390,430`.
