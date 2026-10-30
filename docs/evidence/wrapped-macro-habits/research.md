# Studio del subagente

Il subagente `wrapped_story_research` ha letto i componenti Wrapped, il modello finanziario, le definizioni macro e i resolver esistenti. Raccomandazione adottata: un racconto a zoom (macro → categorie → spesa singola → abitudini), mantenendo la storia delle entrate e gli strumenti del Wrapped.

La spesa maggiore esisteva già: è stata spostata, senza duplicarla. La storia della frequenza sostituisce quella del solo conteggio quando ha dati sufficienti. Il conteggio resta in copertina e nel riepilogo; massimo 13 storie, timer di 15 secondi invariato.

Alternative considerate: aggiungere soltanto macro e frequenza della categoria (meno personale); creare capitoli selezionabili Panoramica / Abitudini / Progressi (più invasivo sulla navigazione). Scelto il racconto esistente con due nuove storie condizionali.

Decisione dell'implementazione: per la frequenza usare l'identità della serie o, in sua assenza, la descrizione esattamente uguale dopo normalizzazione di Unicode/spazi/maiuscole, nella stessa categoria. La UI dichiara esplicitamente questa corrispondenza; non deduce esercente, visite o abbonamenti. Almeno tre spese positive su tre date diverse. Il consiglio del subagente di non usare similarità approssimate è rispettato.

Le macro corrispondono alle assegnazioni correnti, non a una classificazione storica salvata all'epoca del movimento; la UI lo dichiara. Nessuna macro inventata: dati incompleti o riferimenti eliminati restano in Senza macrocategoria.
