# Editor e tastiera mobile

Il modale Apple Pay aveva due intestazioni e, all'apertura della tastiera iOS, il viewport visibile si restringeva mentre le media query continuavano a usare l'altezza del layout. Testa e azioni fisse potevano comprimere la zona dei campi fino a tagliare l'importo.

Il titolo aggiunto da DialogSurface viene omesso quando TransactionModal presenta già la propria intestazione. Con viewport visibile inferiore a 600 px, il dialogo diventa l'unico contenitore scorrevole: il form mantiene la propria altezza naturale. Dimensionamento e safe area restano relativi al viewport visibile. Nessuna modifica a ordine campi, formule, salvataggi, Wrapped, UI2 o resolver.

## Verifica

`ui-preview/liquid-keyboard.mjs` riproduce il caso con layout 393×852 e visualViewport 393×390, offset 45, senza ridimensionare il layout. Prima della correzione fallisce: due titoli anziché uno. Dopo: quattro casi passati (Apple Pay e movimento generico, chiaro/scuro); un solo titolo, campi senza compressione, azione raggiungibile, testo e focus conservati dopo annullamento dello scarto e chiusura tastiera. Dialogo entro y57–423, corpo naturale 427/434 px.

Gli screenshot in `evidence/modal-keyboard/` mostrano il viewport ridotto simulato; non includono una tastiera nativa. Chromium locale, non prova su Safari/iPhone fisico.

Ulteriori controlli: TypeScript e build passati; 839 test unitari passati, 5 saltati; 8 scenari scarto/chiusura (movimento e Piano, due temi, altezza 844/500) passati; 8 scenari safe area categorie/conti passati. `git diff --check` pulito.
