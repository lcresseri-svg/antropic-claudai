# Carte di credito e rimborsi multipli

## Richiesta e decisioni confermate

Sunny deve gestire conti carta di credito con giorno di addebito e conto abbinato, registrando acquisti e statistiche alla data indicata e spostando la liquidità soltanto al pagamento, nel mese successivo. L’utente ha confermato decorrenza da un mese scelto, inizialmente quello attuale; nessuna riclassificazione automatica dei mesi precedenti.

Dalla selezione multipla in Movimenti deve essere possibile registrare un rimborso. Con una sola spesa si apre il modulo attuale, invariato. Con più spese il modulo espone il totale ricevuto, anche inferiore o superiore ai costi. L’utente ha confermato che il residuo rimane proporzionalmente sulle categorie e sui mesi originali: 60+40 di spese e rimborso80 → residui12+8. Con rimborso120, costi azzerati e guadagno20 alla data d’incasso.

## Carte: comportamento

- Gestione conti / stesso modulo: flag Carta di credito; se attivo, giorno1–31, conto di addebito e mese di decorrenza obbligatori. Vietati conto abbinato uguale alla carta, altra carta, conto investimento o conto archiviato. Configurazioni datate conservate per non reinterpretare il passato; disattivare la carta non annulla le distinte dei mesi precedenti ancora da pagare. Una disattivazione con decorrenza nel mese corrente fa tornare immediati i movimenti di quel mese e rimuove la relativa distinta futura, evitando un doppio effetto sulla cassa. Dopo la prima attivazione, le impostazioni possono cambiare dal mese corrente in avanti; le distinte già addebitate mantengono conto e giorno.
- Il conto carta registra il debito. La liquidità non comprende la parte differita del conto carta; il patrimonio continua a comprendere il debito. Il pagamento banca→carta riduce liquidità e debito, lasciando invariato il patrimonio al pagamento.
- Per carta e mese sorgente, un solo trasferimento automatico banca→carta con id deterministico, importo positivo e metadata di distinta. Non una seconda spesa. Pagamento il giorno scelto del mese successivo, limitato all’ultimo giorno quando necessario; calendario Europe/Rome.
- La distinta usa i movimenti REALI del conto carta e le loro date: anche quota altrui delle spese condivise, rimborsi/accrediti e trasferimenti manuali. Mai usare ownShare/refundedTotal statistici per calcolarla. Esclusi i trasferimenti automatici stessi. Crediti netti vengono riportati alle distinte successive; nessun finto incasso bancario automatico.
- Le modifiche tardive alle spese ricalcolano la stessa distinta, senza nuovi addebiti duplicati. Conto/giorno di una distinta già addebitata restano quelli conservati nella distinta. Le configurazioni nuove valgono dalla decorrenza scelta.
- Modulo di dettaglio della distinta in sola lettura, con carta, periodo, banca, data e importo; le correzioni si effettuano sui movimenti sorgente. Distinte escluse dalle modifiche/eliminazioni ordinarie e dai rimborsi.
- Un’unica logica pura genera le distinte per client e backend. La vista client sostituisce eventuali righe automatiche non ancora aggiornate con il risultato canonico, senza raddoppi. Il backend riconcilia con transazioni Firestore sia su cambi di movimenti/configurazione sia con scheduler e catch-up, indipendentemente dall’app aperta. Elimina tutto non deve ricreare addebiti senza sorgenti.

## Rimborsi: comportamento

- Solo spese reali, non proiezioni/template ricorrenti/distinte, con quota personale ancora rimborsabile. Una selezione mista non permette il rimborso finché contiene movimenti incompatibili.
- Allocazione in centesimi proporzionale ai residui ancora rimborsabili, arrotondamento deterministico con totale esatto. La quota coperta scompare dalle statistiche originali; il residuo resta. La cassa entra soltanto alla data e sul conto scelti.
- Una ricevuta multipla comprende righe refund compatibili con il modello esistente, ognuna con refundOf e refundGroupId distinto da groupId; l’eccedenza è una riga income collegata. Il totale delle righe deve essere esattamente l’importo ricevuto. Guadagno con categoria sistema di entrata, non categoria di spesa.
- Le righe di uno stesso rimborso multiplo aprono lo stesso modulo di modifica; modifiche e cancellazione operano sull’intera ricevuta. Un retry non crea nuove righe; concorrenza fra ricevute non deve superare i residui.
- Controlli transazionali per sorgente coordinano creazione/modifica/eliminazione dei rimborsi, incluso il salvataggio dal modulo singolo invariato. Nessuna persistenza di refundedTotal nei documenti spesa.
- Una spesa collegata a rimborso multiplo non può essere eliminata o trasformata perdendo il collegamento: si modifica/elimina prima la ricevuta. Riduzioni di importo sotto la quota già coperta sono respinte. Lo stesso controllo vale nei percorsi replaceGroup e bulk. Eliminazione della ricevuta ripristina le statistiche.

## Vincoli e approccio

Nessuna modifica a Wrapped, formule del Piano, ordine del modulo movimento, rollout UI3 o accesso ai dati privati. Temi UI2/UI3 e controlli esistenti conservati. Nuovi metadata opzionali e compatibilità con conti e storni preesistenti. Nessuna nuova dipendenza.

Approccio scelto: passività su conto carta + trasferimento di pagamento, invece di posticipare la data delle spese (che sposterebbe le statistiche) o duplicarle come expense al pagamento. Per i rimborsi si estende il modello refund esistente con righe di allocazione collegate, invece di riscrivere tutte le somme di entrata e spesa in ogni consumatore.

## Verifica richiesta

Unit su date31/febbraio/bisestile/DST/anno, decorrenza, modifiche configurazione, quote condivise, crediti e rimborsi, idempotenza e cifre decimali. Emulatore su riconciliazione, concorrenza e aggiornamenti/cancellazioni; prove di salvataggio fallito e retry. Browser nei due temi e versioni per configurazione carta, spese prima/dopo pagamento, selezione singola/multipla, rimborso80/100/120, modifica/eliminazione, stati e focus. Verificare saldi, liquidità, patrimonio, grafici, categorie e Piano con numeri attesi, non soltanto presenza dei controlli.

## Note operative verificate

Le modifiche ai movimenti esistenti e i rimborsi richiedono connessione per verificare i controlli transazionali: in caso di errore il modulo resta aperto. Le nuove creazioni ordinarie conservano il percorso offline già esistente. Le operazioni massive ordinarie restano atomiche per blocchi di 180 documenti; una ricevuta rimborso, fino a 100 spese, è sempre atomica interamente. Le importazioni generiche di righe rimborso/ricevuta non possono aggirare il repository dedicato e vengono rifiutate esplicitamente.
