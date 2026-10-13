# Correzione mobile e tema nero — 13 ottobre 2026

Il fallback del grafico a elenco (oltre cinque categorie) occupava l’intera riga ma conservava accanto la legenda: riprodotti 69 px di overflow nello scroller interno. Ora l’elenco sostituisce anche la legenda e le etichette lunghe vanno a capo. Tutti i cinque contenitori del componente Donut adottano il layout responsive; UI2 mantiene la presentazione precedente.

Nella home UI3, “Dove vanno i soldi” mostra le cinque categorie principali più “Altre N”, con la somma di tutte le restanti. “Tutte” apre ancora il dettaglio completo. Nessuna variazione a calcoli o dati.

Il tema scuro usa sfondo #000000, superfici #080808/#101010 e navigazione nera al 92%. La tela esterna segue bianco/nero solo quando è presente la shell Liquid: i token ereditati di Wrapped rimangono invariati.

## Verifiche reali

- Regressione overflow osservata prima della correzione: 389 px di contenuto su viewport 320; 459 su 390. Dopo: larghezza contenuto uguale al viewport a 320/390/430 nei due temi.
- Scenario con 15 categorie: sei righe nella home, coda presente nel dettaglio dopo clic su “Tutte”, zero errori pagina. Screenshot finali e risultati in `evidence/mobile-fix/`.
- Matrice 19 rotte × 3 larghezze mobile × 2 temi: 114 render senza overflow del documento o dello scroller interno e senza errori pagina.
- 32 scenari di stress a 320 px con testo al 200%, dati vuoti e categorie lunghe: nessun overflow.
- Wrapped: storie, riepilogo, obiettivo, chiusura e pulizia editor superati nei due temi. Nessuna modifica ai file Wrapped.
- Suite UTC: 830 test passati, 5 saltati. Il test sul limite categorie è stato osservato fallire prima della correzione.

Verifiche browser eseguite in Chromium con viewport mobile; non sono prove su un iPhone fisico. La matrice e lo stress precedono la riduzione finale delle categorie; il test mirato di home e dettaglio è stato rieseguito sulla versione finale.
