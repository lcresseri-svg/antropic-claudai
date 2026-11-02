# Ricorrenti con occorrenze personalizzate

Requisito aggiornato il 2 novembre 2026: modifica singola come normale movimento; modifica serie anche sullo storico, conservando le personalizzazioni.

- `seriesOverride: true` viene salvato sulle occorrenze modificate singolarmente, comprese le gambe ricostruite di una quota condivisa. Il collegamento alla serie rimane disponibile.
- La propagazione interessa passato, oggi e futuro. Salta i flag espliciti e, per i dati senza flag, le differenze nei campi del movimento rispetto alla regola precedente. Non è possibile ricostruire con certezza l'intenzione delle vecchie modifiche: una vecchia variazione della regola può quindi essere preservata come un'eccezione, e una vecchia modifica manuale identica alla regola non è distinguibile dai dati originari.
- Regole e occorrenze allineate sono scritte in una sola transazione. La regola viene confrontata con lo stato atteso; una seconda scheda con dati vecchi deve riaprire l'editor. Ogni occorrenza è ricontrollata nella transazione: una personalizzazione concorrente prevale.
- Controlli rimborsi legacy ripristinati nella validazione preliminare; controlli autorevoli e controvalori rimangono nella transazione. Un errore non lascia la regola aggiornata e lo storico a metà. Restano applicabili i limiti delle transazioni Firestore: un batch eccessivo fallisce senza commit parziali.
- Serie condivise con gli stessi componenti mantengono le identità e propagano tutte le quote. Aggiungere/rimuovere quote o commissioni conserva gli interi gruppi storici e cambia la composizione futura; il modulo lo comunica.
- Cessazione: le voci personalizzate vengono scollegate usando i dati freschi, conservando campi finanziari e stamp investimento; una cancellazione pianificata non può eliminare una personalizzazione successiva.

## Esiti

- Suite frontend: **1.173 test, 117 file**, tutti passati.
- Test aggiuntivi finali del gestore/modulo: **34 passati**.
- TypeScript/build: passati.
- Firestore locale con regole reali: **16 test passati**, inclusi salvataggio singolo, override concorrente, differenze legacy, rollback per rimborso, cancellazione concorrente, regola obsoleta e scollegamento con stamp conservati.
- Chromium: **8 scenari**, UI2/UI3 × chiaro/scuro × 390/1440px, zero errori JS. Sequenza: singola 1,24→7,50; serie 0,74→20 (storico ordinario e futuro a20, personalizzata a7,50, legacy234,33 conservato); singola→20 uguale alla regola; serie→30 (singola resta20, ordinaria30). Gestore/modulo reali, persistenza UI sintetica; scrittori reali verificati separatamente nell'emulatore.
- Revisione indipendente conclusiva: nessun P1/P2 residuo.

Nessuna migrazione o scrittura sui dati live dell'utente eseguita dai test. Wrapped, Piano, rollout e permessi invariati. Avvisi preesistenti Vite/Browserslist/bundle nei log, senza errori.
