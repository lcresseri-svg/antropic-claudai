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

## Pannello filtri e tipo movimento

Pannello UI3 largo fino a 352 px, limitato alla larghezza disponibile: testo
opzioni 16 px, etichette 13 px, nessuno spazio aggiuntivo fra le voci, sezioni
più ravvicinate. Target di almeno 44 px mantenuti. Altezza calcolata sul viewport
per conservare spazio alla navigazione mobile; opzioni finali raggiungibili
scorrendo il pannello. Sfondo esplicitamente opaco.

Nuova voce “Per tipo movimento”: Entrata, Uscita, Investimento, Movimento e
Storno rimangono gruppi distinti, con le medesime funzioni di selezione e
apertura/chiusura. I trasferimenti non inventano entrate o uscite nella banda;
le formule statistiche esistenti rimangono invariate.

Verifiche aggiuntive: build/TypeScript passati, 6 pannelli a 320/390/1440 px
nei due temi passati (dimensioni e font effettivi, nessun overflow, tutti i
cinque tipi, tastiera e apertura/chiusura). Screenshot acquisiti dopo la fine
dell'animazione e risultati in `evidence/filter-panel/`.
La suite dei raggruppamenti aggiornata passa su 16 viste: mese, conto, categoria
e tipo, nei due temi a 390/1440 px; include selezione del gruppo e comandi globali.
