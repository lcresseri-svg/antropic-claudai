// Client helpers for the admin-only "Expense Shortcut" feature. Mirrors the
// onRequest + Bearer(ID token) pattern used by the AI Coach (aiCoachUtils.ts):
// the Cloud Functions are plain HTTP endpoints, authenticated with the current
// user's Firebase ID token. Everything here is gated to the admin in the UI.

import { getAuth } from 'firebase/auth';

const FN_BASE =
  `https://europe-west1-${import.meta.env.VITE_FIREBASE_PROJECT_ID as string}.cloudfunctions.net`;

// iCloud share link of the PUBLISHED "Aggiungi spesa" Shortcut, opened by the
// in-app button after a token is generated (see docs/shortcut-spese.md).
export const SUNNY_EXPENSE_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/86d16fba92e34559ad5de93820426beb';

export interface ExpenseTokenMeta {
  id: string;             // doc id = sha256(token); safe to expose (not the token)
  label: string;
  revoked: boolean;
  createdAt: number | null; // ms epoch
  lastUsedAt: number | null;
}

async function currentIdToken(): Promise<string | null> {
  return (await getAuth().currentUser?.getIdToken()) ?? null;
}

export async function issueExpenseToken(
  label: string,
): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const idToken = await currentIdToken();
  if (!idToken) return { ok: false, error: 'session' };
  try {
    const resp = await fetch(`${FN_BASE}/issueExpenseToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ label }),
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok || !data.ok) return { ok: false, error: (data.error as string) ?? 'error' };
    return { ok: true, token: data.token as string, id: data.id as string };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function listExpenseTokens(): Promise<
  { ok: true; tokens: ExpenseTokenMeta[] } | { ok: false; error: string }
> {
  const idToken = await currentIdToken();
  if (!idToken) return { ok: false, error: 'session' };
  try {
    const resp = await fetch(`${FN_BASE}/listExpenseTokens`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok || !data.ok) return { ok: false, error: (data.error as string) ?? 'error' };
    return { ok: true, tokens: (data.tokens as ExpenseTokenMeta[]) ?? [] };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function revokeExpenseToken(id: string): Promise<{ ok: boolean; error?: string }> {
  const idToken = await currentIdToken();
  if (!idToken) return { ok: false, error: 'session' };
  try {
    const resp = await fetch(`${FN_BASE}/revokeExpenseToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ id }),
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok || !data.ok) return { ok: false, error: (data.error as string) ?? 'error' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Human-readable Italian message for an error code returned above. */
export function shortcutErrorMsg(code: string): string {
  switch (code) {
    case 'session':   return 'Sessione scaduta: ricarica la pagina e riprova.';
    case 'forbidden': return 'Solo l\'amministratore può gestire i token.';
    case 'network':   return 'Errore di rete. Controlla la connessione e riprova.';
    case 'not-found': return 'Token non trovato (forse già revocato).';
    default:          return 'Operazione non riuscita. Riprova tra poco.';
  }
}
