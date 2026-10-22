# UI3.1 — metodo, skill ed evidenze

19 ottobre 2026. Metodo del [primo studio incrementale](studio-incrementale.md), conservato come audit dell’app esistente. La [nuova direzione](README.md) ha un prototipo e verifiche separati.

## Uso effettivo di UI/UX Pro Max

La copia locale citata nel precedente studio, `.agents/skills/ui-ux-pro-max/SKILL.md`, non è presente nel checkout o nei cataloghi di skill di questo ambiente. È stata recuperata la fonte pubblica ufficiale, senza aggiungerla agli asset o alle dipendenze di Sunny:

- repository: [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill);
- revisione esaminata: `56ea9cf174ed86786187daa9de0e6247cb0747e4`;
- [SKILL.md a quella revisione](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/56ea9cf174ed86786187daa9de0e6247cb0747e4/.claude/skills/ui-ux-pro-max/SKILL.md);
- copia di lavoro: `/workspace/scratch/ui-ux-pro-max-skill/`;
- letti anche `references/quick-reference.md` e `references/pro-rules.md`. Le regole native di quest’ultimo sono state distinte dalle regole applicabili alla PWA web.

I risultati sono stati verificati per dominio, identità e pertinenza. Non sono stati applicati automaticamente palette, font, librerie o API suggerite.

| Ricerca eseguita | Esito verificato | Uso nello studio |
|---|---|---|
| `personal finance dashboard minimal --design-system` | Mix di landing promozionale, Glassmorphism e font personali non pertinenti | Scartata come sistema completo; un tentativo più specifico |
| `finance banking dashboard --design-system` | Minimalism & Swiss Style pertinente; struttura commerciale e font proposti non giustificati per Sunny | Conferma solo semplicità, gerarchia e leggibilità; niente sostituzione del sistema Sunny |
| `back navigation hierarchy --domain ux -n 3` | Back Button, Breadcrumbs, Heading Hierarchy | Continuità del ritorno e titolo stabile. Breadcrumb solo dove la profondità lo richiede |
| `error summary validation --domain ux -n 3` | Focusable Error Summary, Error Messages, Error Placement | Errori vicini ai campi, annuncio e gestione del focus; riepilogo per errori multipli |
| `comparison trend time --domain chart -n 3` | Trend Over Time, Multi-Variable Comparison, Compare Categories | Linee per andamento, barre per confronto; tabelle e accesso tastiera. Radar non selezionato |
| `progressive disclosure --domain ux -n 3`, poi `disclosure --domain ux -n 2` | Primo risultato non pertinente; secondo senza corrispondenze | Nessun match verificato. Uso della checklist generale su priorità del contenuto e moduli, insieme alle osservazioni di Sunny |
| `offline save feedback --domain ux -n 3`, poi `offline support --domain ux -n 2` | Risultati non pertinenti al contratto offline richiesto | Nessun match verificato. Uso della checklist generale su offline, recupero errori e feedback; nessuna nuova garanzia sulla persistenza |
| `form state preservation --stack react -n 3`, poi `controlled input --stack react -n 2` | Dataset riferito a React 19.2; alcuni principi generali pertinenti, API specifiche incompatibili con React 18 | Nessuna adozione di `useActionState` o ref-as-prop. Preservazione dello stato definita come requisito UX, basato sul codice React 18 esistente |

Gli output pertinenti di navigazione, errori e grafici sono inclusi in `evidence/skill-*.txt`. Gli output grezzi, compresi quelli scartati, rimangono nella scratch locale e non diventano un design system persistito.

## Verifiche effettuate

Base applicativa: `7f1864731eb8c4b642261aed125d1002c743ef8f`, dopo le correzioni UI/UX e Wrapped chiaro. Dipendenze della preview ripristinate con `npm ci` dal lockfile esistente; nessuna modifica ai manifest del prodotto.

| Prova | Risultato | Evidenza |
|---|---|---|
| 10 rotte × 2 temi × 3 larghezze | **60 viste**, zero errori JavaScript e zero overflow del documento/scroller principale rilevati | [routes.json](evidence/routes.json) |
| Sonde dei percorsi e degli stati | **16 scenari completati**, zero errori di esecuzione delle sonde e zero errori JavaScript registrati; rilevati i difetti UX descritti nello studio | [probes.json](evidence/probes.json), [script](evidence/probes.mjs) |
| Informazioni saldo, chiaro/scuro | Home: 18.656 €; dialog: riserva 1.000 €, liquidità libera stimata 17.656 € | `home-information-*` in probes.json |
| Priorità multiple, chiaro/scuro | Chiuso: solo conteggio e descrizione generale. Aperto: pagamento Apple Pay e due scadenze | `priorities-*`, screenshot chiuso/aperto |
| Ricerca con categoria e periodo, chiaro/scuro | Rimuovere la categoria cancella “Caffè” e chiude la ricerca; durante la ricerca nessun `h1` nel main | `filter-and-search-*` |
| Posizione iniziale di Filtri, tema chiaro | x≈429 a 320/390 px: fuori vista. A 1440 px visibile. Nel caso con criteri URL x≈414, anche nello scuro | `filter-reach-*`, `filter-and-search-*` |
| Editor a 390 px, chiaro/scuro | Importo 32 px, input decimal; descrizione compilabile dopo apertura esplicita; nessuna scrittura | `editor-*`, screenshot |
| Nessun movimento | Spese assenti, saldo iniziale presente; non equivale a un account senza saldi | `empty` |
| AI/investimenti disattivati | Collegamenti AI e sezione investimenti non proposti; inclusione degli investimenti nel totale resta una preferenza distinta | `features-off` |
| Utente normale con parametro preview UI3 | Risolta **UI2**, come previsto dal gate | `normal-user` |
| Errore Piano | Nessun margine calcolato su dati incompleti, messaggio e Riprova visibili | `plan-error` |
| Ingresso onboarding | Primo passo disponibile; non completato il percorso | `onboarding` |

Lo zero overflow non implica che tutti i comandi siano immediatamente visibili: la riga dei tipi di movimento è uno scroller orizzontale intenzionale. La sonda di Filtri misura il pulsante rispetto al viewport, distinguendo questo problema dall’overflow della pagina.

La prima versione della sonda editor cercava la descrizione prima di aprirla. È stata corretta dopo lettura del ramo `descOpen` e rieseguita; il timeout del selettore non è stato trattato come un difetto dell’app. La sonda finale apre il campo con il comando presente nell’interfaccia.

## Riproduzione

Da `sunny/`, avviare la preview esistente:

```sh
node node_modules/vite/bin/vite.js --config ui-preview/vite.config.mjs
```

In un secondo terminale, dalla stessa directory:

```sh
SUNNY_BROWSER=/usr/bin/chromium \
SUNNY_NODE_PACKAGES=/workspace/cloud-setup/node_modules \
SUNNY_WIDTHS=320,390,1440 SUNNY_STABLE=1 \
SUNNY_EVIDENCE=/workspace/scratch/sunny-ui31-research/baseline \
SUNNY_ROUTES='["/","/wealth","/budget","/transactions","/investments","/account-balance","/category-spending","/insights","/settings","/commitments"]' \
node ui-preview/liquid-baseline.mjs
```

```sh
SUNNY_BROWSER=/usr/bin/chromium \
SUNNY_NODE_PACKAGES=/workspace/cloud-setup/node_modules \
SUNNY_UI31_EVIDENCE=/workspace/scratch/sunny-ui31-research/probes \
node ../docs/product/ui3.1/evidence/probes.mjs
```

Adattare i percorsi di browser/dipendenze se necessario. La preview deve essere sulla porta locale 4177. Lo script usa i componenti reali e le fixture esistenti; blocca le richieste esterne. Le sonde osservano anche difetti noti: la loro conclusione senza errori tecnici non equivale a un esito UX positivo.

## Immagini da consultare

- [Home chiara](evidence/home-light-390.png), [home scura](evidence/home-dark-390.png), [informazioni saldo](evidence/balance-info-light.png).
- [Movimenti a 320 px](evidence/transactions-light-320.png), [ricerca con categoria e periodo](evidence/search-filtered-light.png).
- [Priorità chiuse](evidence/priorities-closed-light.png), [priorità espanse](evidence/priorities-open-light.png).
- [Editor chiaro](evidence/editor-light.png), [editor scuro](evidence/editor-dark.png).
- [Piano](evidence/budget-dark-390.png), [errore Piano](evidence/plan-error.png), [Patrimonio](evidence/wealth-dark-390.png).
- [Investimenti desktop](evidence/investments-light-1440.png), [Impostazioni a 320 px](evidence/settings-light-320.png).

Quindici screenshot selezionati sono inclusi; le sessanta acquisizioni complete restano in `/workspace/scratch/sunny-ui31-research/baseline/`. Parametri e provenienza in [manifest.json](evidence/manifest.json).

Controllo finale degli artefatti: conteggi e assenza di errori confrontati con i JSON; tutti i 26 collegamenti locali dei due documenti risolti; 15 immagini di evidenza decodificate; SVG analizzato e wireframe PNG verificato a 1584×1020 px e ispezionato visivamente. Sintassi dello script controllata con `node --check`. Le sole aggiunte Git sono in `docs/product/ui3.1/`.

Non sono stati rieseguiti build e unit test: la consegna modifica solo documentazione, immagini e script di osservazione, senza codice del prodotto. Non sono stati misurati nuovi rapporti di contrasto o performance. Nessun accesso a dati privati, pubblicazione o modifica esterna.
