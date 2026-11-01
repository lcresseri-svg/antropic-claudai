# Movimento: tastiera nativa, conto e data diretti — 1 novembre 2026

Branch `feat/native-movement-input`, dalla main `96885fed46f5be276727fd17515b42d77ac2a89d`. [Specifica](../../superpowers/specs/2026-11-01-native-movement-input-design.md) e [piano](../../superpowers/plans/2026-11-01-native-movement-input.md).

Tastierino interno e relativa preferenza rimossi. L'importo è un solo campo editabile con tastiera decimale; quote, TFR, commissioni, totale piano, numero rate e mesi statistici usano anch'essi input nativi. Nessuna apertura automatica della tastiera quando si apre il modale. Il riquadro Conto è un select nativo a tutta superficie; Data apre il calendario direttamente dal gesto utente. Eliminati i passaggi Modifica e Dettagli avanzati per accedere a questi valori.

## Esiti

- **1.149 test frontend passati in 116 file**, nessuno skipped; [log](unit-tests.log). Nuovi test osservati prima fallire e poi passare per input nativo, accesso diretto a conto/data, picker/fallback e conservazione del conto all'apertura.
- **TypeScript e build produzione passati**, [log](build.log). Avvisi Vite/Browserslist preesistenti; nessuna dipendenza modificata.
- **16 combinazioni browser passate**: UI2/UI3 × chiaro/scuro × 320/390/834 touch/1440. Controllati input singolo scrivibile, assenza tastierino, selezione reale del conto da tastiera dopo il click sul riquadro, richiesta al calendario nativo dal bordo del riquadro, data futura, payload salvato e Salva e aggiungi un'altra.
- **4 suite funzionali nei due temi/UI**: quote condivise 100→60 personali+40 trasferiti; TFR/commissione/mesi statistici; versamento senza conto; rate 100/3→33,33; conto archiviato; errore di salvataggio; browser senza showPicker; trasferimento con origine/destinazione e data. [Risultati principali](results.json) e [verifica aggiuntiva dei mesi statistici](regression/extras-results.json).
- **8 percorsi di scarto passati**, modale movimento e Piano nei due temi a 844/500px. X, Escape, backdrop (e Annulla del Piano) conservano bozza, focus, scroll del form e della pagina. [Log](regression/dismiss.log).
- Passati i cinque controlli di dialogo, bozza, input nativo, retry e backdrop, oltre alla suite interazioni con tablet, Apple Pay, impostazioni, navigazione, confronto UI2/UI3 e timer/swipe/obiettivo Wrapped. [Controlli](regression/checks.log) e [interazioni](regression/interactions.log).
- Revisione indipendente del codice senza nuove regressioni P1/P2. Nessuna variazione ai costruttori finanziari, formule, ordine del form, Piano, Wrapped, rollout o permessi.

## Problemi riprodotti e risolti

1. **Footer tablet con tastiera**: riducendo il solo visualViewport a 450px, il footer UI2 a larghezza 834 terminava a y537 oltre il limite visibile y480. Il modale rispetta ora sia la viewport visibile sia il limite desktop, mantenendo il form scorribile e il footer accessibile. [Prova iniziale](regression/tablet-viewport-red.log). Tutte le sedici combinazioni finali passano con visualViewport.height=450 e offsetTop=30.
2. **Conto originale sostituito dal predefinito**: l'effetto di ripiego leggeva lo stato precedente all'inizializzazione e sovrascriveva il conto dell'operazione, anche se archiviato. La stessa sequenza poteva aggiungere un conto a un versamento senza conto. Test red→green e verifica reale di modifica/salvataggio: l'inizializzatore conserva il valore originale; il ripiego continua ad agire sui cambi successivi di tipo o disponibilità dei conti.
3. Aggiornati gli scenari storici che presumevano un tastierino e il pulsante di ritorno all'interno della pagina Impostazioni, ora nella barra contestuale.

## Inventario dei controlli

| Controllo | Esito |
| --- | --- |
| Importo | Un input, editabile al tocco, inputMode decimal, virgola/punto mantenuti |
| Conto | Select nativo aperto dal riquadro, valore scelto verificato nel payload |
| Data | Calendario da click o Invio/Spazio, fallback senza showPicker, avviso futuro mantenuto |
| Da conto / A conto | Origine e destinazione distinte nei trasferimenti, valori e data salvati |
| Quote, TFR, commissione | Input nativi decimali, valori e scomposizioni salvati verificati |
| Numero rate / mesi distribuzione | Input nativi interi; rata e distribuzione mantenute |
| Salva / Salva modifiche | Azione unica e visibile, conservazione bozza su errore |
| Salva e aggiungi un'altra | Disponibile anche su mobile, mantiene conto/data/categoria e pulisce l'importo |
| X / Escape / backdrop | Stesso percorso UI3 di conferma scarto, nessuno spostamento o perdita dati/focus |
| Descrizione UI2 | Tastiera solo dopo apertura esplicita del campo, nessun autofocus su dati precompilati |
| Campi aggiuntivi | Invariati opzioni, serie, rate, storni e relativi salvataggi |

## Screenshot

- [Chiaro 390](ui3-light-390.png) · [scuro 390](ui3-dark-390.png).
- [Tablet con spazio ridotto dalla tastiera](ui3-light-834-keyboard.png).
- [UI2 mobile](ui2-light-390.png) · [UI2 scuro con spazio ridotto](ui2-dark-390-keyboard.png).

Prove Chromium con dati sintetici. La riduzione visualViewport simula lo spazio occupato dalla tastiera: le immagini non mostrano una tastiera OS reale. Nessuna prova su Safari/iPhone fisico o lettura di account privati. Il controllo nativo del dispositivo determina l'aspetto di tastiera, menu e calendario.
