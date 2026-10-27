# Macrocategorie nell’analisi delle spese

Direzione richiesta: selettore Categorie / Macro nella pagina Spese per categoria; gruppi espandibili con accesso ai dettagli e ai movimenti delle categorie. Gestione delle assegnazioni dalla stessa pagina. Periodi e totale invariati; nessuna assegnazione automatica.

Scelta tecnica: campo opzionale `macroCategory` su CategoryDef (solo spese), salvato nel documento impostazioni esistente. Il nome identifica il gruppo; normalizzazione degli spazi e confronto senza distinzione maiuscole. Le categorie senza assegnazione, anche quelle storiche non risolte, restano sotto Senza macrocategoria. Una modifica dell’assegnazione raggruppa tutto lo storico. Le categorie archiviate sono configurabili per conservare la leggibilità dello storico.

## Piano
- [x] Helper puro di aggregazione e assegnazione con test su totali, dati mancanti, nomi e rimozione; nessuna mutazione della sorgente.
- [x] Editor delle assegnazioni con suggerimenti dei nomi esistenti, salvataggio esplicito, gestione errori e conferma di scarto UI3.
- [x] Selettore Categorie / Macro, composizione coerente e gruppi espandibili; navigazione al dettaglio esistente.
- [x] Build, unit e prova browser nei due temi su mobile e desktop, compresi draft e salvataggio; consegna su branch separato.

## Risultati

- Build / TypeScript passati. Unit: 957 passati, 5 skipped (96 file).
- Browser Chromium: otto combinazioni (UI3 320/390/1440 nei due temi, UI2 390 nei due temi). Assegnazione, totale invariato, espansione/chiusura, dettaglio della categoria e ritorno a Categorie verificati. Nessun errore JS o overflow orizzontale della pagina.
- Scarto UI3: continua a modificare conserva la bozza. Errore di salvataggio simulato: errore visibile e bozza conservata.
- Revisione indipendente: corretto il rischio di sovrascrivere assegnazioni non toccate durante aggiornamenti delle impostazioni. L’editor si apre solo dopo il caricamento e salva solo le assegnazioni modificate, applicate alle definizioni correnti. Regressione unit dedicata.
- Il nuovo salvataggio atteso usa persistFirst; le chiamate esistenti mantengono l’aggiornamento ottimistico precedente.
- Nessun aggiornamento a Wrapped, home, form movimento, formule del Piano, rollout o permessi.
- Limiti: fixture illustrative, nessuna prova su Safari fisico o account privati. Nomi come identificatori di gruppo: per unire categorie si usa lo stesso nome; per separarle si cambia o svuota l’assegnazione. Nessuna migrazione dei movimenti.

[Evidenze e screenshot](../evidence/macro-categories/).

## CI server

La prima CI è stata bloccata dall’audit high su body-parser 1.20.8, già nel lockfile server della base. Aggiornata soltanto la patch a 1.20.9 (tre righe del lockfile), senza modifiche al codice delle funzioni. Compilazione funzioni e audit con soglia high passati localmente; rimangono otto segnalazioni moderate preesistenti.
