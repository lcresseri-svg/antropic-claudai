# Wrapped: dalle macro aree alle abitudini

Richiesta: arricchire il Wrapped mantenendone lo stile, con un racconto dalle macro aree alle categorie, alla spesa singola più grande e alla voce più ricorrente. L'utente chiede esplicitamente un subagente per studiare la proposta. I dettagli ordinari sono risolti autonomamente secondo le preferenze già espresse.

## Approccio

Scelta: percorso narrativo con due nuove storie condizionali e riordino di quella largest già esistente. Un cruscotto aggiuntivo appesantirebbe le storie; aggiungere molte classifiche ripeterebbe gli stessi numeri. Sequenza: cover, uscite, entrate, macro aree, categorie, spesa più grande, voce frequente (oppure conteggio nella posizione originale), mese più caro, risparmio, investimenti, patrimonio, streak, confronto. Massimo 13 storie: la voce frequente sostituisce la storia count; il conteggio resta nel riepilogo. Timer e gesti invariati.

## Macro aree

Raggruppare i totali delle categorie di spesa già calcolati dal Wrapped attraverso resolveMacroId e le definizioni delle impostazioni. Conservare nome, emoji e colore, legacy, categorie archiviate, separazione spese/investimenti. Riferimenti mancanti o eliminati confluiscono in Senza macrocategoria; non indovinare macro dai nomi. Nessuna macro valida o meno di due categorie: omettere la storia. Raccontare le prime tre, percentuali sul totale uscite; dichiarare le altre e l'eventuale programmato. Mostrare un elenco compatto anche nel riepilogo.

## Voce frequente

Solo spese già avvenute con ownShare positivo, al netto di condivisioni e rimborsi. Identità: seriesId se presente, altrimenti stessa categoria e descrizione identica dopo normalizzazione Unicode, spazi e maiuscole. Niente riconoscimento automatico di negozi, abbonamenti o cadenze. Senza descrizione e senza serie non attribuire abitudini. Richiedere almeno tre registrazioni su tre date diverse. Vincitore: numero decrescente, totale decrescente e chiave stabile. Mostrare etichetta, numero, totale netto, media e numero di mesi, precisando che si contano soltanto spese già avvenute. Nessuna spesa futura, proiezione, storno o addebito carta conta come visita.

## Dettaglio e limiti

Spostare largest subito dopo categorie, preservando criterio/importo/stato programmato e aggiungendo nota sul netto rimasto a carico. Mettere un contesto quantitativo affidabile nella categoria numero uno: la copy attuale dice «quasi un terzo» anche oltre il 90% e va sostituita con la percentuale effettiva. Tutte le nuove etichette lunghe e gli importi devono stare a 320px, nei due temi e in UI2/UI3.

Nessuna query/scrittura nuova, dipendenza, modifica a Piano, formule esistenti, salvataggi, rollout, permessi, finestra Wrapped o tema. Nessuna lettura di conti privati. Anteprime sintetiche, test di dominio e browser; integrazione tramite PR con controlli verdi come già autorizzato.
