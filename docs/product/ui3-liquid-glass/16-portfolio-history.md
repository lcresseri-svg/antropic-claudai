# Storico nella pagina Investimenti — 17 ottobre 2026

Il selettore già presente nel dettaglio del fondo era assente nella pagina
Investimenti, il cui grafico restava bloccato agli ultimi dodici mesi.
Ora UI3 apre Tutto lo storico disponibile, con 6 mesi / 1 anno / Tutto.
Le etichette includono l'anno e il conteggio indica i mesi effettivamente
rappresentati. Un solo mese disponibile viene dichiarato e rappresentato.

La curva mostra capitale versato a fine mese, ricostruito dalle posizioni
visibili e dai movimenti realizzati. Esclude categorie archiviate e proiezioni;
contributi e disinvestimenti seguono la data effettiva, senza ripartizione
statistica. I capitali iniziali datati entrano nel mese corretto; quelli senza
data rimangono una base costante, esplicitamente dichiarata nella pagina.
Il valore di mercato rimane solo il riferimento di oggi. Nessuno storico di
mercato inventato. UI2, formule del Piano, Wrapped e rollout invariati.

Verifica: build/TypeScript; 33 test di storico/performance/periodi; sei viste
Chromium (320/390/1440 px, chiaro/scuro), cambio periodo da tastiera, tabella
dati con 22/6/12 mesi, capitale finale invariato, assenza di overflow ed errori
JavaScript. Tutti passati. Evidenze in evidence/portfolio-history/.

## Correzione urgente del blocco — 17 ottobre 2026

Riprodotto un ciclo senza termine con una data iniziale non ISO oppure un anno
inferiore a 100: Date.UTC rimappava gli anni 0–99 al 1900–1999, rimandando il
ciclo all'indietro nel futuro. Dopo 23.123 iterazioni tornava al 1999-11.
Ora i mesi sono indici interi strettamente decrescenti; date persistite/importate
validate prima di usarle come estremi. Date anomale non modificano il capitale
né i dati salvati, ma non diventano confini dello storico.

Verifiche: 8 test (inclusi anno 99→100, anno 1, date non ISO, calendario e runtime
non-stringa), build/TypeScript e 6 viste browser con data anomala passati.
Il caso riprodotto corrisponde al sintomo riferito; la specifica data presente
nell'account dell'utente non è stata letta.
