# Macrocategorie: definizioni e assegnazioni

## Comportamento

In Impostazioni → Gestione → Macrocategorie si creano e modificano definizioni con nome, emoji e colore attraverso lo stesso EditDefSheet usato per le categorie. La lista mostra le definizioni e il numero di categorie collegate; non assegna categorie. È possibile eliminare una macro con conferma.

Nel modulo di creazione o modifica di una categoria di spesa compare il selettore Macrocategoria, con le definizioni esistenti e Senza macrocategoria. La scelta è facoltativa. Conti, entrate e investimenti non mostrano questo campo.

Nell’analisi Spese per categoria il selettore Categorie / Macro mantiene periodo e totale. Ogni macro usa nome, emoji e colore configurati; i gruppi sono espandibili fino alle categorie e ai relativi movimenti. La configurazione delle macro è accessibile soltanto da Impostazioni → Gestione → Macrocategorie.

## Dati e compatibilità

- `MacroCategoryDef`: id stabile, label, icon, color; array personale `macroCategories` nel documento impostazioni esistente.
- `CategoryDef.macroCategoryId`: riferimento opzionale. Gli id dei movimenti rimangono quelli delle categorie.
- Le assegnazioni testuali della prima versione sono riconosciute come definizioni con id legacy deterministico. Rinominarle conserva le relazioni.
- La prima modifica di una categoria salva atomicamente anche le definizioni legacy, evitando di perdere un riferimento passando dal testo all’id. Le scritture successive delle categorie non riscrivono le definizioni già memorizzate.
- Eliminare una macro lascia le categorie sotto Senza macrocategoria; i vecchi nomi non ricreano la definizione eliminata. Le categorie archiviate rimangono risolvibili nello storico.
- L’export JSON comprende anche le definizioni. Nessuna riscrittura dei movimenti, modifica a Wrapped, formule del Piano, rollout o permessi.
- Nomi normalizzati negli spazi; nomi duplicati senza distinzione maiuscole rifiutati. Nome macro fino a 80 caratteri, compatibile con la prima versione.

## Piano eseguito

- [x] Definizioni stabili e risoluzione delle assegnazioni legacy, con test di rinomina, eliminazione e primo salvataggio atomico.
- [x] Gestione delle definizioni in Gestione, riusando modulo e righe delle categorie; assegnazione nel modulo categoria.
- [x] Analisi con metadati della macro e compatibilità storica; export aggiornato.
- [x] Verifica di moduli, bozze, stati di errore e caricamento, UI2/UI3 e temi; build e suite unit.

## Verifica effettiva

- Build e TypeScript passati. Suite unit: **959 passati, 5 skipped**, 95 file passati e uno skipped.
- Browser Chromium con fixture: **otto combinazioni** (UI2 390 nei due temi; UI3 320/390/1440 nei due temi). Creazione e modifica di una macro, selezione emoji/colore, assegnazione a categoria esistente e nuova, rilettura, metadati nell’analisi, rinomina con collegamenti conservati, eliminazione con totale invariato.
- Errore di salvataggio: messaggio visibile e bozza conservata. Impostazioni non caricate: creazione bloccata anche con collegamento diretto.
- UI3: conferma di scarto e continua a modificare; conti e investimenti conservano i rispettivi campi, mentre il selettore macro compare solo nelle spese.
- Passata la regressione Settings esistente. Nessun errore JS o overflow orizzontale nelle combinazioni verificate.
- Ultimo adattamento visivo: tipo categoria su due colonne nei moduli UI3 mobile per evitare sovrapposizioni. Build rieseguita e flusso completo ripetuto in quattro combinazioni UI3 320/390 chiaro/scuro; verificato che il testo dei pulsanti entri nei controlli.
- Revisione indipendente: corretto il rischio di scrittura prima del caricamento iniziale con blocco della pagina e delle funzioni di salvataggio. Nessun altro rilievo concreto.

[Evidenze, log e screenshot](../evidence/macro-definitions/). Prove con dati illustrativi, nessun accesso agli account privati o prova su Safari fisico.
