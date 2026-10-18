# Correzioni UI/UX Pro Max — risultati

18 ottobre 2026. Implementazione dello [studio](17-studio-uiux-pro-max.md)
secondo il [piano](18-piano-correzioni-uiux.md), su branch `feat/ui3-ux-polish`.

## Comportamento risultante

- Token UI3 distinti per testo oro, riempimento dei controlli e colori dei dati.
  Badge verdi/rossi, avvisi e selettori leggibili anche sulle superfici colorate
  del tema chiaro. Il selettore comune dei periodi espone aria-pressed e minimi 44 px.
- Importi dei moduli investimento e rimborso nuovamente prominenti: 32 px nella
  prova a 390 px, adattivi fino a 40 px, placeholder leggibile. Gli input normali
  conservano 16 px. Nessuna modifica alla validazione o alla normalizzazione.
- Filtri Movimenti: Escape, backdrop e scelta dell'opzione convergono nella
  chiusura comune; il focus torna a Filtri con preventScroll, stato esposto dal trigger.
- Grafico giornaliero: una superficie ampia consente di selezionare il giorno,
  anche con valori piccoli o nulli. Frecce/Home/End consultano i dati; Invio o
  Apri movimenti aprono il giorno corretto. Le barre mantengono i valori reali.
- Portafoglio: grafico alto 160 px mobile e 224 px desktop, valore consultabile
  al tocco/tastiera e mese selezionato conservato cambiando finestra. La scala
  adattata è dichiarata. Linea tratteggiata del valore noto più leggibile.
  Le serie lunghe sono ridotte solo nel disegno, preservando estremi e punti
  reali; tabella e selezione continuano a usare la serie completa.
- Il controvalore è identificato come ultimo valore noto; qualità e intervallo
  di aggiornamento sono vicini al totale, con anno esplicito quando disponibile.
- Dettaglio fondo: capitale e guadagno in primo piano, rendimento/durata e
  statistiche espandibili. Il grafico arriva prima dei dettagli secondari.
- Metadati e assi più leggibili; badge Forecast adattati al tema; icone lineari
  per le voci di sistema delle Impostazioni. Emoji personali di conti/categorie conservate.
- Griglia delle metriche del Piano adattiva anche con testo al 200%; valori,
  formule, ordinamento del modulo movimento e relative funzioni invariati.

Wrapped, permessi e configurazione del rollout non sono stati modificati.
Le nuove regole di eredità includono l'esclusione delle superfici preservate.

## Verifica effettiva

| Verifica | Esito |
|---|---|
| Build e TypeScript | Passati |
| Suite unit completa | **852 passati, 5 skipped**; 73 file passati, uno skipped |
| Suite funzionali standard | **23/23 passate**: scarto, focus, moduli, bozze, import, azioni bulk, dettagli, impostazioni, Piano, grafici e navigazione |
| Controlli dedicati | **80/80**, su 320/390/834/1440 px nei due temi: contrasto testo e riferimento grafico, importo, bozza, focus, selezione giorno, periodo e mese selezionato |
| Matrice rotte | **114 viste**: 19 rotte × 3 larghezze × 2 temi; nessun errore JS o overflow orizzontale |
| Stress | **32/32**: 320×568, testo radice al 200%, dati vuoti e categorie limite, chiaro/scuro |
| Tastiera mobile simulata | **4/4**: Apple Pay e modulo generico, bozza/focus e accesso al salvataggio |
| Safe area simulata | **8/8**, categorie e conti nei due temi |
| Audit testo/contrasto | **28 viste/stati** misurati; nessun candidato sotto soglia sulle superfici semplici misurate |
| Richiamo stagionale Wrapped e legenda | **2/2** nei due temi: etichetta Wrapped 10 px e colori della legenda identici a quelli delle celle |
| Wrapped completo | **4/4 immagini identiche pixel per pixel**: 390/1440, chiaro/scuro |
| UI2 e Wrapped, confronto esteso | 21/24 immagini identiche; le tre differenze residue interessano 18–72 pixel sulle icone della home. Nessuna variazione di layout osservata |
| Inventario sorgente controlli | **597 dichiarazioni**, incluse quelle generate da componenti/array; non è un conteggio di istanze runtime |

La suite funzionale standard è stata eseguita prima dei tre aggiustamenti della
review; dopo questi sono stati rieseguiti suite unit, build, regressioni dedicate,
Wrapped stagionale, Piano/style, stress e rotte interessate. L'ultimo adeguamento
ha aumentato solo il contrasto della linea del valore noto, verificato nuovamente
nei due temi e nelle quattro larghezze, con build e unit verdi.
I due nuovi script browser fanno parte anche dell'aggregatore liquid-suites.mjs.

## Confronti misurati nel tema chiaro

| Elemento | Prima | Dopo |
|---|---:|---:|
| Testo del periodo attivo | 2,69:1 | 10,75:1 |
| Badge positivo Patrimonio | 3,90:1 | 5,40:1 |
| Numero Risparmiato in Consigli | 2,69:1 | 6,78:1 |
| Azione Aggiorna nell'avviso | 4,27:1 | 5,95:1 |
| Campo importo a 390 px | 16 px | 32 px |
| Focus dopo Escape nei filtri | BODY | pulsante Filtri |

I rapporti si riferiscono ai colori CSS composti delle superfici osservate,
non a una certificazione completa WCAG. L'inventario di contrasto dello studio
comprendeva anche icone decorative e contenuti dietro agli overlay: i conteggi
non sono usati come numero di violazioni corrette.

## Revisione indipendente

Revisione separata dell'intero diff, senza modifiche da parte del revisore.
Tre rilievi corretti con regressioni osservate prima e dopo:
1. Etichetta del richiamo Wrapped coinvolta dalla nuova scala tipografica:
   aggiunta l'esclusione esplicita, verificati 10 px nella finestra di dicembre.
2. Cursore del portafoglio legato all'indice dell'array: ora segue la chiave del
   mese, con ritorno all'estremo disponibile se la selezione esce dalla finestra.
3. Legenda del calendario e celle con token diversi: ora usano lo stesso token.

Nessun rilievo lasciato irrisolto. Lo stress ha inoltre motivato la griglia
adattiva delle metriche del Piano; non è stato ridotto il testo per farlo entrare.

## Evidenze e limiti

[Evidenze](evidence/ux-polish/): risultati JSON, inventario, log, confronti e
screenshot. Altre acquisizioni locali in `/workspace/ux-polish-routes/`,
`/workspace/ux-polish/`, `/workspace/ux-polish-gallery/`.

- [Importo chiaro](evidence/ux-polish/amount-light-390.png)
- [Importo scuro](evidence/ux-polish/amount-dark-390.png)
- [Investimenti desktop](evidence/ux-polish/investments-light-1440.png)
- [Grafico giornaliero](evidence/ux-polish/daily-chart-dark-390.png)
- [Dettaglio fondo](evidence/ux-polish/fund-detail-light-390.png)
- [Impostazioni](evidence/ux-polish/settings-light-320.png)
- [Piano a testo 200%](evidence/ux-polish/budget-light-320-text200.png)

Verifiche Chromium sulla preview con dati illustrativi. La tastiera e le safe
area sono simulate: nessuna prova su iPhone/Safari fisico o sugli account privati.
Nessuna modifica alle dipendenze del prodotto. La skill locale UI/UX Pro Max
installata dall'utente resta nell'ambiente di lavoro, separata dagli asset web.
