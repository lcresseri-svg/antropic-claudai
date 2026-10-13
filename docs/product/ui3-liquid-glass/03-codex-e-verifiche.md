# Incarico Codex — Sunny UI 3.0 Liquid Glass
Leggere prima [01-specifica.md](01-specifica.md) e [02-schermate-e-flussi.md](02-schermate-e-flussi.md).
Specifiche del 12 ottobre 2026, base a0085a766955c65032c754c2676c20bc3b67fe3f.
Questa documentazione prepara l'esecuzione successiva. In questa sessione non sono stati cambiati componenti applicativi.

## Prompt pronto
Implementa la revisione completa della UI 3.0 di Sunny nel repository lcresseri-svg/antropic-claudai seguendo tutti i documenti in docs/product/ui3-liquid-glass/ sul branch docs/ui3-liquid-glass-2026-10-12. Parti dalla main aggiornata su un branch dedicato e porta con te le specifiche, senza sovrascrivere lavori successivi. Leggi le istruzioni del repository. Il prodotto deve restare riconoscibile come Sunny, più moderno, minimal e liquid glass, con vero chiaro bianco e vero scuro quasi nero, grafici leggibili, informazioni progressive e azioni coerenti. Esamina e copri tutte le rotte, i pulsanti e gli overlay, non solo la home. Priorità: conferma di scarto sopra l'editor, senza spostare pagina o contenuto e senza perdere dati/focus; unifica X, Annulla, Escape e backdrop. Wrapped completamente intoccato, inclusi comportamento e stili ereditati. Conserva il nuovo Piano già implementato e le sue formule, l'ordine del form movimento e le funzioni esistenti. Il resolver produzione attuale mantiene UI3 disabilitata: sviluppa e verifica nella preview dedicata, senza cambiare rollout o permessi. Risolvi autonomamente i dettagli ordinari, procedi per le fasi indicate, verifica davvero grafici, navigazione, moduli e stati nei due temi. Consegna branch, screenshot, inventario dei controlli e test con esiti reali. Nessun merge su main o deploy.

## Preparazione
1. Rilevare branch/HEAD, modifiche locali e AGENTS.md. Non assumere che la base studiata sia ancora l'ultima.
2. Leggere gli aggiornamenti Piano del 10–11 ottobre e il codice attuale. La vecchia specifica Piano che proponeva il pilot è stata superata dall'implementazione indipendente da UI3.
3. Registrare baseline delle suite e screenshot della preview; mantenere dati sintetici, nessuna scrittura su Firebase produzione.
4. Inventariare le rotte da AppRoutes, gli stati condizionali e i controlli. Confrontare con la matrice; aggiungere eventuali nuove rotte.
5. Verificare schema tema, resolver UI e confini dei portali. Non riattivare UI3 in produzione per rendere comoda la preview.
6. Registrare hash dei file Wrapped e baseline visiva/interattiva delle stories; annotare dipendenze comuni che potrebbero influenzarlo.

## Lotti di lavoro
### A. Interazioni prima dell'estetica
File centrali: shared/components/DialogSurface.tsx; shared/useScrollLock.ts; shared/hooks/useUiRouteFocus.ts; features/budget/PlanDialog.tsx e PlanEditor.tsx; features/investments/SheetShell.tsx; features/transactions/TransactionModal.tsx.

Introdurre un contratto di richiesta chiusura condiviso con stato dirty/saving/error e un componente di conferma compatto.
Evitare un manager globale che cambi anche Wrapped. Preferire interfacce esplicite nei componenti della nuova UI.
Decidere una strategia coerente di top layer per dialog nativi e altri overlay, coperta da test prima di estendere a tutti gli editor.
Rimuovere conferme inline e display:none del form soltanto dopo che l'equivalente overlay è collegato a tutti i percorsi di uscita.
Il nuovo Piano è comune alle due UI: la correzione funzionale dell'annullamento deve funzionare anche nel percorso corrente, con stile coerente al tema attivo. Gli interventi estetici generali restano circoscritti alla UI3.
Non cambiare i writer finanziari per semplificare lo stato dell'interfaccia.

### B. Tema e componenti base
File centrali: ui-v3.css; AppHeader; AdaptiveNav; AnalysisHeader; UI provider e root dei portali.
Materiali in un unico sistema di token, senza hardcode diversi per pagina.
Nuovo scope positivo per la UI3, con Wrapped fuori dal perimetro, inclusi portali.
Verticale di riferimento: Oggi → dettaglio categoria → movimento → modifica → annulla → continua/scarta.
Produrre screenshot e controllare contrasto/superfici prima di estendere. Correggere a questo punto l'eventuale effetto grigio, latteo eccessivo o mancanza di vetro.

### C. Pagine principali
DashboardV2; WealthScreen; PlanScreen; TransactionList.
Conservare origine, periodo, query e posizione nelle transizioni.
Le righe diventano compatte e i grafici prendono spazio reale; testi metodologici nei dettagli.
Mantenere identità delle categorie, convenzioni monetarie, stato degli importi e semantica dei selettori.
Confrontare grafici e tabelle sugli stessi dati prima/dopo.

### D. Analisi, investimenti, secondarie e impostazioni
Tutte le righe della matrice, compresi onboarding, import, notifiche, AI, export e strumenti avanzati.
Estrarre componenti da file grandi solo se facilita il lavoro richiesto; evitare un refactor generale indipendente dal redesign.
Conservare gate correnti; nessuna nuova chiamata AI o servizio esterno all'apertura di una schermata.
Correggere diciture ingannevoli senza modificare di nascosto la funzione che rappresentano.

### E. Verifica e consegna
Inventario completo dei controlli e delle rotte con esito, prove e limitazioni. Nessuna voce dichiarata testata se solo letta nel sorgente.
Screenshot con componenti reali, due temi e viewport rappresentativi.
Revisione del diff finanziario e confronto Wrapped. Nessun deploy o merge.

## Casi di accettazione prioritari
### Annullamento, scroll e focus
1. Aprire un editor senza modifiche e premere Annulla: nessun avviso superfluo.
2. Modificare un campo, scorrere il form in basso e premere Annulla: avviso interamente visibile senza scrollare.
3. Ripetere da X, Escape, backdrop e navigazione interna che chiude il flusso: stessa politica.
4. Continua a modificare: stesso valore, passo, filtri e offset scroll. Il form DOM resta montato.
5. Scarta: chiusura e origine ripristinata; nessun salvataggio del draft scartato.
6. Avviso aperto: editor e pagina non interagibili; focus soltanto sull'avviso.
7. Escape dall'avviso: ritorno all'editor, non chiusura di entrambi.
8. Picker aperto nell'editor: back chiude il picker; la bozza principale sopravvive.
9. Salvataggio lento/doppio tap: una sola richiesta, nessuna falsa conferma di annullamento.
10. Errore di salvataggio: dati conservati, retry visibile e funzionante.
11. Da dialog nativo Piano: avviso sopra al top layer, realmente cliccabile; nessuna lotta fra focus trap.
12. Tastiera aperta e rotazione viewport: avviso, Annulla e Salva raggiungibili; pagina sottostante ferma.
13. Focus ripristinato con preventScroll; trigger rimosso ha fallback stabile.
14. Misurare scrollTop della pagina e del form prima/dopo apertura/chiusura dell'avviso, con viewport stabilizzato: differenza <=2 CSS px salvo cambi contenuto intenzionali documentati.
15. Conferma scarto non aumenta scrollHeight del form e non ne azzera lo scroll.
16. Eliminazione singola/multipla/serie: ambito e conteggio corretti; errore conserva contesto.
17. Toggle autosalvato: non offrire un Annulla che promette un rollback inesistente.
18. Draft ripristinato da storage locale: scarto e messaggi rispecchiano davvero ciò che viene cancellato.

### Navigazione e pulsanti
19. Ogni grafico/card con affordance interattiva apre un dettaglio pertinente; nessun link placeholder.
20. Movimenti filtrati dal dettaglio ricevono categoria/conto, tipo e periodo corretti.
21. Back da deep link ha genitore affidabile; Back da origine interna conserva il contesto.
22. Due viste con stesso pathname e query differenti non si sovrascrivono scroll/filtri.
23. Accesso tastiera a pulsanti icona con nome; target almeno 44 px nei controlli principali.
24. Nessun doppio titolo, doppia X o doppio Indietro nei livelli sovrapposti.
25. Vedi tutte apre lettura, non editor; Salva apre/scrive ciò che dichiara.
26. Cambio utente non mantiene dati, selezioni o draft del precedente.
27. Versioni senza budget/investimenti/AI e gate admin: nessun collegamento vuoto o ampliamento accessi.
28. Apple Pay rivedi/ignora/errore mantiene identità del pagamento e prevenzione duplicati.
29. Modale spesa: descrizione subito dopo importo, categorie con emoji, Registra storno accessibile.
30. Cancellare la condivisione/esportazione del sistema non produce un errore applicativo ingannevole.

### Temi, grafici e dati
31. Chiaro: fondo bianco, testo scuro, nessun velo beige/grigio globale. Scuro: fondo quasi nero, testo chiaro.
32. Portali, menu, tooltip, dialog, input nativi e tastiera seguono il tema; nessun flash di tema opposto.
33. I nuovi token non alterano Wrapped o UI2; il Piano conserva coerenza nel percorso corrente.
34. Contrasto testato sulle superfici composte: almeno 4,5:1 testo normale, 3:1 testo grande e componenti essenziali come obiettivi di progetto; non dichiarare conformità completa senza audit.
35. Ridotta trasparenza, backdrop-filter assente, forced colors e reduced motion hanno fallback usabile.
36. Zero, dato assente, dato negativo e dati insufficienti hanno rappresentazioni distinte.
37. Importi lunghi, nomi lunghi, testo al 200%, viewport 320 px e basse altezze senza overflow o CTA tagliate.
38. Grafici operabili con tap e tastiera; tooltip nel viewport; dati esatti consultabili in tabella.
39. Periodo aggiornato: etichette, numeri e serie coerenti, nessun dato vecchio con titolo nuovo.
40. No doppio conteggio di programmato/forecast, storni, versamenti o TFR; riusare i selettori correnti.
41. Un saldo negativo non entra in un donut come quota positiva; grafico alternativo o tabella.
42. Interpolazione non inventa estremi e assenza storico non produce una linea fittizia.
43. Nessuna perdita dei dettagli finanziari: tutte le informazioni spostate hanno una destinazione verificabile.
44. Lettura SVG con più istanze: gradienti/clip/tooltip non collidono per ID duplicati.
45. Dock e footer non coprono le ultime righe; nessuno scroll concatenato dietro agli overlay.

### Wrapped e regressioni
46. Hash dei file Wrapped invariati; diff delle regole .wrapped-* vuoto.
47. Screenshot deterministicamente comparabili in app light/dark: stessi materiali, colori, testo, dimensioni e stories.
48. Avanti/indietro, pausa, chiusura, durata e barre di avanzamento identici.
49. Entry, finestra stagionale, eccezione admin e route identici.
50. Riepilogo, obiettivo finale, chiusura e navigazione non alterati da helper condivisi.
51. Aprire/chiudere un editor prima di Wrapped non lascia scroll lock, inert o token errati.
52. Nessun popup promozionale o release interrompe le stories.

## Verifica tecnica
- Seguire package.json e CI aggiornati. Dalla cartella sunny: npx tsc --noEmit, npm test, npm run build.
- Per il solo redesign non modificare Rules/Functions. Se una modifica imprevista tocca tali contratti, giustificarla separatamente e usare i gate pertinenti.
- Eseguire suite browser esistenti in ui-preview e aggiungere regressioni comportamentali per annullamento/layer/back/chart, senza riscrivere test per assecondare il nuovo DOM.
- Usare fixture e confine I/O già presenti. Non introdurre parametri che bypassano auth o autorizzazioni nell'app di produzione.
- Viewport minimi: 390x844, 768x1024, 1440x900; stress 320x568 e landscape basso; due temi.
- Controllare i test temporali UTC/Europe-Rome quando cambiano filtri/periodi. I due fallimenti Roma storicamente documentati vanno riverificati sulla nuova baseline, non attribuiti automaticamente al redesign.
- Test di accessibilità automatizzati e controlli manuali del focus non equivalgono a certificazione su Safari/iPhone o screen reader reali.
- Performance: confrontare con baseline su stessa macchina, numero dati e viewport; evitare animazioni continue e blur per riga. Non dichiarare fluidità su hardware non provato.

## Output richiesti
1. Branch e commit di implementazione, senza merge/deploy.
2. Riepilogo per utente di cosa cambia e motivazione.
3. Inventario controlli e route con copertura.
4. Screenshot delle quattro aree principali, di tutti i dettagli ridisegnati e del flusso Annulla → Continua/Scarta nei due temi.
5. Esiti reali di typecheck, test, build, browser, contrasto e regressioni Wrapped.
6. Limiti/blocchi rimasti distinti dalle attività completate.
7. Attivazione del pilot/pubblico trattata come passo di rilascio separato, non come effetto collaterale del codice.

## Limiti di questa consegna di studio
È stato esaminato il codice delle rotte e dei componenti elencati, non ogni combinazione renderizzata di ogni pulsante. Nessuna applicazione modificata, nessun test runtime rieseguito, nessun mockup presentato come screenshot reale. Il compito dell'agente implementatore include questa verifica finale.
