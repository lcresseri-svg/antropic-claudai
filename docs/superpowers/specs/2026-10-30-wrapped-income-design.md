# Wrapped: anche le entrate fanno parte del racconto

Richiesta: mantenere lo stile del Wrapped e aggiungere una lettura positiva delle entrate, ad esempio quando sono aumentate rispetto all’anno precedente. Questa richiesta autorizza esplicitamente l’estensione del Wrapped prima tenuto fuori dalle revisioni generali della UI.

Scelta di implementazione: una storia Entrate subito dopo Uscite, riutilizzando Story, Big e i token esistenti, più un richiamo nel riepilogo quando gli incassi sono cresciuti. Limitarsi al confronto finale lascerebbe ancora le entrate in secondo piano; una nuova pagina fuori dalla sequenza cambierebbe la struttura richiesta. I dettagli ordinari sono risolti autonomamente secondo le preferenze già espresse dall’utente.

La storia distingue entrate registrate e programmate. Il confronto positivo usa solo movimenti reali di tipo income, senza storni, trasferimenti o capitale disinvestito; date originali indipendenti dagli addebiti carta. Confronta lo stesso intervallo trascorso dell’anno precedente, gestendo il 29 febbraio. Non attribuisce una crescita alla sola presenza di più mesi registrati: il confronto richiede mesi con dati corrispondenti nei due periodi e un riferimento di entrate positivo. Se il confronto manca o le entrate non crescono, il totale rimane leggibile con testo neutro, senza congratulazioni inventate. Le entrate solo programmate sono dichiarate future.

Vincoli: nessuna variazione a timer, gesti, palette chiara/scura, animazioni, accesso stagionale/admin, obiettivo, salvataggi, rollout o formule delle altre storie. Nessuna dipendenza e nessuna lettura di dati privati. La media mensile usa lo stesso periodo del racconto. Il riepilogo mantiene i propri totali esistenti.
