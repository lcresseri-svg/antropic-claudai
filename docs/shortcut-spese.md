# Shortcut iOS — Aggiungi spesa (admin, fase preview)

Aggiunge una **spesa** a Sunny in modo *headless* da iOS, autenticandosi con un
**token** (non con la sessione Firebase). In questa fase tutto è **admin-only**:
solo l'admin può generare il token (da *Impostazioni → Shortcut spese*) e quindi
usare la Shortcut. Gli endpoint runtime accettano qualsiasi token valido, ma il
token lo ottiene solo l'admin.

La Shortcut crea **solo** movimenti `type = "expense"`, con importo positivo.

---

## Endpoint (Cloud Functions, region `europe-west1`)

Base URL (progetto `sunny-a2a98`):

```
https://europe-west1-sunny-a2a98.cloudfunctions.net
```

| Funzione | Metodo | Auth | Uso |
|----------|--------|------|-----|
| `getExpenseOptions` | GET  | `Authorization: Bearer <TOKEN>` | Elenco categorie (solo spesa) e conti per nome |
| `addExpense`        | POST | `Authorization: Bearer <TOKEN>` | Crea la spesa |
| `issueExpenseToken` / `listExpenseTokens` / `revokeExpenseToken` | — | Firebase ID token + admin | Gestione token (usati dalla UI, non dalla Shortcut) |

> `<TOKEN>` è il token generato in app, **non** un ID token Firebase.

### `GET getExpenseOptions`
Risposta:
```json
{ "ok": true, "categories": ["Spesa", "Ristoranti", "..."], "accounts": ["Conto principale", "..."] }
```
Liste vuote → `ok:true` con array vuoti (gestisci il caso nella Shortcut).

### `POST addExpense`
Body JSON:
```json
{ "amount": "12,50", "category": "Ristoranti", "account": "Conto principale", "description": "Pizza" }
```
- `amount`: accetta virgola o punto (`12,50` o `12.50`), deve essere > 0 (salvato positivo).
- `category` / `account`: per **nome**, case-insensitive (devono combaciare con `getExpenseOptions`).
- `description`: opzionale; se vuota viene usato il nome categoria.
- `date`: impostata automaticamente a **oggi** (fuso `Europe/Rome`).

Risposta OK:
```json
{ "ok": true, "id": "<txId>", "summary": "−12,50 € · Ristoranti · Conto principale" }
```
Errore (esempi): `400` con `{ "ok": false, "error": "Categoria \"X\" non trovata.", "validCategories": [...] }`,
`401` token assente/revocato, `429` rate-limit (max 30 richieste/ora per token).

---

## Pubblicare la Shortcut UNA volta

Costruisci la Shortcut in *Comandi rapidi* e poi **Condividi → Copia link iCloud**
(così è importabile da tutti i dispositivi). Passi consigliati:

1. **Import Question (token)** — nelle impostazioni della Shortcut aggiungi una
   *Domanda all'importazione* per il token (es. testo "Incolla il token di Sunny")
   collegata a una variabile/Testo. Così ogni installazione chiede il token una
   volta, all'import, senza scriverlo nella Shortcut.
2. **URL base** — hardcoda `https://europe-west1-sunny-a2a98.cloudfunctions.net`.
3. **GET opzioni** — *Get Contents of URL* su `…/getExpenseOptions`
   - Method: `GET`
   - Header: `Authorization` = `Bearer ` + token
   - *Get Dictionary from Input* → leggi `categories` e `accounts`.
4. **Scegli categoria/conto** — *Choose from List* sulle `categories`, poi un'altra
   *Choose from List* sugli `accounts`.
5. **Importo** — *Ask for Input* (tipo *Number*), "Quanto hai speso?".
6. **Descrizione** — *Ask for Input* (tipo *Text*, **facoltativa, in fondo**),
   "Descrizione (opzionale)".
7. **POST spesa** — *Get Contents of URL* su `…/addExpense`
   - Method: `POST`
   - Header: `Authorization` = `Bearer ` + token, `Content-Type` = `application/json`
   - Request Body: *JSON* con `amount`, `category`, `account`, `description`.
8. **Esito** — *Get Dictionary from Input*:
   - se `ok` è vero → *Show Notification* con il campo `summary`;
   - altrimenti → *Show Notification* con il campo `error`.

---

## Dopo la pubblicazione / il deploy

- **`SUNNY_EXPENSE_SHORTCUT_URL`** — incolla il link iCloud della Shortcut
  pubblicata in `sunny/src/features/settings/expenseShortcut.ts` (sostituisce il
  placeholder). È il link che l'app apre dopo aver generato il token.
- **URL delle function** — dopo il primo deploy verifica che gli endpoint
  rispondano sull'host `https://europe-west1-sunny-a2a98.cloudfunctions.net`
  (sono v2/HTTP, già in `europe-west1`). Se il progetto cambia, aggiorna sia
  questo documento sia `FN_BASE` in `expenseShortcut.ts`.

---

## Sicurezza (fase attuale)

- Il token in chiaro **non** viene mai salvato: in Firestore vive solo
  `expenseTokens/{sha256(token)}` (id = hash). Regole: accesso client negato,
  gestito solo dall'Admin SDK.
- Generazione/gestione token: **admin-only** (Firebase ID token + UID admin).
- Rate-limit per token: max 30 richieste/ora → `429`.
- Per estendere a tutti gli utenti in futuro basterà rimuovere il gate admin
  nella UI; gli endpoint runtime già funzionano per qualsiasi token valido.
