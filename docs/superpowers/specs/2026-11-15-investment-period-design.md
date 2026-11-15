# Versamenti del periodo

Richiesta approvata: aggiungere negli investimenti una scheda con i filtri già usati per spese ed entrate, mostrando versamenti lordi e prelievi separati.

Approcci: riutilizzare PeriodControls e useAnalysisPeriod mantiene gli stessi intervalli e la navigazione; estendere il filtro della curva del portafoglio mescolerebbe patrimonio e flussi. Si adotta il primo approccio, coerente con la proposta approvata.

La scheda usa le date effettive, senza ripartizione statistica. Include contributi senza conto e TFR già compreso nell'importo; esclude template ricorrenti, proiezioni e date future. I prelievi mostrano il capitale rimborsato, come registrato dalle operazioni di investimento, con etichetta esplicita. Il patrimonio complessivo resta distinto. Nessuna modifica ai dati salvati.

## Aggiornamento richiesto
Il valore principale diventa **Versato netto = versamenti lordi − quota TFR − capitale rimborsato dai disinvestimenti**. Le tre componenti restano visibili nella scheda; un risultato negativo resta negativo. Il TFR viene sottratto solo dai versamenti del periodo, limitato all'importo del singolo versamento. Non si modifica il calcolo del patrimonio.
