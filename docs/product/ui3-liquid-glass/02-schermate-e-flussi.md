# Sunny UI 3.0 — Schermate e flussi
Complemento della [specifica](01-specifica.md), base a0085a7 del 12 ottobre 2026.
Questa è la matrice di progetto. Le osservazioni derivano dalla lettura del codice; l'esecuzione Codex deve verificare i comportamenti in browser.

## Mappa delle pagine
| Pagina / route | Primo livello proposto | Grafico utile | Dettaglio e azioni |
|---|---|---|---|
| Oggi / | Saluto breve con emoji; sintesi mensile con metrica nominata correttamente; al massimo una priorità | Ritmo/spese del mese compatto | Tocco sul dato apre analisi; ultimi movimenti → movimento specifico; + → inserimento; riepilogo precedente accessibile |
| Patrimonio /wealth | Totale con base di valutazione esplicita e variazione sul periodo | Andamento totale; composizione liquidità/investito | Conto → dettaglio; investimento → portafoglio; storico → serie estesa; Impegni raggiungibile |
| Piano /budget | Margine del mese, stato e mese; obiettivi sintetici | Speso/programmato/residuo con limite; previsione per categoria nel dettaglio | Calcolo, modifica piano, categoria, sposta budget, programmazione e archivio; riusare Piano già implementato |
| Movimenti /transactions | Ricerca, periodo, totale filtrato e lista cronologica | Mini riepilogo per periodo opzionale, subordinato alla lista | Riga → editor; filtri → sheet compatta; selezione → toolbar contestuale; preservare query e scroll |
| Investimenti /investments | Capitale e controvalore distinti; eventuale rendimento solo con dati attendibili | Andamento e composizione per tipologia | Posizione → dettaglio; Versa, Disinvesti, Aggiorna valore; data ultimo valore sempre disponibile |
| Consigli /insights | Una priorità comprensibile e massimo tre suggerimenti iniziali | Mini confronto numerico solo se giustifica il consiglio | Apri motivazione, dati e azione; archivia con feedback; nessun testo lungo nella lista |
| AI Coach /ai-coach | Domanda/acquisto e input essenziali; risultato sintetico | Scenario confrontato col dato attuale, se il motore lo fornisce | Ragionamento e ipotesi espandibili; applicazione obiettivo esplicita con prima/dopo; errori/retry visibili |
| Entrate /income | Entrate del periodo, variazione confrontabile, fonte principale | Barre per mese + fonti ordinate | Tocco fonte → movimenti con tipo e periodo; KPI secondari in Statistiche; definizione netto/lordo nel dettaglio |
| Spese per categoria /category-spending | Totale periodo e ranking sintetico | Barre orizzontali; curva nel dettaglio categoria | Categoria → breakdown, previsto quando disponibile, limite e movimenti; emoji preservate |
| Saldo per conto /account-balance | Liquidità e lista conti con saldo | Sparkline per conto e andamento complessivo | Conto → saldo e flussi, poi movimenti filtrati per conto e periodo; modifica anagrafica separata |
| Andamento patrimonio /wealth-history | Totale/variazione nel periodo | Linea principale e serie attivabili | Punto con data, liquidità e investito; metriche max/min/media in dettaglio; origine di ritorno conservata |
| Riepilogo mensile /recap/:ym | Mese, risultato e tre valori principali | Entrate/uscite e categorie; traiettoria esistente | Confronto precedente, dettagli, movimenti, esporta/stampa; nessuna trasformazione in stories Wrapped |
| Impegni /commitments | Prossime scadenze e totale dovuto nel periodo | Timeline/calendario e composizione | Ricorrenze, rate, abbonamenti e investimenti distinti; serie → occorrenze; costo mensile equivalente separato |
| Impostazioni /settings/* | Ricerca e gruppi compatti | Nessun grafico decorativo | Aspetto, conti/categorie, funzioni, notifiche, dati/account; ritorno alla stessa posizione |
| Forecast /forecast-v3 | Stima finale e disponibilità dati; periodo chiaro | Registrato + stima distinta, confronti nel pannello analisi | Modelli V2/V3/V4, backtest e diagnostica conservati in sezioni tecniche; non rinominare un dato V3 come V4 |
| Patrimonio sperimentale /wealth-v2 | Totale e variazione; stato esperimento sobrio | Composizione e contributi alla variazione | Disponibilità e snapshot con dry-run chiaro; backfill richiede revisione esplicita; preservare gate |
| Piano sperimentale /monthly-plan | Stato e valori del piano sperimentale | Confronto piano/consuntivo/stima solo con stessi aggregati | Copia/genera/conferma; niente fusione automatica con budgetHistory; preservare gate e dati |
| Metriche /metrics | Periodo, DAU/WAU/MAU e aggiornamento | Curve separate/leggibili e barre adozione | Definizioni e tabella nel dettaglio; errore/riprova; accesso attuale preservato |
| Wrapped /wrapped/:year | IDENTICO all'attuale | IDENTICI all'attuale | Nessuna modifica a ingresso, navigazione, storie, riepilogo o obiettivo |

Tutte le rotte dichiarate in AppRoutes sono incluse. Il fallback di route sconosciuta conserva un ritorno sicuro a Oggi. La nuova UI non amplia i permessi di nessuna rotta, anche dove codice e commenti attuali usano etichette admin differenti.

## Specifiche delle quattro aree principali
### Oggi
Ordine: saluto; sintesi; eventuale azione urgente; andamento del mese; recenti; link al riepilogo.
Non ripetere lo stesso totale in tre schede. Home presenta una fotografia rapida, Patrimonio e Piano contengono le decisioni approfondite.
Se si mantiene un indicatore di risparmio maturato, chiamarlo con la sua definizione reale; non etichettarlo saldo disponibile o margine del Piano.
Il ritmo del mese può mantenere la vista calendario esistente; tap sul giorno filtra Movimenti, senza perdere il mese.
Pagamenti Apple Pay da confermare: riga prioritaria con conteggio, espandibile; il problema di conto mancante resta evidente durante la revisione.
Personalizzazione/riordino dei blocchi rimane accessibile via menu contestuale; niente handle su ogni scheda nella lettura normale.
La entry Wrapped rimane nello stesso contratto esistente: non ridisegnarla, spostarla o cambiarne condizioni in questo task.

### Patrimonio
Un grafico ampio anziché un mosaico di KPI equivalenti. Sotto, Liquidità e Investimenti come accessi leggibili.
Conservare la distinzione versato/controvalore del motore corrente: non cambiare la base di valorizzazione solo per rendere più attraente un grafico.
Il valore storico non viene ricostruito con il controvalore odierno come se fosse noto nel passato.
Conti ordinati con icona, nome e saldo; categorie investimento in elenco con data di aggiornamento.
I conti esclusi dal patrimonio non devono rientrare accidentalmente in un grafico della nuova UI.

### Piano
Il lavoro precedente resta la base: M, U, forecast, storni e finanziamento investimenti non cambiano.
Il primo livello contiene margine, periodo e stato. La frase che distingue il margine dal saldo diventa una breve etichetta “Sul piano del mese” con accesso Calcolo; quando ci sono entrate attese non incassate, la dipendenza resta visibile.
Il forecast per categoria introdotto l'11 ottobre resta presente nel dettaglio e visibile in lista in caso di rischio: non rimuoverlo per ridurre il testo.
“Il tuo piano” usa righe entrate/risparmio/investimenti. Testi metodologici vanno nel dettaglio già disponibile.
Il grafico di capacità usa gli stessi valori del selettore. Un piano negativo mostra il disavanzo; nessun clamp cosmetico.
Editor a passi, riepilogo breve fisso, confronto completo in dettaglio. Annullamento tramite conferma overlay comune.

### Movimenti
Ricerca e filtri compatti, non sempre espansi. Mostrare i filtri attivi e un comando Azzera.
Registrati e programmati sono distinguibili con testo oltre allo stile della riga.
Il totale riflette esattamente l'insieme filtrato e la metrica dichiarata.
Selezione multipla: entrata esplicita, numero selezionati, operazioni disponibili; annullare la selezione non richiede conferma perché non distrugge dati.
Eliminazione multipla: conferma con conteggio e ambito. Aspettare esito prima di uscire dalla modalità; fallimento conserva selezione.
Se una categoria non è compatibile con tutti i tipi selezionati, il comando lo spiega anziché applicare una modifica silenziosa.

## Flussi e finestre
| Componente / famiglia | Cambiamento richiesto | Azioni da verificare |
|---|---|---|
| TransactionModal | Importo dominante, descrizione immediatamente sotto, emoji; data/conto compatti; opzioni rare progressive; footer fermo | Nuovo/modifica, tipi, picker, tastierino, salva, retry, scarta, elimina, gruppi, serie, storno |
| RefundSheet | Spesa origine e massimo stornabile chiari; importo e conto; dettagli secondari espandibili | Scelta spesa, parziale/totale, salva, errore, scarto, back al movimento |
| SeriesDetailSheet | Prossima occorrenza, frequenza e stato; storico nel dettaglio | Modifica, occorrenza vs serie, ritorno, eliminazione se presente |
| SeriesEditChoiceSheet | Scelta concisa dell'ambito, conseguenze visibili | Solo movimento / serie futura; annulla torna al contesto senza mutazioni |
| ImportModal | Passi file → verifica → importa, anteprima e problemi evidenti | File, mapping, duplicati, modifica righe, back, conferma, errore, chiusura con lavoro non applicato |
| PlanEditor / PlanDialog | Contratto scroll/layer condiviso, riepilogo e footer fissi | Passi, draft, copia, conflitto, conferma, scarta, trasferimento limiti |
| BudgetEditSheet legacy | Non usarlo per ricostruire Piano nuovo; compatibilità UI2 | Verificare callback legacy; non attribuire Annulla a operazioni autosalvate |
| AccountDetailSheet | Saldo, grafico, flussi; statistiche secondarie progressive | Periodo, punto grafico, vedi movimenti, chiudi/ritorna |
| CategoryDetailSheet | Speso, limite, programmato e previsto nominati; trend | Periodo, filtri, movimenti, modifica limite se collegata, ritorno |
| InvestmentDetailSheet | Controvalore, versato e variazione distinti; serie e operazioni | Versa/disinvesti/valore, ritorno dopo child editor, errore |
| InvestmentDepositSheet | Importo e origine risorse; TFR/commissioni come opzioni esplicite | Save awaitable, validation, scarto, effetto sul conto, ritorno al dettaglio |
| InvestmentWithdrawSheet | Importo e destinazione; effetto su capitale/conti leggibile | Salva, errore, scarta; non chiamare il prelievo rendimento |
| SetCurrentValueSheet | Valore e data, significato chiaro | Salva, verifica, annulla senza perdita del contesto |
| EditDefSheet | Dati essenziali e sezioni avanzate per conto/categoria | Nuovo/modifica, icone/colore, archivia/elimina, scarta, salvataggio |
| MonthRhythmSheet | Calendario leggibile e periodo stabile | Cambio mese, selezione giorno, link filtrato, scroll interno |
| ReorderHomeSheet | Riordino intenzionale con modalità comprensibile | Drag + alternativa tastiera, reset, conferma/chiudi secondo persistenza reale |
| InsightDetailSheet | Motivo → prova grafica/dati → azione | Chiudi, azione pertinente, feedback, archive senza salto della lista |
| AffordabilityForm / risultato | Input essenziali e stato della richiesta | Invia, errore/retry, nuovo scenario, obiettivo con conferma prima/dopo |
| FeedbackSheet | Modulo breve e invio esplicito | Invio una sola volta, errore, conferma scarto del testo |
| RecapExportSheet | Formato e anteprima/azione chiari | Scarica, condividi, stampa, annullamento dialog sistema non trattato da errore |
| OptionSheet | Picker coerente con contesto padre | Selezione, annulla, Escape, ripristino focus senza perdere draft |
| PushPromoSheet | Permesso motivato al momento utile | Abilita su gesto utente, non ora, rifiuto/indisponibilità senza loop |
| ReleaseDialog / WhatsNew / ReleaseNotice | Un solo avviso informativo per volta | Chiudi, visto, coda; non interrompere editor o Wrapped |
| ApplePayPendingCard | Conteggio compatto e dettaglio dei pagamenti | Rivedi, scegli conto, registra una volta, ignora con conferma, errore |
| SyncStatusBanner / errori globali | Stato compatto ma non nascosto | Riprova reale quando disponibile, nessun successo fittizio |
| Login / Splash | Logo Sunny, tema coerente, azione autentica | Accesso, caricamento, fallimento; nessun grafico vuoto o card decorative |

Alcune finestre già hanno protezioni parziali: l'implementazione deve uniformarle, non aggiungere un secondo avviso sopra quello esistente.

## Onboarding
Sei passi attuali: benvenuto, obiettivi, primo conto, origine dati, risparmio, primo riepilogo.
Conservare la logica di persistenza, ma rendere esplicito il significato dei comandi:
- Avanti/Indietro navigano fra passi con bozza stabile; non ricreano un conto già creato.
- “Salta configurazione” se l'azione termina l'onboarding; “Salta questo passaggio” soltanto se avanza al passo successivo. Il codice corrente usa skipOnboarding: verificare la semantica prima del testo.
- Demo sempre chiamata “Dati di esempio”, distinta da dati personali, con conferma se comporta scritture e accesso alla rimozione esistente.
- Importazione parte dal vero importatore, non da una scelta che poi non porta al file.
- Gli obiettivi possono essere zero o rimandati; niente adesione implicita a un preset.
- Nessun nuovo provider UI in login/onboarding che abiliti funzioni non autorizzate. Coordinare il tema con lo stato pre-login esistente.

## Impostazioni, struttura proposta
| Gruppo | Contenuti | Regola |
|---|---|---|
| Aspetto | Chiaro / Scuro, eventuale Sistema solo se supportato o implementato integralmente | Cambio immediato senza flash; preferenza coerente fra app e portali |
| Conti e categorie | Saldi iniziali, nomi, icone, colori, ordine, archiviati | Annulla protegge bozze; evitare eliminazione dove l'azione reale è archiviazione |
| Funzioni | Piano, investimenti, inclusione nel patrimonio, AI e livello analisi | Effetto visibile e comprensibile; disattivare vista non cancella dati |
| Notifiche | Stato permesso, categorie notifiche, preferenze | Non dichiarare attive notifiche con permesso negato; azioni OS/browser spiegate quando servono |
| Dati | Importa, esporta, dati demo | Progressi e destinazione dell'azione reali |
| Account | Profilo, esci, cancellazioni | Azioni distruttive separate e confermate con testo preciso |

Lo stato tema Sistema non va aggiunto come pulsante inerte. Se implementato, mantenere scelta esplicita distinta dal tema risolto e seguire i cambi del sistema solo in quella modalità.

## Matrice azioni trasversali
| Comando | Contratto |
|---|---|
| + Aggiungi | Apre il flusso movimento con default coerente; nessuna scrittura fino al salvataggio |
| Numero/card cliccabile | Destinazione o dettaglio coerente con quel numero; titolo e periodo mantengono contesto |
| ‹ Indietro | Torna a origine interna o genitore noto; preserva filtri/scroll |
| X / Annulla | Nessuna modifica: chiude. Draft modificato: conferma overlay. Mai reset immediato nascosto |
| Salva / Registra | Valida, una sola richiesta, attende esito, feedback; errore conserva draft |
| Elimina / Ignora pagamento | Conferma con oggetto/ambito; nessuna risposta positiva prima dell'esito |
| Mostra tutte / Dettagli | Apre lettura completa; non apre un editor al posto del dettaglio |
| Copia mese / Usa suggerimento | Anteprima; sovrascrittura solo esplicita; mantiene distinzione draft/confermato |
| Cerca / Filtra | Solo vista; riepilogo filtri attivi e zero risultati con Azzera |
| Seleziona / Annulla selezione | Nessuna mutazione di dati; selezione stabile durante gli errori |
| Esporta / Condividi | Output reale; annullamento del sistema ritorna senza allarme |
| Toggle impostazione | Stato e salvataggio chiari; ripristino in caso di errore se appropriato |
| Grafico | Tap/keyboard mostrano dati; link a movimenti con filtri corretti |
| Logout / cambio utente | Pulizia degli stati UI e draft secondo policy esistente; niente dati dell'utente precedente |

## Inventario obbligatorio nell'implementazione
Codex deve completare un inventario dei controlli effettivamente renderizzati, non limitarsi alle famiglie sopra:
pagina; etichetta accessibile; condizione di visibilità; azione; destinatario/dati mutati; stato loading; errore; chiusura/back; test collegato.
Include pulsanti icona, menu overflow, link nei grafici, elementi condizionali, utenti senza AI/investimenti/budget e azioni admin.
Non dichiarare “tutti i pulsanti verificati” sulla base della sola ricerca di onClick nel sorgente. Servono flussi browser rappresentativi per ciascun contratto e copertura esplicita degli scostamenti.
