# Macrocategorie: definizioni e assegnazioni

## Comportamento

In Impostazioni → Gestione → Macrocategorie si creano e modificano definizioni con nome, emoji e colore attraverso lo stesso EditDefSheet usato per le categorie. La lista mostra le definizioni e il numero di categorie collegate; non assegna categorie. È possibile eliminare una macro con conferma.

Nel modulo di creazione o modifica di una categoria di spesa o investimento compare il selettore Macrocategoria, con le definizioni dello stesso ambito e Senza macrocategoria. La scelta è facoltativa. Conti ed entrate non mostrano questo campo. La gestione distingue Spese e Investimenti: la stessa etichetta può esistere nei due ambiti. Il modulo macro conserva emoji, nome e colore e aggiunge la scelta dell’ambito; una macro già assegnata non può cambiare ambito senza prima rimuovere le assegnazioni.

Nell’analisi Spese per categoria il selettore Categorie / Macro mantiene periodo e totale. Ogni macro usa nome, emoji e colore configurati; i gruppi sono espandibili fino alle categorie e ai relativi movimenti. La configurazione delle macro è accessibile soltanto da Impostazioni → Gestione → Macrocategorie.

## Dati e compatibilità

- `MacroCategoryDef`: id stabile, label, icon, color e `kind` opzionale (`expense` / `investment`); assenza di `kind` equivale a spesa. Array personale `macroCategories` nel documento impostazioni esistente.
- `CategoryDef.macroCategoryId`: riferimento opzionale. Gli id dei movimenti rimangono quelli delle categorie.
- Le assegnazioni testuali della prima versione sono riconosciute come definizioni con id legacy deterministico. Rinominarle conserva le relazioni.
- La prima modifica di una categoria salva atomicamente anche le definizioni legacy, evitando di perdere un riferimento passando dal testo all’id. Le scritture successive delle categorie non riscrivono le definizioni già memorizzate.
- Eliminare una macro lascia le categorie sotto Senza macrocategoria; i vecchi nomi non ricreano la definizione eliminata. Le categorie archiviate rimangono risolvibili nello storico.
- L’export JSON comprende anche le definizioni. Nessuna riscrittura dei movimenti, modifica a Wrapped, formule del Piano, rollout o permessi.
- Nomi normalizzati negli spazi; nomi duplicati nello stesso ambito senza distinzione maiuscole rifiutati. Nome macro fino a 80 caratteri, compatibile con la prima versione.

Nella pagina Investimenti il selettore Categorie / Macro raggruppa le posizioni visibili senza cambiare i calcoli del portafoglio: controvalore se disponibile (anche zero), altrimenti versato. Le posizioni archiviate restano escluse come prima. Ogni gruppo è espandibile e conserva i dettagli e le azioni originali delle posizioni. Le categorie senza assegnazione valida compaiono in Senza macrocategoria. Non ci sono collegamenti di gestione nelle analisi.

## Piano eseguito

- [x] Definizioni stabili e risoluzione delle assegnazioni legacy, con test di rinomina, eliminazione e primo salvataggio atomico.
- [x] Gestione delle definizioni in Gestione, riusando modulo e righe delle categorie; assegnazione nel modulo categoria.
- [x] Analisi con metadati della macro e compatibilità storica; export aggiornato.
- [x] Verifica di moduli, bozze, stati di errore e caricamento, UI2/UI3 e temi; build e suite unit.

## Verifica iniziale delle macro spese (precedente a questa estensione)

- Build e TypeScript passati. Suite unit: **959 passati, 5 skipped**, 95 file passati e uno skipped.
- Browser Chromium con fixture: **otto combinazioni** (UI2 390 nei due temi; UI3 320/390/1440 nei due temi). Creazione e modifica di una macro, selezione emoji/colore, assegnazione a categoria esistente e nuova, rilettura, metadati nell’analisi, rinomina con collegamenti conservati, eliminazione con totale invariato.
- Errore di salvataggio: messaggio visibile e bozza conservata. Impostazioni non caricate: creazione bloccata anche con collegamento diretto.
- UI3: conferma di scarto e continua a modificare; conti e investimenti conservavano i rispettivi campi; in questa verifica iniziale il selettore macro compariva solo nelle spese.
- Passata la regressione Settings esistente. Nessun errore JS o overflow orizzontale nelle combinazioni verificate.
- Ultimo adattamento visivo: tipo categoria su due colonne nei moduli UI3 mobile per evitare sovrapposizioni. Build rieseguita e flusso completo ripetuto in quattro combinazioni UI3 320/390 chiaro/scuro; verificato che il testo dei pulsanti entri nei controlli.
- Revisione indipendente: corretto il rischio di scrittura prima del caricamento iniziale con blocco della pagina e delle funzioni di salvataggio. Nessun altro rilievo concreto.

[Evidenze, log e screenshot](../evidence/macro-definitions/). Prove con dati illustrativi, nessun accesso agli account privati o prova su Safari fisico.

## Sunny 2.1.0 — annuncio a tutti

La gestione è disponibile a utenti normali e admin, in UI2 e UI3. Nessuna modifica al resolver UI3, agli altri rollout o ai permessi. Versione applicazione, registro e metadati npm aggiornati a 2.1.0 (27 ottobre 2026).

La release attiva l’avviso Novità esistente all’ingresso: spiega dove creare la macro e come assegnarla alle categorie, con l’esempio Casa = Affitto 700 € + Bollette 100 € + Arredamento 50 € = 850 €. Il pulsante Configura le macrocategorie apre Impostazioni / Gestione / Macrocategorie.

La conferma è memorizzata per utente e versione nel browser/dispositivo corrente. Un secondo account sullo stesso browser riceve il proprio annuncio; una conferma non vale su altri dispositivi. La decisione di sospendere il secondo avviso di release resta coerente con la stessa chiave.

Verifiche: build/TypeScript e 961 unit passati, 5 skipped; dodici combinazioni browser (utente normale UI2 / admin UI3 × due temi × 320/390/1440). Verificati testo dell’esempio, versione, CTA, creazione di una macro da parte di entrambi i ruoli e mancata riapertura dopo conferma. Caso aggiuntivo con cambio account sullo stesso browser ed Escape. Revisione indipendente senza rilievi. Evidenze in [macro-release](../evidence/macro-release/). Chromium con fixture; nessuna lettura di account privati.


## Estensione agli investimenti e barra contestuale

Verificata in dodici combinazioni UI2/UI3, temi chiaro/scuro e 320/390/1440 px. Suite completa: 974 passati, 5 skipped. Dettagli, inventario dei controlli, limitazioni ed evidenze in [barra contestuale e macro investimenti](contextual-app-header.md) e nel relativo [rapporto](../evidence/app-header-investment-macros/).
