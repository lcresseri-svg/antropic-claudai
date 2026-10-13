# Sunny UI 3.0 — implementazione e prove

Branch `feat/ui3-liquid-glass-2026-10-12`, dalla main aggiornata `a0085a766955c65032c754c2676c20bc3b67fe3f`. Le specifiche 01–03 sono state importate dal branch documentale senza ripristinare file applicativi da quel branch. Nessun merge o deploy.

## Risultato

La direzione richiesta il 12 ottobre usa sezioni aperte, divisori orizzontali, spazio e tipografia. Il vetro resta soprattutto su navigazione e livelli temporanei. Fondo bianco `#FFFFFF` e scuro `#050608`; marchio, colori delle categorie, emoji e convenzioni monetarie restano Sunny.

La conferma di scarto è un dialog nativo nel top layer, contenuto nell’editor: non sostituisce il form e non lo nasconde. X, Escape, backdrop e Annulla, dove presente, passano per la stessa decisione. Piano mantiene formule e draft mensili; la correzione funzionale del dialog serve anche UI2. Movimenti mantiene l’ordine dei campi.

I dettagli portano categoria/conto, tipo e intervallo esplicito ai movimenti. La memoria di navigazione distingue entry e query; la UI2 conserva il comportamento precedente sui cambi query. I grafici principali offrono tabelle dei campioni reali, segmenti senza extrema inventati, scale dichiarate e composizioni negative senza anelli fuorvianti. Entrate usa barre mensili; Patrimonio consente di mostrare/nascondere le serie secondarie mantenendo dominio e totale. Statistiche e consigli secondari sono progressivi.

Onboarding conserva i campi tornando indietro, apre l’importatore reale, conferma i dati di esempio e non li riscrive tornando allo stesso passo. Errori di risparmio e controvalore mantengono il contesto. Le operazioni bulk attendono l’esito e mantengono la selezione in errore.

## Isolamento

- `uiVersionConfig.ts`: **invariato**, `everyone:'2.0'`, `pilotAdmin:'2.0'`. Nessuna attivazione pubblica o admin in produzione.
- Preview separata: `ui=3` ammette soltanto l’admin sintetico previsto dal resolver. Utente normale e logout restano UI2. Gate di funzionalità e permessi invariati.
- Nessuna modifica a Rules, Functions, indici o formule Piano/forecast/financialFlow. Il writer del controvalore restituisce la Promise della stessa operazione e dello stesso payload, permettendo all’editor di attendere l’esito.
- Dati sintetici, rete remota bloccata dai test. Il solo scenario `onboardingMemory` registra contatori in memoria; non inoltra scritture Firebase.

## Verifiche

| Verifica | Esito | Prova |
|---|---|---|
| TypeScript | PASS | `evidence/tests/typecheck.log` |
| Vitest, UTC | 827 PASS, 5 skipped | `evidence/tests/unit-utc.log` |
| Vitest, Europe/Rome | 825 PASS, 2 FAIL preesistenti, 5 skipped | `evidence/tests/unit-rome.log` |
| Build produzione | PASS | `evidence/tests/build.log` |
| Suite browser | 21 suite PASS + grafici/import/stress finali PASS | `evidence/tests/results.json` |
| 19 rotte × 2 temi × 3 viewport | 114 render; nessun pageerror/overflow | `evidence/routes/routes.json` |
| 320 px + testo 200%, vuoto/categorie limite | 32 scenari; nessun pageerror/overflow dopo correzione | `evidence/stress/results.json` |
| Contrasto composito campionato | min. 4,66:1 chiaro; 9,94:1 scuro | `evidence/tests/accessibility-results.json` |
| Scarto | valori/focus invariati; offset entro 2 px; scrollHeight stabile | `evidence/tests/liquid-dismiss.mjs.log` |
| Dettagli, query, investimento | percorsi reali, intervalli e ritorni; errore controvalore conserva input | `evidence/tests/liquid-details.mjs.log` |
| Onboarding | errore, successo, ritorno, niente duplicati demo, scrittura lenta | `evidence/tests/liquid-onboarding.mjs.log` |

La baseline prima delle modifiche era 819 PASS/5 skipped in UTC e 817 PASS/2 FAIL/5 skipped in Europe/Rome. I due fallimenti Roma sono gli stessi: `forecastBehaviorV3` M9b e data di generazione `recapExport`. Non sono stati cambiati algoritmi o aspettative per farli passare. I cinque skip appartengono alla suite già esistente. Le prove baseline sono allegate in `evidence/tests/baseline-*`.

## Wrapped

Tutti i file in `src/features/wrapped/` mantengono gli hash originali. La route è esclusa dal nuovo scope; la scheda stagionale conserva i token ereditati della versione attiva.

- 24 screenshot di stories, riepilogo e obiettivo: **identici pixel per pixel** alla main estratta in una directory separata.
- Scheda stagionale UI2: screenshot identici nei due temi.
- Scheda stagionale UI3: stili computati ereditati e pixel interni identici. Il confronto rettangolare completo rileva solo la composizione degli angoli arrotondati con il nuovo fondo della pagina circostante. Nessun cambiamento di geometria, contenuto o comportamento della scheda.
- Timer residuo, pausa, swipe, obiettivo e chiusura verificati negli script; nessuna proprietà inert rimasta dopo gli editor.

Confronti: `evidence/tests/wrapped-comparison.json`, `entry-comparison.json`; immagini originali e attuali nelle rispettive directory. Clock fissato per confronti ripetibili.

## Limiti dichiarati

Non sono state misurate prestazioni su hardware fisico; i tempi di build/suite nei log descrivono solo questa macchina. Le prove browser sono Chromium Linux, anche con viewport touch emulati: non certificano Safari/iPhone reali, tastiere native, VoiceOver/NVDA o altri browser. Il test testo 200% cambia la dimensione radice; non equivale a tutte le modalità di zoom di ogni sistema. Contrasto campionato, non audit WCAG completo. Forced colors e reduced motion hanno prove emulabili; reduced transparency e assenza di backdrop-filter hanno fallback CSS, non prove su hardware dedicato.

Importazione, notifiche, AI, login e strumenti amministrativi usano il confine I/O della preview: nessuna chiamata esterna autentica o invio push è stato eseguito. Le scritture backend sono coperte dalle suite esistenti o simulate; questo non è un collaudo end-to-end Firebase. Export/condivisione nativa e cancellazione dell’account non sono stati eseguiti su dati reali.

L’inventario distingue controlli letti nel sorgente, controlli renderizzati e percorsi effettivamente azionati. Non dichiara cliccata ogni possibile combinazione di dati, gate e stato remoto.

## Riproduzione

Da `sunny`, impostare `SUNNY_BROWSER=/usr/bin/chromium` e `SUNNY_NODE_PACKAGES` alla directory contenente Playwright. `node ui-preview/with-server.mjs liquid-suites.mjs` avvia la preview e le suite; gli altri script sono documentati in `ui-preview/README.md`. Aprire `/ui-preview/index.html?ui=3&theme=light` oppure `theme=dark`; non ricaricare direttamente una route applicativa senza l’entry della preview.
