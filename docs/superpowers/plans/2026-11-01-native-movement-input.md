# Native movement input Implementation Plan

> Use superpowers:executing-plans to implement the tasks inline, followed by one independent final review.

Goal: importo e numeri con tastiera nativa, conto/data direttamente modificabili.
Spec: ../specs/2026-11-01-native-movement-input-design.md

1. [x] Test red: importo scrivibile singolo in UI2/UI3, assenza tastierino, conto/data disponibili in modalità rapida, salvataggio dei valori scelti e segnalazioni future/serie.
2. [x] Rimuovere lo stato del tastierino e gli input duplicati; azioni comuni mobile/desktop. Usare controlli nativi diretti per conto e data, preservando semantica e payload.
3. [x] Aggiornare gli scenari preview che presupponevano il tastierino; nuova matrice due UI/temi/viewport con tastiera simulata, scarto/focus, fallback calendario, salvataggi e campi opzionali.
4. [ ] Suite frontend e build, review indipendente, evidenze e inventario, branch/PR e integrazione già autorizzata soltanto dopo controlli verdi. Nessun deploy manuale dal branch.

Review focus: calendario su browser senza showPicker; nessuna tastiera automatica all'apertura; conto archiviato e versamento senza conto; quote/commissioni/rate ancora scrivibili; azioni sempre raggiungibili con viewport ridotto; bozze/focus/scarto invariati.
