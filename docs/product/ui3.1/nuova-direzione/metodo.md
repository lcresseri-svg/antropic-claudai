# Verifica del prototipo di ripensamento

19 ottobre 2026. [Direzione proposta](../README.md).

Il prototipo è un documento HTML autonomo con stato in memoria. È separato dall’app Sunny e non carica servizi, credenziali, account o dati reali. Le operazioni dimostrate modificano soltanto il dataset illustrativo della pagina.

## Risultati

- **34 viste:** quattro pagine × due temi × 320/390/1440 px, più cinque stati alternativi × due temi a 390 px. Zero errori JavaScript registrati e zero overflow della pagina rilevati.
- **8 percorsi:** aggiunta di un’uscita e accesso al risultato; conferma Apple Pay; rimozione di un filtro senza cancellare la ricerca; errore di salvataggio con valori conservati; continua/scarta e ritorno del focus; modifica di un risultato cercato; ritorno browser fra pagine; primo conto senza altri fondi o impegni presunti.
- **Controllo locale italiano:** input `24,90`, data nativa `2026-10-12`, timezone Europe/Rome; risultato dell’esempio coerente.
- **31 coppie cromatiche nominali:** testo principale, secondario, oro e colori semantici sulle superfici solide dei due temi, più testo della CTA. Rapporti in [contrasti-token.json](contrasti-token.json). Non è un audit completo delle superfici composte o dei controlli.

Esiti dettagliati in [verifica-prototipo.json](verifica-prototipo.json), con impronta SHA-256 dell’HTML verificato. I valori attesi sono descritti in [scenario.json](scenario.json).

La prima esecuzione della sonda Filtri non risolveva il selettore di etichetta del `select`. L’associazione fra etichetta e campo è stata resa esplicita con `for/id` sia nei filtri sia nell’editor; la matrice e i percorsi sono stati rieseguiti. Il primo esito resta nella scratch `/workspace/scratch/sunny-rethink/first-check.json`. Non è stato presentato come un difetto dell’app Sunny.

## Riproduzione

Aprire `prototipo.html` nel browser per esplorarlo. La barra esterna al concept permette di cambiare tema/scenario e ripristinare i dati. `capture=1` nasconde la barra per le acquisizioni; non cambia il comportamento delle viste.

Per il controllo automatico, dalla radice del repository:

```sh
python3 -m http.server 4181 --bind 127.0.0.1 \
  --directory docs/product/ui3.1/nuova-direzione
```

In un secondo terminale:

```sh
SUNNY_BROWSER=/usr/bin/chromium \
SUNNY_NODE_PACKAGES=/workspace/cloud-setup/node_modules \
node docs/product/ui3.1/nuova-direzione/verifica-prototipo.mjs
```

Lo script rigenera le acquisizioni e i risultati nella propria directory. Richiede Playwright e un browser già disponibili; non installa dipendenze. I percorsi di browser e pacchetti possono essere adattati. L’esecuzione usa la preview locale sulla porta 4181 e blocca le richieste esterne.

## Applicazione della skill

UI/UX Pro Max alla revisione `56ea9cf174ed86786187daa9de0e6247cb0747e4`, stessa provenienza documentata nel [metodo del primo audit](../metodo-e-verifiche.md). Per questa revisione sono state rieseguite ricerche su sistema visivo, navigazione, gerarchia e feedback.

- `financial wellness personal finance --design-system`, poi `finance banking dashboard --design-system`: i pattern promozionali sono stati scartati; la semplicità visiva del secondo risultato è pertinente, senza adottarne palette, font o architettura commerciale.
- `navigation hierarchy --domain ux`, poi `bottom navigation --domain ux`: pertinenti le indicazioni su tastiera e navigazione fissa che non copra il contenuto. La scelta di tre destinazioni è una decisione su Sunny, non un risultato del database.
- `content priority --domain ux`, poi `visual hierarchy --domain ux`: nessun risultato specifico verificato per la gerarchia richiesta. Si applicano la checklist generale e le fonti del prodotto; nessun match specifico inventato.
- `success feedback --domain ux`: risultato pertinente Success Feedback, usato per conferma dell’esito e accesso al movimento. [Output](skill-feedback.txt).

Gli output non pertinenti rimangono nella scratch, senza diventare un design system persistito. Non vengono adottate API React 19 nella base React 18.

## Limiti delle prove

Chromium Linux e viewport emulati. Nessuna prova su Safari/dispositivo fisico, tastiera mobile reale, screen reader o testo al 200%; questi restano verifiche necessarie della futura implementazione. Nessuna certificazione WCAG o misura di performance.

Il prototipo dimostra una verticale di uscita e una parte della navigazione, non tutti i contratti finanziari, i tipi di movimento, la gestione delle serie, l’importazione, l’AI, il forecast, le autorizzazioni o l’offline. Le prove sul prototipo non certificano una futura implementazione nell’applicazione. La comprensione da parte delle persone e la reperibilità del Piano richiedono il confronto sui compiti descritto nello studio.

Le evidenze precedenti su 60 viste/16 sonde riguardano l’app attuale e rimangono distinte da queste prove del concept. Il codice applicativo, i manifest delle dipendenze e il rollout non sono stati modificati.
