# Barra contestuale Sunny e macro investimenti

## Obiettivo e scelte

La barra superiore usa un fondo pieno del tema, senza gradiente, ombra o sfocatura. Le schermate interne mostrano qui titolo e freccia Indietro al posto del contesto del mese; il contenuto non ripete questi elementi. La Home conserva il proprio contesto. Wrapped conserva la propria presentazione immersiva e non registra la barra contestuale.

La registrazione è solo stato di presentazione dell’app autenticata: nessuna scrittura delle preferenze, cambio permessi o rollout UI3. I collegamenti diretti usano un genitore sicuro; una navigazione interna registrata torna alla schermata di provenienza. Titoli dinamici e azioni sono registrati dalla pagina; la mappa delle rotte fornisce il titolo durante il caricamento.

I selettori del periodo restano accanto ai dati. Le intestazioni dei modali e delle sezioni incorporate restano locali. Le azioni della pagina restano raggiungibili dalla barra, con etichetta accessibile anche quando il testo è nascosto su mobile. Il menu globale resta disponibile fuori dalle Impostazioni.

## Inventario dei controlli

| Schermata | Barra / controlli conservati |
|---|---|
| Home | Contesto originale, menu profilo/impostazioni |
| Patrimonio | Titolo, Indietro, Storico |
| Investimenti | Titolo, Indietro, menu gestione categorie; periodi e Versa/Disinvesti nel contenuto |
| Consigli | Titolo, Indietro |
| Piano / Il tuo mese | Titolo, Indietro; Modifica piano nella pagina Piano, mese e stato vicino ai dati |
| Piano mensile | Titolo del mese, Indietro |
| Movimenti | Titolo, Indietro, ricerca e selezione multipla; filtri e ricerca nel contenuto |
| Entrate / Spese per categoria / Saldo per conto | Titolo, Indietro, azioni originali dell’analisi |
| Andamento patrimonio | Titolo, Indietro; periodi e legenda nel contenuto |
| AI Coach | Titolo, Indietro, quota |
| Riepilogo mensile | Titolo, Indietro, export; mese e report nel contenuto |
| Previsione V3 / Patrimonio V2 / Impegni / Metriche | Titolo, Indietro; dati e controlli originali |
| Impostazioni e 18 sezioni | Titolo della sezione e Indietro; Conti/Categorie/Macro e Catalogo emoji admin tornano a Gestione; Riordina/Fine nella barra |
| Wrapped | Escluso dalla nuova registrazione; nessuna modifica al codice Wrapped |

## Macro investimenti

In Impostazioni → Gestione → Macrocategorie il modulo condiviso permette di creare macro Spese oppure Investimenti con emoji, nome e colore. Le assegnazioni si fanno nel modulo della categoria corrispondente. La pagina Investimenti offre Categorie / Macro, con gruppi espandibili e dettagli originali. Un esempio: ETF e fondi azionari sotto Crescita, obbligazioni sotto Stabilità.

Le definizioni preesistenti senza ambito restano macro di spesa. Sono consentiti nomi uguali nei due ambiti; una macro assegnata non cambia ambito senza rimuovere prima le assegnazioni. I totali riusano i valori delle stesse posizioni visibili: controvalore se presente (zero compreso), altrimenti versato. Nessuna modifica a formule del Piano, movimenti o operazioni finanziarie.

## Verifica

Le evidenze di questa modifica sono in [app-header-investment-macros](../evidence/app-header-investment-macros/). I test browser usano Chromium e dati illustrativi locali, con richieste esterne bloccate; non rappresentano una prova su Safari/iPhone fisico né una lettura di account privati.
