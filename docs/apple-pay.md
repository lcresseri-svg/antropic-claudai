# Apple Pay — pagamenti da confermare

L'automazione Wallet non crea direttamente una spesa. Invia il pagamento a
`receiveApplePayPayment`, che lo salva in `users/{uid}/applePayPending`. Saldi,
budget e statistiche cambiano soltanto quando il pagamento viene controllato e
confermato nel modale di Sunny.

## Token

L'endpoint usa lo stesso Bearer token della Shortcut **Aggiungi spesa**. Un token
creato prima dell'introduzione di Apple Pay è già valido.

Il token in chiaro viene mostrato da Sunny una sola volta. Se è già installato
nella Shortcut spese, apri quella Shortcut in modifica e copia il testo usato
nell'header `Authorization`. Copia soltanto la parte dopo `Bearer `. Se non è più
recuperabile, genera un nuovo token e aggiorna entrambe le Shortcut.

## Endpoint

```text
POST https://europe-west1-sunny-a2a98.cloudfunctions.net/receiveApplePayPayment
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "eventId": "UUID generato dalla Shortcut",
  "amount": "12,50",
  "currency": "EUR",
  "merchant": "Nome esercente",
  "description": "Nome esercente",
  "card": "Carta o pass usato",
  "date": "2026-08-29"
}
```

`eventId` è obbligatorio e deve essere generato una sola volta all'inizio di ogni
esecuzione. Se iOS ripete la stessa richiesta, Sunny restituisce il documento già
creato senza duplicarlo. Importo o esercente mancanti non fanno perdere il
pagamento: il documento arriva comunque nella coda e viene completato a mano.

## Creazione della Shortcut ricevente

I nomi delle azioni possono cambiare leggermente fra versioni/localizzazioni di
iOS. Il flusso è questo:

1. Crea una nuova Shortcut chiamata **Sunny — Ricevi Apple Pay**.
2. Aggiungi un'azione **Testo** contenente il token Sunny.
3. Aggiungi **Genera UUID** e conserva il risultato come `eventId`.
4. Dall'input della Shortcut/Transazione Wallet estrai separatamente:
   - **Importo**;
   - **Esercente** (o Nome, se Esercente è vuoto);
   - **Carta o pass**.
5. Aggiungi **Data attuale**, quindi **Formatta data** con formato personalizzato
   `yyyy-MM-dd`.
6. Aggiungi **Ottieni contenuto dell'URL**:
   - URL: quello indicato sopra;
   - metodo: `POST`;
   - corpo richiesta: `JSON` con le sette chiavi dell'esempio;
   - header `Authorization`: testo `Bearer ` seguito dal token;
   - header `Content-Type`: `application/json`.
7. Leggi il campo `ok` della risposta. Se vero mostra la notifica
   **Pagamento inviato a Sunny**; altrimenti mostra il campo `error`.

## Automazione Wallet

1. Apri **Comandi rapidi → Automazione → + → Transazione**.
2. Seleziona **Quando avvicino/tocco** e scegli le carte da collegare.
3. Imposta l'esecuzione immediata, senza richiesta di conferma, se la versione di
   iOS mostra questa opzione.
4. Come azione scegli **Esegui comando rapido** e seleziona
   **Sunny — Ricevi Apple Pay**.
5. Passa la **Transazione** ricevuta dall'automazione come input della Shortcut.

## Primo pagamento e associazione carta-conto

La prima transazione di una carta appare con **Conto da scegliere**. Nel modale
puoi correggere importo, data, descrizione, categoria, conto e spesa condivisa.
Alla conferma Sunny ricorda automaticamente quel conto per la carta. Le
associazioni si modificano o eliminano in
**Impostazioni → Comandi rapidi e Apple Pay → Carte Apple Pay**.

Le transazioni successive della stessa carta arrivano con il conto già
preimpostato. Cambiare il conto in un singolo riepilogo non modifica
automaticamente l'associazione esistente.
