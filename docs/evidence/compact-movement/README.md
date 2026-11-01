# Modale movimento: altezza aderente al contenuto

Richiesta precisata dall'utente: compatto verso il basso, eliminando lo spazio vuoto. Intervento limitato all'altezza del contenitore e all'ancoraggio in basso; dimensioni, spaziature e controlli del form conservati.

Il modale non forza più l'altezza dell'intera viewport. La regola è limitata a movement-editor e prevale anche sulle regole dei drawer UI3. Quando il contenuto è lungo, rimane il limite della viewport visibile con scroll interno e footer accessibile. Nessuna modifica a logica, tastiera nativa, picker, salvataggi, altri modali o Wrapped.

## Esiti reali

- Test geometrico red→green: nel caso UI2 chiaro a 320px il vecchio contenitore aveva 302,75px inutilizzati; tutti i sedici casi finali misurano zero spazio residuo tra ultimo campo e footer, al netto del padding.
- A 390px: UI2 da 820 a 498,75px; UI3 da 820 a 678,94px. Il bordo inferiore resta a y832 nella viewport alta844.
- **16 casi geometrici passati**, UI2/UI3, chiaro/scuro, 320/390/834/1440. Verificati anche espansione delle rate e footer raggiungibile a 500px di altezza. [Risultati](results.json).
- **20 scenari di regressione nativa passati**, incluse tastiera simulata, conto/data diretti, salvataggi, rate, quote, TFR, commissioni, conto archiviato, versamento senza conto e fallback calendario. [Risultati](regression/native-results.json).
- **8 percorsi di scarto movimento/Piano passati**, nei due temi e a 844/500px: valori, focus, scroll e dimensioni del form stabili. [Log](regression/dismiss.log).
- **1.149 test frontend passati**, TypeScript e build produzione passati. Revisione indipendente senza rilievi.

## Anteprime

- [Chiaro 390](ui3-light-390.png) · [scuro 390](ui3-dark-390.png).
- [Desktop](ui3-light-1440.png) · [UI2](ui2-light-390.png).
- [Form espanso in spazio ridotto](ui3-light-390-expanded.png).

Inventario dei controlli invariato: [verifica del modale nativo](../native-movement/README.md). Prove Chromium con fixture, nessun accesso a conti privati o verifica su Safari fisico.
