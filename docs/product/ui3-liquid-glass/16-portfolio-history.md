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
