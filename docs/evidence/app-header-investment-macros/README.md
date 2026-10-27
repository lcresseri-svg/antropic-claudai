# Verifiche barra contestuale e macro investimenti — 27 ottobre 2026

- Build/TypeScript: passati. Test unit: **974 passati, 5 skipped**, zero fallimenti.
- Impostazioni: 17 sezioni × 12 combinazioni = **204 viste**. Titolo e Indietro nella barra, genitori corretti, Riordina/Fine, barra ferma e piena, assenza di titoli duplicati. UI2 390/1440 e UI3 320/390/834/1440, chiaro/scuro.
- Altre pagine: 16 rotte × 12 combinazioni = **192 viste**. UI2/UI3 320/390/1440, chiaro/scuro. Controllate ricerca/selezione, menu investimenti, azione Piano, menu globale e ritorno interno allo Storico. Ripristino del focus sul pulsante Storico verificato in UI3. Wrapped escluso dalla barra contestuale.
- Macro investimenti: **12 combinazioni** UI2/UI3 × temi × 320/390/1440. Totali gruppi = portafoglio (10.975 € della fixture), controvalore zero e fallback versato, posizioni archiviate escluse; dettagli e azioni conservati; macro omonime nei due ambiti, assegnazione e nuova categoria investimento, valori finanziari e data conservati, zero scritture di movimenti.
- Regressioni: 8 casi scarto modali (editor/Piano × 2 temi × 2 altezze), selezione dopo errore bulk, Piano con salvataggio/annullamento/errore/conflitto/zero, ritorno a mese storico, palette stampa, focus Impostazioni e dettagli investimento annidati: passati.
- Revisione indipendente: rilevata perdita di focus delle azioni migrate nella barra, corretta estendendo cattura e ripristino alle sole azioni contestuali; nuova riproduzione passata, nessun rilievo residuo.

Le immagini selezionate sono a 390 px nei due temi e versioni. Le matrici complete sono nei JSON; gli script riproducibili sono in `sunny/ui-preview/liquid-{settings-header,page-headers,investment-macros}.mjs`.

Dati illustrativi locali, richieste esterne bloccate. Chromium: nessuna prova su Safari/iPhone fisico e nessun accesso ai dati privati.
