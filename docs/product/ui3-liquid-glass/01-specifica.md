# Sunny UI 3.0 — Liquid Glass essenziale
Specifica di prodotto e interazione · 12 ottobre 2026
Stato: studio per successiva implementazione con Codex. Solo documentazione.
Base esaminata: main a0085a766955c65032c754c2676c20bc3b67fe3f.
Branch: docs/ui3-liquid-glass-2026-10-12.

## Mandato
Ristudiare tutte le schermate mantenendo l'identità Sunny, con più modernità, essenzialità e funzionalità. Più liquid glass; meno testo permanente; grafici dove migliorano la comprensione; dettagli completi sempre raggiungibili. Tema realmente chiaro e realmente scuro. Verificare azioni, collegamenti, annullamento, focus e scroll. Wrapped completamente intoccato.

Questa specifica riguarda presentazione e comportamento delle interazioni. I significati finanziari già corretti restano il contratto di riferimento. Non interpretare “più funzionale” come autorizzazione a cambiare formule o permessi senza una diagnosi specifica.

Documenti complementari:
- [Schermate e flussi](02-schermate-e-flussi.md)
- [Incarico per Codex e verifiche](03-codex-e-verifiche.md)

## Stato attuale accertato
- Il nuovo Piano è già implementato in PlanScreen/PlanEditor, indipendentemente dalla UI3. Non rifarlo dalla vecchia specifica del 10 ottobre.
- Il resolver corrente ha everyone=2.0 e pilotAdmin=2.0. La UI3 esiste nel codice e nella preview, ma non è attualmente abilitata dal resolver di produzione.
- Le principali rotte sono state esaminate tramite AppRoutes e i relativi componenti; sono stati letti editor, shell, dialoghi, navigazione, token e grafici rappresentativi.
- Il lavoro è un audit statico del codice. Non costituisce una verifica visiva o funzionale dell'app in esecuzione. Il runtime locale non ha reso disponibile una preview e l'avvio del browser per consultare gli screenshot è fallito. Non si dichiara riprodotto il difetto di scroll.
- I resoconti di verifica del Piano dell'11 ottobre sono evidenza storica, non test rieseguiti per questa proposta.

### Problemi osservati e decisioni
| Evidenza nel codice | Impatto possibile | Decisione |
|---|---|---|
| ui-v3.css usa fondo scuro #111516, superfici #1C2223 e glass opaco al 96%; chiaro #F8F6EF | La direzione è carbone/crema più che nero/bianco traslucido | Nuova palette e materiali distinti |
| Molte superfici ripetono bordi, ombre, titoli e descrizioni | Gerarchia frammentata, eccesso di testo | Un contenitore per gruppo funzionale, righe al suo interno |
| PlanEditor inserisce la conferma Scarta dopo il contenuto, sostituendo il footer | L'avviso può non essere nel punto di attenzione dell'utente | Conferma sovrapposta alla finestra, sempre visibile |
| TransactionModal inserisce ui-discard e usa display:none sul form | Il contenuto cambia geometria durante la conferma | Form montato e geometricamente stabile dietro l'avviso |
| PlanDialog ripristina trigger.focus() senza preventScroll | Possibile spostamento della pagina al ritorno | Ripristino esplicito di focus e scroll, da verificare nel browser |
| PlanDialog è un dialog nativo nel top layer, DialogSurface usa uno stack personalizzato | Una conferma con solo z-index può finire dietro al dialog nativo | Sistema coerente di livelli e focus; non mescolare modelli casualmente |
| SheetShell instrada X, backdrop ed Escape direttamente a onClose | Nessuna politica universale di draft non salvati | Un unico requestDismiss condiviso per ogni editor |
| useUiRouteFocus memorizza per pathname | Query diverse possono condividere erroneamente contesto e posizione | Identità di navigazione basata su entry e filtri pertinenti |
| AnalysisHeader usa un backTo fisso | Dettaglio aperto da un contesto diverso può tornare nel posto sbagliato | Origine interna validata e fallback alla pagina genitore |
| Settings è un componente molto esteso con azioni e conferme locali | Comportamenti difficili da rendere coerenti | Struttura a sezioni e conferme comuni, senza riscrivere i dati |
| Onboarding invita a vedere “dati veri” attivando demo | Dicitura ambigua | Scrivere chiaramente “Esplora con dati di esempio” |

## Direzione scelta
Tre opzioni considerate: semplice restyling; vetro molto decorativo ovunque; vetro selettivo e gerarchia guidata dai dati.
Scelta: vetro selettivo. La profondità appartiene soprattutto a navigazione, selettori e finestre; grafici e lettura hanno superfici stabili. L'identità deriva da luce, oro Sunny, tipografia e colori dei dati, senza moltiplicare bagliori o riquadri.

Regola per schermata:
1. Una domanda principale.
2. Un dato dominante con periodo e significato.
3. Un grafico principale o una lista, secondo il compito.
4. Una sola azione primaria evidente.
5. Dettagli progressivi per spiegazioni, metriche secondarie e operazioni rare.

Non imporre grafici a impostazioni, login o moduli. Non nascondere informazioni indispensabili dietro un tooltip: errori, differenza fra previsione e dato reale, effetti distruttivi e importi da confermare restano visibili.

## Design system
### Colori proposti
Sono valori iniziali da rifinire mediante rendering reale, non una certificazione di contrasto delle superfici trasparenti.

| Token | Chiaro | Scuro |
|---|---|---|
| Fondo pagina | #FFFFFF | #050608 |
| Superficie leggibile | #FFFFFF | #101216 |
| Superficie secondaria | #F7F9FC | #171A20 |
| Testo primario | #151619 | #F7F8FA |
| Testo secondario | #5E6570 | #AFB6C2 |
| Oro per testo/link | #A5660A | #F4C66A |
| Oro per CTA | #F2C46D con testo #241704 | #F2C46D con testo #241704 |
| Focus | #245CCC | #8EB8FF |

Su fondo pieno bianco, i contrasti calcolati del testo primario/secondario/oro sono 18,09 / 5,88 / 4,66. Sul fondo scuro sono 19,08 / 9,94 / 12,68. Ricontrollare superfici composite, hover, focus e testo disabilitato: questi rapporti non coprono la UI renderizzata.

La pagina chiara deve apparire bianca, senza velo grigio o beige globale. La pagina scura deve apparire nera, con superfici appena sollevate; non una tela grigia.
Le tinte neutre secondarie servono solo a distinguere livelli.
I colori categorie conservano identità e associazione ai dati. Le varianti di tema possono aumentarne la leggibilità senza cambiare arbitrariamente il significato.

### Materiali
- Navigazione e controlli flottanti: glass bianco 70–84% nel chiaro, glass nero 64–80% nello scuro; blur iniziale 18–24 px, bordo sottile luminoso, ombra morbida.
- Sheet e dialoghi: superficie più coprente (90–97%) per moduli e numeri; titolo, contenuto e footer leggibili.
- Grafici: pannello stabile, linee nette e reticolo leggero; blur escluso dal tracciato dei dati.
- Nessun filtro SVG di distorsione, lente o rifrazione sopra numeri e testo. L'effetto liquid viene da bordi, luce, profondità e transizioni.
- Niente blur annidati per ogni riga: massimo due livelli visibili per schermata, oltre allo scrim di una conferma.
- Fallback opaco completo con backdrop-filter non supportato, ridotta trasparenza o contrasto forzato.
- In tema chiaro il bordo da solo non deve essere l'unico indizio di cliccabilità.

### Tipografia, densità e movimento
Font UI già adottato dal progetto, cifre tabulari, pesi limitati. Non introdurre una nuova famiglia solo per rendere il redesign diverso.
Dato hero 36–48 px mobile, 48–64 desktop, ridimensionato per importi lunghi; testo normale 14–16 px, metadati 12–13 px. Non ridurre il testo a 10 px per comprimere la schermata.
Spaziatura su scala 4/8/12/16/24/32; raggi 16–24 per gruppi, 24–28 per finestre. Le righe non sono tutte contenitori separati.
Interazioni 120–180 ms; sheet 220–300 ms. Nessun contatore che faccia sembrare il denaro in cambiamento, nessuna attesa per leggere un grafico.
Reduced motion elimina trasformazioni e animazioni decorative; valori e geometrie finanziarie sono disponibili subito.

## Informazioni su tre livelli
- Livello 1: etichetta breve, numero, periodo, variazione o stato indispensabile.
- Livello 2: dettaglio al tocco con grafico ampio, decomposizione e movimenti.
- Livello 3: metodo di calcolo, fonti, filtri avanzati, diagnostica o esportazione.

Esempi:
- “Margine del mese · 550 €” → Come è calcolato → dettaglio completo del Piano.
- “Entrate · 2.400 €” → fonti e andamento → movimenti del periodo.
- “Investito · 8.200 €” → capitale/controvalore con etichette esatte → singolo investimento.
I qualificatori essenziali non spariscono: Previsto, Da confermare, Aggiornato il, Saldo, Quota propria.
Le informazioni secondarie vengono spostate, non eliminate. Nessuna statistica accessibile oggi deve diventare irraggiungibile.

## Navigazione
Conservare i quattro ingressi Oggi, Patrimonio, Piano, Movimenti e il comando Aggiungi.
Mobile: dock glass flottante con safe area, icone e brevi etichette. Tablet: rail compatta. Desktop: sidebar contenuta con nome e logo Sunny.
Il dock lascia spazio al contenuto finale e scompare dietro una finestra operativa; non compete con Salva.
Logo in alto a sinistra; nelle sottopagine freccia ‹ con nome accessibile. Nessun doppio Indietro nel titolo e nella shell della stessa finestra.
Consigli, Impegni, AI e Impostazioni restano accessibili da posizioni coerenti; i collegamenti contestuali non sono l'unico modo per ritrovare una funzione.

Ogni navigazione in dettaglio conserva periodo, conto/categoria selezionati, query e scroll dell'origine.
Il Back torna all'origine interna se presente; altrimenti a un genitore noto. Non chiamare navigate(-1) su deep link senza fallback.
I link a Movimenti devono trasferire tutti i filtri supportati necessari a spiegare il dato, compreso il periodo: il totale mostrato nel dettaglio deve essere riconciliabile.
Aprire un'altra scheda principale non deve causare salvataggi o reset di filtri inattesi.
Le query sconosciute non diventano destinazioni arbitrarie o accesso a feature non autorizzate.

## Contratto universale per finestre e annullamento
### Anatomia
Titolo e chiusura fissi, un solo contenitore interno scrollabile, footer operativo fisso. Il pannello può adattarsi al visual viewport e alla tastiera, senza spostare la pagina sotto.
Nel dettaglio di lettura basta Chiudi/Indietro. Negli editor: Annulla e Salva, salvo CTA di dominio più precisa come Registra storno.
I picker temporanei sono un sottolivello: chiuderli torna all'editor, non scarta l'intero movimento.
Non duplicare titolo o controlli aggiunti sia da DialogSurface sia dal componente chiamante.

### Regole
| Stato / azione | Esito |
|---|---|
| Nessuna modifica + Annulla/X/Escape/backdrop | Chiusura immediata, ritorno esatto all'origine |
| Modifiche non salvate + richiesta di chiusura | Avviso compatto sopra l'editor |
| Continua a modificare | Avviso chiuso; stessi dati, stessa sezione e scroll |
| Scarta modifiche | Scarto effettivo del draft interessato e ritorno all'origine |
| Escape o backdrop sull'avviso | Continua a modificare; mai scarto implicito |
| Salvataggio in corso | Una sola richiesta; stato visibile; nessuna promessa di annullamento della scrittura |
| Salvataggio fallito | Editor aperto, valori conservati e Riprova |
| Eliminazione | Avviso con oggetto e conseguenza, CTA Elimina esplicita |
| Azione immediata reversibile già salvata | Feedback di esito; eventuale undo reale, non un finto Annulla |

Testo standard:
“Scartare le modifiche?”
“Le modifiche non salvate andranno perse.”
Azioni: “Continua a modificare” e “Scarta modifiche”.
Se il draft è già conservato localmente, il testo deve spiegare correttamente cosa viene eliminato. Non dichiarare persi dati già salvati.

L'avviso deve stare al centro dell'area visibile, sopra la finestra, con scrim leggero. Non va aggiunto in fondo al form, non deve espanderlo, sostituirne il contenuto o attivare scrollIntoView. Il form rimane montato e mantiene altezza e posizione.
Per conferme critiche usare alertdialog con nome/descrizione, focus iniziale sull'azione conservativa e focus trap del solo livello superiore. L'editor sotto resta inert finché l'avviso è aperto.
Con dialog nativo aperto, la conferma deve partecipare correttamente al top layer oppure essere contenuta nel suo layer; un portale con z-index alto fuori dal dialog non è sufficiente.
Non lasciare due gestori Escape indipendenti che chiudono due livelli.
Il ritorno di focus usa preventScroll; ripristinare anche lo scroll del contenitore interno. Se il trigger non esiste più, scegliere un elemento vicino e stabile, senza salto al fondo o alla testa.
Per chiusura della scheda browser resta eventualmente il beforeunload nativo: il browser ne controlla testo e disponibilità. Non simulare una garanzia di intercettazione.
Lo swipe di chiusura non è obbligatorio; se presente deve rispettare la stessa richiesta di scarto.

## Grafici: sistema comune
Usare i componenti esistenti quando adeguati; introdurre un nuovo grafico solo per una domanda non coperta. Le librerie e le versioni si decidono dopo aver verificato le dipendenze, senza aggiungere un framework grafico solo per cambiare stile.

| Domanda | Grafico scelto | Approfondimento |
|---|---|---|
| Come sta cambiando il totale? | Linea/area sobria | Punto con data/importo, serie e periodo |
| Dove spendo? | Barre orizzontali ordinate | Categoria e movimenti filtrati |
| Quanto del piano è già occupato? | Barra segmentata speso/programmato/residuo e marker limite | Calcolo e singola categoria |
| Entrate contro uscite nel tempo | Barre affiancate o serie separabili | Dati esatti per intervallo |
| Come è composto il patrimonio? | Barra di composizione; donut solo con poche parti positive | Conti/investimenti sottostanti |
| Quando arriveranno gli impegni? | Calendario/timeline con importi | Serie, occorrenza e movimenti |
| Qual è la stima? | Tratto reale continuo e futuro tratteggiato | Ipotesi e qualità della stima disponibili |
| Quali metriche operano insieme? | Piccoli grafici separati | Tabella tecnica, non doppio asse ambiguo |

Contratto di ogni grafico:
- periodo, unità e significato leggibili;
- tap e tastiera oltre a hover; selezione touch non ostacola lo scroll verticale;
- tabella/“Vedi dati” e descrizione sintetica accessibili;
- legenda con nomi, non solo colori;
- tooltip visibile nel viewport e coerente con formato italiano;
- nessun valore inventato per riempire buchi, nessun rendimento dedotto da versamenti;
- barre quantitative partono da zero; assi di linea non-zero espliciti;
- linee non introducono picchi artificiali tramite smoothing;
- segnare valori futuri e programmati, senza confonderli con registrazioni;
- intervalli di incertezza solo se realmente forniti dal motore;
- donut esclusi con componenti negative o troppe categorie;
- campionamento eventuale preserva estremi e accesso ai dati completi;
- identificatori SVG unici quando due istanze convivono;
- aggiornare il periodo non deve scrollare la pagina o mostrare dati vecchi col titolo nuovo.

## Wrapped: perimetro protetto
Intoccati componenti, stories, grafici, copy, ordine, timing, gesture, progress bar, route, entry card, finestra temporale, riepilogo, condivisione e obiettivo finale.
Non riscrivere features/wrapped, né le regole .wrapped-* in index.css, né i loro override in ui-v3.css.
Tutti i nuovi selettori devono avere un confine positivo della nuova esperienza, non essere regole globali generiche su button/svg/h1.
Evitare cambi ai token radice ereditati da Wrapped. Definire i nuovi materiali su shell e portal root esplicitamente marcati, escludendo il sottoalbero Wrapped. Prima verificare gli stili computati delle dipendenze condivise.
Un helper comune può cambiare soltanto se il comportamento di Wrapped resta identico; preferire un adattatore specifico del nuovo sistema quando necessario.
La verifica confronta screenshots a story e tempo deterministici e tutte le azioni esistenti: non basta che git diff features/wrapped sia vuoto.

## Confini di implementazione
- Nessun rollout pubblico o riattivazione automatica del pilot: il resolver produzione attuale resta com'è durante lo sviluppo. La preview dedicata può attivare UI3 senza accesso a produzione.
- Il Piano nuovo rimane disponibile anche nella UI corrente; non spostarlo dietro un gate UI3.
- Lavorare sui dati e selettori esistenti. Se una nuova visualizzazione necessita dati inesistenti, mostrare assenza e annotare la limitazione.
- Mantenere ordine del form movimento: importo, descrizione subito sotto, categoria con emoji e successivi campi secondo il flusso attuale; conservare storni e opzioni avanzate.
- Non cambiare Rules, Functions, autenticazione, automazioni Apple Pay o autorizzazioni per ragioni estetiche.
- I grafici finanziari non modificano statistiche, arrotondamenti persistiti, quote o trattamento degli storni.

## Sequenza consigliata
1. Stabilire baseline di tutte le rotte e protezione Wrapped.
2. Unificare annullamento, layer, focus e scroll: priorità funzionale.
3. Materiali, temi e componenti base su una verticale Oggi → dettaglio → modifica → conferma scarto.
4. Applicare navigazione e gerarchia a Patrimonio, Piano e Movimenti.
5. Analisi, investimenti, impostazioni e tutti gli overlay.
6. Flussi iniziali, notifiche, accessibilità, stati eccezionali.
7. Verifica completa e consegna per revisione, senza merge/deploy.

La fase 3 deve produrre screenshot concreti nei due temi prima di estendere il materiale a tutte le pagine. È un controllo interno del lavoro, non un invito a interrompere ogni schermata per domande generiche.
