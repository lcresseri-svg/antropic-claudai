# Sunny — studio UI/UX con UI/UX Pro Max

18 ottobre 2026 · base `main` e788adb3a96d8a41b620f13ecb99bfbce8b0e4f1.
Studio della UI3 attuale. Nessuna modifica al prodotto o pubblicazione.

## Giudizio

Sunny ha già una direzione riconoscibile: fondo bianco/nero, oro, cifre
allineate, sezioni aperte e divisori. La home costituisce il riferimento più
chiaro. La prossima revisione dovrebbe consolidare questa grammatica e
correggere difetti misurati: alcuni contrasti nel chiaro, la gerarchia
nei moduli, i bersagli dei grafici e la continuità del focus.

Non serve un nuovo tema o una nuova famiglia di caratteri. Il vetro funziona
come materiale di navigazione e finestre; su dati e liste serve una superficie
stabile. Il contrasto e la chiarezza degli stati hanno precedenza sugli effetti.

## Metodo ed evidenza

Letta e applicata la skill locale
`.agents/skills/ui-ux-pro-max/SKILL.md`: checklist di accessibilità,
interazione, tipografia, grafici, disclosure e navigazione; stack rilevato
React 18 + TypeScript + Tailwind, applicazione web responsive.

Ricerche locali verificate:
- `time series trend --domain chart`: risultato **Trend Over Time**, pertinente
  alla lettura temporale, alle etichette, ai dati accessibili e al campionamento;
- `keyboard focus modal --domain ux`: **Focus States** e **Focus Not Obscured**,
  pertinenti agli overlay e al focus visibile.

Le ricerche su disclosure e virtualizzazione hanno restituito risultati
non pertinenti o nessuna corrispondenza anche dopo un tentativo più specifico.
Per questi argomenti si usa la checklist generale della skill e l'osservazione
del codice, senza attribuire raccomandazioni specifiche al database. Nessuna
palette o libreria proposta automaticamente sostituisce le scelte di Sunny.

Acquisite **40 viste**: 10 rotte × chiaro/scuro × 390/1440 px. Rotte: home,
Patrimonio, Piano, Movimenti, Investimenti, Saldo per conto, Spese per categoria,
Consigli, Impostazioni, Forecast V3. Nessun errore JavaScript o overflow
orizzontale rilevato in questa matrice.

Misurate **28 viste/stati** a 390 px: le dieci rotte, dettaglio fondo, editor
Versa, filtri Movimenti e impostazioni Aspetto, nei due temi. Provati inoltre
Escape nei filtri e il ritorno dal sottomodulo al dettaglio del fondo.

Dati illustrativi della preview dedicata, non dati privati o misure sul live.
Le acquisizioni delle rotte usano l'orologio stabile del 12 ottobre; gli overlay
usano quello del giorno di esecuzione. Nessuna conclusione finanziaria deriva
dagli importi dimostrativi. Non è un test completo di tutti i flussi o rotte,
né una certificazione WCAG. Non eseguita una prova su iPhone/Safari fisico.

I contrasti indicati sotto sono rapporti calcolati dai colori CSS composti delle
superfici semplici osservate. L'inventario contiene anche candidati automatici,
icone decorative e contenuti dietro agli overlay: il loro conteggio non equivale
al numero di violazioni. Non si considera 44 px una soglia universale WCAG:
24 px è la soglia web AA con eccezioni; 44 px resta il riferimento ergonomico
scelto per i principali controlli touch di Sunny.

## Problemi verificati e priorità

| Priorità | Problema | Evidenza | Correzione proposta e criterio di accettazione |
|---|---|---|---|
| P1 | Selettore attivo poco leggibile nel chiaro | “Tutto” in Investimenti e nel dettaglio: bianco su #C4972C, **2,69:1**, testo 14 px | Componente unico per periodi; sfondo oro Sunny con testo scuro dedicato. Testo normale almeno 4,5:1 in entrambi i temi, con stato selezionato anche semantico |
| P1 | Colori semantici usati su fondi colorati senza adattamento | Badge verde di Patrimonio **3,90:1**; “Aggiorna” su avviso oro **4,27:1**; numero “Risparmiato” in Consigli **2,69:1** nel chiaro | Separare colore dei dati, testo funzionale e riempimento. Misurare anche badge, avvisi e selezioni; non trasferire ciecamente il colore scuro al tema chiaro |
| P1 | Importo di Versa perde la sua gerarchia | Input con classe `text-[34px]`, ma misura effettiva **16 px** in entrambi i temi. Placeholder “0”: **1,33:1** nel chiaro, **1,58:1** nello scuro | Variante semantica “importo”, distinta dai campi normali: 32–40 px visivi, cifre tabulari, zero leggibile. Campi normali almeno 16 px. Verificare importi lunghi e tastiera mobile |
| P1 | Barre della home difficili da toccare | Nel grafico “Uscite del mese”, barre interattive larghe circa **11,6 px**; esempio con altezza **3,3 px** | Separare la geometria del dato dall'area interattiva; area selezionabile e riepilogo del giorno accessibili anche con tastiera. Per densità elevate usare selezione del giorno e dettaglio, senza ingrandire artificialmente il valore rappresentato |
| P1 | Escape nei filtri perde il punto di lavoro | Focus posto su “Categoria”, poi Escape: `document.activeElement` diventa **BODY** nei due temi | Un percorso comune di chiusura che ripristina “Filtri” con `preventScroll`; il trigger espone stato aperto/chiuso. Nessuno spostamento della pagina |
| P1 | “Controvalore oggi” può suggerire un aggiornamento non presente | La legenda usa questa dicitura anche quando la pagina segnala controvalori da aggiornare | “Ultimo valore noto”, data o stato sintetico vicino al totale; dettagli di aggiornamento progressivi. Non cambiare formule né simulare storico di mercato |
| P2 | Scala tipografica ancora frammentata | Etichette dell'asse Investimenti a **10 px**, legenda a **11 px**; diversi metadati nei dettagli sotto 12 px | 16 px testo, 14 px secondario, 12–13 px metadati e assi. Per i grafici ridurre il numero di etichette anziché la dimensione. Conservare la compattezza delle righe |
| P2 | Grafico generale troppo basso su desktop | Area del grafico investimenti alta **120 px** anche su contenitore di oltre 1.100 px | Altezza adattiva: circa 140–160 px mobile e 200–240 px desktop, con scala leggibile e valore al puntatore/focus. Scelta da verificare su dati poco variabili |
| P2 | Densità dei dettagli non sempre progressiva | Dettaglio fondo: molte metriche precedono lo storico; Versa presenta opzioni secondarie in contenitori autonomi | Dare precedenza a valore, aggiornamento e compito corrente; rendimento, statistiche e opzioni avanzate in gruppi espandibili. Conservare ordine e significati del modulo |
| P3 | Iconografia di sistema disomogenea | Impostazioni e parti dei moduli mescolano emoji, simboli e icone lineari | Una famiglia vettoriale per controlli e sezioni di sistema. Le emoji scelte dall'utente per categorie e conti restano un contenuto personale |

Nessun problema è classificato P0 sulla base delle prove svolte. Le correzioni
P1 vanno affrontate prima di un ulteriore restyling.

## Grammatica visiva raccomandata

### Struttura e densità

- Pagine e liste con divisori orizzontali; niente contenitori arrotondati per
  ogni dato o movimento. Le finestre, i campi e i pulsanti restano superfici.
- Scala di spazio 4/8/12/16/24/32. Righe compatte, senza gap aggiuntivi fra
  movimenti consecutivi; più separazione fra sezioni di significato diverso.
- Un dato e una domanda dominanti per schermata. Una sola azione primaria
  evidente nel contesto; pulsante globale Aggiungi come accesso persistente.
- Testata coerente: titolo, eventuale periodo, azione contestuale. Desktop con
  Altro solo in alto a destra; mobile con cinque posizioni nella barra inferiore.
- Larghezza dipendente dal compito: testo e moduli contenuti, ledger e grafici
  più ampi su desktop. Evitare pulsanti primari enormi solo perché c'è spazio.

### Tipografia e colore

- Font attuale di Sunny, numeri tabulari e pochi pesi.
- Titoli 22–24 px; sezioni 17–18; corpo 16; secondario 14; metadati 12–13.
- Importi principali 32–48 mobile, 48–64 desktop, adattati alla lunghezza.
- Fondo bianco e nero già adottati; oro come identità, senza usarlo come unico
  canale di stato o per testo a contrasto insufficiente.
- Nomi semantici distinti: testo su oro, oro per link, colore dei dati,
  superficie selezionata, testo secondario. Evitare override generali delle
  utility tipografiche che possono ridurre anche un campo importo.

### Grafici

- Storico completo come default dove richiesto, con periodi coerenti e anni
  leggibili. La tabella dati esistente è un punto da mantenere.
- Assi e legenda leggibili; unità, scala e periodo dichiarati. Zero solo quando
  è significativo per la rappresentazione; se la scala è adattata, renderlo
  chiaro vicino al grafico, non soltanto nel contenuto espanso.
- Nel portafoglio distinguere capitale versato e ultimo controvalore noto.
  Nessuna curva di mercato ricostruita senza dati reali.
- Valori consultabili con tocco e tastiera. L'area di selezione è più grande
  della linea/barra visibile; stato selezionato esplicito.
- Riassunto breve del trend; dettagli e tabella su richiesta. Serie molto lunghe
  aggregate o campionate per il disegno, con accesso ai dati originali.

### Modali, filtri e moduli

- Superficie leggibile e titolo unico. Back per tornare al livello precedente,
  X per chiudere il livello corrente; significati visibili e comportamento
  coerente anche per Escape/backdrop.
- Corpo scorrevole e azione principale raggiungibile con tastiera aperta.
- Bozza, focus e scroll preservati. La conferma di scarto resta sopra all'editor
  senza sostituirlo o spostarlo.
- Nei filtri: voci brevi già concordate, selezione riconoscibile e ritorno del
  focus al trigger. Non trasformare ogni filtro in una nuova pagina.

## Applicazione alle schermate

| Schermata | Da mantenere | Da rifinire |
|---|---|---|
| Oggi | Saldo, riepilogo entrate/uscite/investito, elenco categorie con divisori | Selezione del giorno nel grafico e testi a basso contrasto nel calendario |
| Patrimonio | Dato dominante e tre serie con legenda/tabella | Badge positivo nel chiaro, scala e testo dei dettagli |
| Piano | Formule, gerarchia del margine, modifica esplicita | Colori dei selettori e metadati; nessuna riprogettazione del modello finanziario |
| Movimenti | Densità compatta, bande, raggruppamenti espandibili | Focus del pannello filtri, stati di selezione e linguaggio visivo unico |
| Investimenti | Posizioni aperte e periodi dello storico | Selettori nel chiaro, altezza desktop, aggiornamento del controvalore |
| Saldo per conto / categorie | Divisori e accesso ai movimenti filtrati | Contrasti dei badge e periodi, assi più leggibili |
| Consigli | Indicazione principale e spiegazione su richiesta | Oro testuale nel chiaro e minore concorrenza fra numeri secondari |
| Impostazioni | Sezioni e righe uniformi con ricerca | Icone di sistema coerenti, separazioni calibrate alla densità del contenuto |
| Dettaglio fondo / Versa | Ritorno al trigger “+ Versa” verificato | Importo, metadati e progressione dei dettagli |
| Forecast V3 | Dettagli avanzati disponibili | Badge e caratteri molto piccoli: portarlo sulla stessa scala della UI principale |

## Sequenza di lavoro proposta

1. **Leggibilità e continuità:** token di contrasto, selettori, importo, focus
   dei filtri, area di selezione dei grafici. Criteri misurabili nei due temi.
2. **Gerarchia dei dati:** grafici adattivi, stato di aggiornamento del valore,
   priorità nei dettagli; nessuna modifica al significato dei numeri.
3. **Consolidamento:** componenti semantici condivisi per periodi, testate,
   righe, campi importo, avvisi e dialoghi; riduzione degli override CSS globali.
4. **Rifinitura:** iconografia strutturale e movimento discreto, dopo prove di
   leggibilità e interazione. Niente animazioni che ritardino la lettura.

Per ogni fase: immagini chiaro/scuro, 320/390/834/1440, zoom/testo 200%, stato
vuoto/errore/salvataggio, percorso tastiera e regressioni Wrapped. Questa è la
matrice proposta per un'implementazione successiva, non una prova già svolta.

Wrapped, formule del nuovo Piano, ordine del modulo movimento, permessi e
rollout restano vincoli della successiva implementazione. Lo studio non li
modifica.

## Materiali

- [Home chiara](evidence/uiux-study/home-light-390.png)
- [Piano scuro](evidence/uiux-study/budget-dark-390.png)
- [Investimenti desktop](evidence/uiux-study/investments-light-1440.png)
- [Editor Versa scuro](evidence/uiux-study/deposit-editor-dark-390.png)
- [Impostazioni](evidence/uiux-study/settings-light-390.png)
- [Filtri](evidence/uiux-study/filters-light-390.png)
- [Matrice delle 40 viste](evidence/uiux-study/routes.json)
- [Estratto delle misure e candidati](evidence/uiux-study/measurements.json)
- [Prove di focus e importo](evidence/uiux-study/interaction-probes.json)

Le misure complete non filtrate e le altre immagini delle 40 viste sono nella cartella locale
`/workspace/uiux-study/`. I due script di misura copiati nell'evidenza sono
strumenti di studio, con percorsi locali espliciti e preview 4177 già avviata;
non sono test di conformità o nuovi requisiti CI.
