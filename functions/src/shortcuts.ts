import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { createHash, randomBytes } from 'crypto';
import {
  db, ALLOWED_ORIGINS, bodyTooLarge, logError, verifyBearer,
  todayRomeISO, dropUndefined, sendToUser,
} from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE SHORTCUT API (token-authenticated)
//
// Lets an iOS Shortcut add an EXPENSE headlessly, authenticated with a minted
// bearer token (NOT a Firebase session). Available to ALL signed-in users: each
// user mints/manages tokens for THEIR OWN account (issueExpenseToken &co), and a
// token grants writes only to its owner's data. The runtime endpoints
// (getExpenseOptions / addExpense) trust the minted token.
//
// STYLE NOTE — onRequest, not onCall: this whole codebase authenticates HTTP
// endpoints with a Bearer header on purpose. The callable (onCall) protocol was
// returning "internal" before the handler ran in this project (see generateDigest
// in ai.ts), so we never use it. The management endpoints verify a Firebase ID
// token (verifyBearer, any user); the runtime endpoints verify a minted token.
//
// Tokens live in the top-level `expenseTokens` collection with doc id =
// sha256(token), so the plaintext token is NEVER stored. Client access is denied
// in firestore.rules — only the Admin SDK (these functions) can read/write them.
// ─────────────────────────────────────────────────────────────────────────────

const EXPENSE_SCOPE = 'expenses:write';
// Per-token safety cap: max authenticated requests in a rolling hour → 429. One
// shortcut run spends 2 (getExpenseOptions + addExpense), so ~15 adds/hour.
const MAX_EXPENSE_REQS_PER_HOUR = 30;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

interface ExpenseTokenDoc {
  uid: string;
  scope: string;
  revoked: boolean;
  createdAt?: FirebaseFirestore.Timestamp;
  lastUsedAt?: FirebaseFirestore.Timestamp | null;
  label?: string;
  rateWindowStart?: number; // ms epoch — start of the current rate-limit window
  rateCount?: number;       // requests counted in the current window
}

type ExpenseAuth =
  | { ok: true; uid: string; tokenHash: string }
  | { ok: false; status: number; error: string };

/** Shared Bearer middleware for the RUNTIME endpoints. Verifies a minted
 *  shortcut token (exists, not revoked, scope === expenses:write), enforces a
 *  rolling hourly rate limit, and stamps lastUsedAt. Returns the owning uid. */
async function authExpenseToken(authHeader?: string): Promise<ExpenseAuth> {
  const m = (authHeader ?? '').match(/^Bearer (.+)$/);
  if (!m) return { ok: false, status: 401, error: 'unauthorized' };
  const token = m[1].trim();
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };

  const hash = sha256(token);
  const ref = db.doc(`expenseTokens/${hash}`);

  // Verify the token AND advance the rolling-hour rate-limit window inside a
  // single transaction, so concurrent requests can never exceed the cap.
  return db.runTransaction(async (tx): Promise<ExpenseAuth> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 401, error: 'unauthorized' };

    const data = snap.data() as ExpenseTokenDoc;
    if (data.revoked) return { ok: false, status: 401, error: 'revoked' };
    if (data.scope !== EXPENSE_SCOPE) return { ok: false, status: 403, error: 'forbidden-scope' };

    const now = Date.now();
    const inWindow = data.rateWindowStart != null && (now - data.rateWindowStart) < 3_600_000;
    const windowStart = inWindow ? (data.rateWindowStart as number) : now;
    const count = inWindow ? (data.rateCount ?? 0) : 0;
    if (count >= MAX_EXPENSE_REQS_PER_HOUR) return { ok: false, status: 429, error: 'rate-limit' };

    tx.update(ref, {
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      rateWindowStart: windowStart,
      rateCount: count + 1,
    });
    return { ok: true, uid: data.uid, tokenHash: hash };
  });
}

type UserAuth = { ok: true; uid: string } | { ok: false; status: number; error: string };

/** Verify a Firebase ID token. Any signed-in user may manage THEIR OWN
 *  expense-shortcut tokens — every token is scoped to the caller's uid, and a
 *  token only ever grants writes to that same account. */
async function authUser(authHeader?: string): Promise<UserAuth> {
  const uid = await verifyBearer(authHeader);
  if (!uid) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true, uid };
}

// ── Token management endpoints (any signed-in user; per-user scoped) ──────────

/** Mint a new shortcut token. Returns the plaintext token ONCE; only the
 *  sha256 is persisted. */
export const issueExpenseToken = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authUser(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const label = String((req.body?.label as string | undefined) ?? '').trim().slice(0, 60) || 'Shortcut spese';

      const token = randomBytes(32).toString('base64url'); // robust, URL-safe
      const hash = sha256(token);

      await db.doc(`expenseTokens/${hash}`).set({
        uid: auth.uid,
        scope: EXPENSE_SCOPE,
        revoked: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedAt: null,
        label,
      });

      // The plaintext token is returned here and NEVER again.
      res.json({ ok: true, token, id: hash, label });
    } catch (err) {
      console.error('issueExpenseToken failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

/** List the caller's tokens — metadata only, never the token itself. */
export const listExpenseTokens = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authUser(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      // Equality-only query → no composite index needed; sort client-side.
      const snap = await db.collection('expenseTokens').where('uid', '==', auth.uid).get();
      const toMs = (t?: FirebaseFirestore.Timestamp | null) => (t ? t.toMillis() : null);
      const tokens = snap.docs
        .map(d => {
          const x = d.data() as ExpenseTokenDoc;
          return {
            id: d.id,
            label: x.label ?? '',
            revoked: !!x.revoked,
            createdAt: toMs(x.createdAt ?? null),
            lastUsedAt: toMs(x.lastUsedAt ?? null),
          };
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      res.json({ ok: true, tokens });
    } catch (err) {
      console.error('listExpenseTokens failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

/** Revoke one of the caller's tokens (soft delete: revoked = true). */
export const revokeExpenseToken = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authUser(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const id = String((req.body?.id as string | undefined) ?? '').trim();
      if (!id) { res.status(400).json({ ok: false, error: 'missing-id' }); return; }

      const ref = db.doc(`expenseTokens/${id}`);
      const snap = await ref.get();
      // Don't leak existence of tokens that aren't the caller's.
      if (!snap.exists || (snap.data() as ExpenseTokenDoc).uid !== auth.uid) {
        res.status(404).json({ ok: false, error: 'not-found' }); return;
      }
      await ref.update({ revoked: true });
      res.json({ ok: true });
    } catch (err) {
      console.error('revokeExpenseToken failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

// ── Runtime endpoints called by the Shortcut (minted token auth) ─────────────

/** GET: the user's expense categories and accounts (names), so the Shortcut can
 *  present a "Choose from List". Empty lists are returned as `ok:true` + []. */
export const getExpenseOptions = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authExpenseToken(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const settingsSnap = await db.doc(`users/${auth.uid}/meta/settings`).get();
      const settings = (settingsSnap.data() ?? {}) as {
        categories?: { label?: string; kind?: string }[];
        accounts?: { label?: string }[];
      };
      const categories = (settings.categories ?? [])
        .filter(c => c.kind === 'expense' && (c.label ?? '').trim())
        .map(c => (c.label as string).trim());
      const accounts = (settings.accounts ?? [])
        .filter(a => (a.label ?? '').trim())
        .map(a => (a.label as string).trim());

      res.json({ ok: true, categories, accounts });
    } catch (err) {
      logError('getExpenseOptions failed', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

/** POST: create ONE expense for the token's user. type is FORCED to 'expense'. */
export const addExpense = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      if (bodyTooLarge(req)) { res.status(413).json({ ok: false, error: 'payload-too-large' }); return; }
      const auth = await authExpenseToken(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const body = (req.body ?? {}) as { amount?: unknown; category?: unknown; account?: unknown; description?: unknown };

      // amount: accept "12,50" or "12.50"; must be finite, > 0, with a generous
      // technical cap (anti-DoS); stored positive.
      const amount = Number(String(body.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
        res.status(400).json({ ok: false, error: 'Importo non valido: inserisci un numero maggiore di zero.' });
        return;
      }
      const amountRounded = Math.round(amount * 100) / 100;

      // Resolve category/account by NAME (label), case-insensitive, against the
      // user's settings. Category is matched among EXPENSE categories only.
      const settingsSnap = await db.doc(`users/${auth.uid}/meta/settings`).get();
      const settings = (settingsSnap.data() ?? {}) as {
        categories?: { id?: string; label?: string; kind?: string; icon?: string }[];
        accounts?: { id?: string; label?: string }[];
      };
      const expenseCats = (settings.categories ?? []).filter(c => c.kind === 'expense' && c.id && c.label);
      const accs = (settings.accounts ?? []).filter(a => a.id && a.label);

      const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
      const cat = expenseCats.find(c => norm(c.label) === norm(body.category));
      if (!cat) {
        res.status(400).json({
          ok: false,
          error: `Categoria "${String(body.category ?? '')}" non trovata.`,
          validCategories: expenseCats.map(c => c.label),
        });
        return;
      }
      const acc = accs.find(a => norm(a.label) === norm(body.account));
      if (!acc) {
        res.status(400).json({
          ok: false,
          error: `Conto "${String(body.account ?? '')}" non trovato.`,
          validAccounts: accs.map(a => a.label),
        });
        return;
      }

      const description = (String(body.description ?? '').trim().slice(0, 500)) || (cat.label as string);
      const date = todayRomeISO();

      // EXACTLY the existing Transaction write shape (cf. useTransactions
      // withCreatedAt): auto-id doc, createdAt = ms epoch, type forced to
      // 'expense'. We never set seriesId / recurring / projected / shared /
      // groupId. Undefined fields are stripped.
      const txData = dropUndefined({
        date,
        description,
        amount: amountRounded,
        type: 'expense',
        category: cat.id as string,
        account: acc.id as string,
        createdAt: Date.now(),
      });
      const ref = await db.collection(`users/${auth.uid}/transactions`).add(txData);

      const amountStr = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amountRounded);
      const summary = `−${amountStr} · ${cat.label} · ${acc.label}`;

      // Best-effort native push, coherent with the app: category emoji + amount
      // + real category/account names. Reuses sendToUser (same path as
      // sendTestPush: multicast to every device token + invalid-token cleanup).
      // NEVER fails the request — the expense is already saved. Reuses the
      // category/account already resolved above (no second meta/settings read).
      try {
        const icon = (cat.icon ?? '').trim();
        // Same IT amount formatting as `summary`, but absolute and without the €
        // symbol (the template adds " €") — e.g. "50,00".
        const amountPlain = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amountRounded);
        const pushBody = `${icon ? `${icon} ` : ''}${amountPlain} € in ${cat.label} da ${acc.label}`;
        await sendToUser(auth.uid, 'Spesa aggiunta', pushBody, undefined, 'expense-added');
      } catch (err) {
        logError('addExpense: push failed (ignored)', err);
      }

      res.json({ ok: true, id: ref.id, summary });
    } catch (err) {
      logError('addExpense failed', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);
