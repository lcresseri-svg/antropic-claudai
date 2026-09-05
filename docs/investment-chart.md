# Grafico investimenti

La scheda distingue il controvalore (ultimi valori inseriti), il capitale netto
e la differenza latente. Se mancano tutti i controvalori non inventa un valore;
se mancano solo alcune valutazioni, il totale con fallback al versato è
esplicitamente stimato. Un controvalore pari a zero è una valutazione valida.

La linea mostra **capitale versato netto**, non performance di mercato.
Sunny non conserva lo storico dei controvalori per questa vista.
L'asse parte da zero; il dettaglio interattivo conserva gli importi esatti.

- Periodi: ultimi 3, 6 o 12 mesi, incluso il mese corrente parziale.
- Riepilogo periodo: versamenti, capitale rimborsato e apporti netti.
- Selezione del mese con mouse, touch, frecce, Home/End.
- Dettaglio: capitale a fine mese (ad oggi nel mese corrente) e movimenti reali.
- Solo posizioni visibili e movimenti effettivi: niente previsioni o categorie archiviate.
- Il capitale iniziale è trattato come saldo di apertura, non come versamento
  nel periodo. Le ripartizioni statistiche non spostano i movimenti reali.
- I rimborsi sono capitale restituito, non incasso comprensivo di plusvalenze;
  il pavimento a zero per categoria replica i saldi esistenti.
- Nessuna scrittura nel DB, migrazione o modifica al calcolo dei saldi globali.

## Verifiche

Da `sunny/`: `npm test` e `npm run build`.
I test dedicati sono `investmentTrend.test.ts` e `InvestmentOverviewCard.test.tsx`.
Coprono saldi iniziali, intervalli, future/proiezioni/ricorrenti, categorie
archiviate, rimborsi, TFR, arrotondamenti, serie piatte/vuote e valutazioni mancanti/zero.

Verifiche browser su dati sintetici: 1200, 768, 390 e 320 px; cambio periodo,
mouse/touch/tastiera, temi chiaro/scuro, perdita, valori mancanti o stimati,
serie piatte e vuote, nessun overflow orizzontale o errore runtime.

Il componente `MonthRhythm.tsx` è rinominato `MonthRhythmCard.tsx` senza variazioni
di comportamento: su Windows gli import senza estensione risolvevano invece
`monthRhythm.ts`, impedendo la compilazione completa.

Al 5 settembre 2026 la suite completa su Windows riporta due errori già
riprodotti sul commit base `3b6c201`: `forecastBehaviorV3.test.ts` (M9b,
decomposizione dello scarto) e `recapExport.test.ts` (formato della data).
Non sono modificati da questo intervento. I 19 nuovi test e la build passano.
