# Emoji e colori nei moduli condivisi

27 ottobre 2026 — 262 emoji e 56 colori disponibili per conti, categorie e macrocategorie. Aggiunte unghie, parrucchiere donna/uomo, persone con diverse carnagioni e capelli, benessere, cibo, casa, mobilità e tempo libero. Tutte le scelte preesistenti sono conservate.

La palette completa è ordinata per famiglie: rossi, arancioni, gialli/oro, lime/oliva, verdi, verde acqua, ciano, blu, indaco, viola, rosa, terra e neutri. La vista iniziale conserva i 15 colori familiari; Mostra altri colori / Mostra meno colori apre e richiude l’elenco. Un nuovo colore scelto resta visibile anche nella vista compatta. Le emoji restano espandibili e la selezione richiude l’elenco restituendo il focus al toggle. Espansione e selezione sono esposte anche tramite gli stati ARIA.

## Esiti reali

- Prima della modifica, la prova falliva perché mancava il comando per espandere i colori (`before.log`).
- Build e TypeScript passati; 974 unit passati, 5 skipped, zero fallimenti.
- Flusso browser completo: **12 combinazioni** UI2/UI3 × chiaro/scuro × 320/390/1440 px. Verificati espansione/riduzione, nuovo colore conservato nella vista compatta e alla riapertura, presenza delle emoji richieste, salvataggio/rilettura di unghie e taglio capelli, focus dopo richiusura, selettore condiviso nei conti e negli investimenti. Nessun errore JS, overflow o scrittura di movimenti.
- Regressione macro esistente: UI2/UI3 390 px in entrambi i temi, creazione, assegnazione, rinomina, eliminazione, errore di salvataggio con bozza conservata e blocco durante caricamento: passata.
- Revisione indipendente senza rilievi.

Script riproducibile: `sunny/ui-preview/liquid-definition-pickers.mjs`, incluso nel runner delle suite. Screenshot selezionati a 390 px. Chromium con fixture illustrative e rete esterna bloccata; nessuna prova su Safari/iPhone fisico. Wrapped, formule e rollout UI3 non modificati.
