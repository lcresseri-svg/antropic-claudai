# Inserimento movimento con controlli nativi

Richiesta: eliminare il tastierino interno; toccare il valore apre la tastiera del dispositivo. Conto e data si modificano direttamente dai due riquadri, aprendo selettore e calendario, senza un comando Modifica intermedio.

Scelta: un singolo input testuale con inputMode decimal per l'importo, anche su mobile e tablet; input numerici nativi per quote, commissioni, TFR e rate. Nessun autofocus dell'importo all'apertura. Rimuovere tastierino, preferenza e duplicazione dei campi per breakpoint; mantenere normalizzazione e payload finanziari esistenti. Azioni Salva e Salva e aggiungi un'altra disponibili a tutte le dimensioni.

Conto e data sempre visibili nella posizione attuale del form, anche nell'inserimento rapido. Riquadri con controlli HTML nativi, nomi accessibili e focus visibile. Select include il conto archiviato già associato e l'eventuale Senza conto per versamenti ammessi. Data apre il calendario con showPicker nel gesto utente, con fallback al controllo nativo se non disponibile. Conservare indicazioni di data futura e modifica serie. Trasferimenti conservano origine/destinazione distinte e data.

UI2 e UI3 nei due temi; nessuna modifica a formule, ordine del modulo, storni, Piano, Wrapped, rollout, permessi o persistenza. Nessuna nuova dipendenza. UI3 conserva conferma di scarto sopra l'editor, focus, bozze e viewport con tastiera. Anteprima sintetica, nessun accesso a conti privati. Preferenza utente già espressa: risolvere i dettagli ordinari e procedere autonomamente.
