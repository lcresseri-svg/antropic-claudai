# Bande riepilogative dei raggruppamenti — 16 ottobre 2026

La vista UI3 Movimenti riutilizza la testata con banda della vista per giorno
anche per mese, conto e categoria. Titolo, conteggio, totale statistico e
segmenti entrate/uscite/investimenti descrivono le righe filtrate del gruppo.
I programmati sono conteggiati separatamente, esclusi dalla banda dei realizzati;
un gruppo solo previsto mantiene il totale previsto esplicitamente etichettato.

La testata resta visibile a gruppo chiuso. Il pulsante espone aria-expanded e
aria-controls; selezione del gruppo e informazione sul flusso rimangono azioni
separate. Conservati Comprimi/Espandi tutti, ordinamento, filtri e densità delle
righe: nessun raggruppamento interno per giorno né nuovi spazi tra movimenti.
Nessuna modifica a Wrapped, calcoli, rollout o permessi.

Verifiche reali: build/TypeScript passati; 25 test di raggruppamento e flusso
finanziario passati; 12 viste Chromium (tre raggruppamenti, due temi,
390/1440 px) passate. Controllati banda persistente, chiusura da tastiera,
riapertura, compressione/espansione globale, selezione del gruppo, righe
adiacenti senza spazio aggiuntivo e assenza di overflow. Screenshot e log
in `evidence/group-bands/`. Nessuna prova su Safari fisico.
