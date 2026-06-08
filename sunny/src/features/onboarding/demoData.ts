import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Transaction } from '../../types';

type TxPayload = Omit<Transaction, 'id'> & { demo: boolean };

/** Generate ~35 realistic demo transactions + 3 recurring templates. */
export async function writeDemoData(uid: string, accountId: string): Promise<string[]> {
  const batch = writeBatch(db);
  const ids: string[] = [];

  const addTx = (payload: TxPayload) => {
    const slug = payload.description.toLowerCase().replace(/\s+/g, '_').slice(0, 12);
    const id = `demo_${payload.date}_${slug}_${Math.random().toString(36).slice(2, 5)}`;
    ids.push(id);
    batch.set(doc(collection(db, 'users', uid, 'transactions'), id), { ...payload, createdAt: Date.now() });
  };

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth(); // 0-indexed

  // Returns YYYY-MM-DD for (year, month 0-indexed, day)
  const iso = (y: number, m: number, d: number) => {
    const safe = new Date(y, m, d);
    return safe.toISOString().slice(0, 10);
  };

  // Past 3 full months
  for (let offset = 3; offset >= 1; offset--) {
    let m = cm - offset;
    let y = cy;
    if (m < 0) { m += 12; y -= 1; }

    // Income
    addTx({ date: iso(y, m, 1), description: 'Stipendio', amount: 2450, type: 'income', category: 'stipendio', account: accountId, demo: true });

    // Recurring expenses (regular non-template instances)
    addTx({ date: iso(y, m, 1),  description: 'Affitto',  amount: 700,   type: 'expense', category: 'casa',        account: accountId, demo: true });
    addTx({ date: iso(y, m, 5),  description: 'Netflix',  amount: 15.99, type: 'expense', category: 'abbonamenti', account: accountId, demo: true });
    addTx({ date: iso(y, m, 5),  description: 'Spotify',  amount: 10.99, type: 'expense', category: 'abbonamenti', account: accountId, demo: true });
    addTx({ date: iso(y, m, 9),  description: 'Palestra', amount: 39.90, type: 'expense', category: 'salute',      account: accountId, demo: true });

    // Variable expenses
    addTx({ date: iso(y, m, 7),  description: 'Esselunga',  amount: 48.75, type: 'expense', category: 'spesa',       account: accountId, demo: true });
    addTx({ date: iso(y, m, 12), description: 'Ristorante', amount: 57.30, type: 'expense', category: 'ristoranti',  account: accountId, demo: true });
    addTx({ date: iso(y, m, 14), description: 'Farmacia',   amount: 18.40, type: 'expense', category: 'salute',      account: accountId, demo: true });
    addTx({ date: iso(y, m, 19), description: 'Esselunga',  amount: 42.60, type: 'expense', category: 'spesa',       account: accountId, demo: true });
    addTx({ date: iso(y, m, 25), description: 'ENI',        amount: 60.00, type: 'expense', category: 'casa',        account: accountId, demo: true });
  }

  // Current month partial (days already elapsed)
  const today = now.getDate();
  if (today >= 1) {
    addTx({ date: iso(cy, cm, 1), description: 'Stipendio', amount: 2450,  type: 'income',  category: 'stipendio',  account: accountId, demo: true });
    addTx({ date: iso(cy, cm, 1), description: 'Affitto',   amount: 700,   type: 'expense', category: 'casa',       account: accountId, demo: true });
  }
  if (today >= 2) {
    addTx({ date: iso(cy, cm, 2), description: 'Esselunga', amount: 35.40, type: 'expense', category: 'spesa',      account: accountId, demo: true });
    addTx({ date: iso(cy, cm, 2), description: 'Trenord',   amount: 7.80,  type: 'expense', category: 'trasporti',  account: accountId, demo: true });
  }
  if (today >= 3) {
    addTx({ date: iso(cy, cm, 3), description: 'Caffè',     amount: 2.80,  type: 'expense', category: 'ristoranti', account: accountId, demo: true });
  }

  // Recurring templates — show upcoming subscriptions
  const nextMonth = cm + 1 > 11 ? 0 : cm + 1;
  const nextYear  = cm + 1 > 11 ? cy + 1 : cy;

  const netflixTemplateId  = `demo_template_netflix`;
  const spotifyTemplateId  = `demo_template_spotify`;
  const palestraTemplateId = `demo_template_palestra`;

  ids.push(netflixTemplateId, spotifyTemplateId, palestraTemplateId);

  batch.set(doc(collection(db, 'users', uid, 'transactions'), netflixTemplateId), {
    date: iso(nextYear, nextMonth, 5),
    description: 'Netflix',
    amount: 15.99,
    type: 'expense',
    category: 'abbonamenti',
    account: accountId,
    demo: true,
    recurring: { freq: 'monthly' },
  } satisfies TxPayload);

  batch.set(doc(collection(db, 'users', uid, 'transactions'), spotifyTemplateId), {
    date: iso(nextYear, nextMonth, 5),
    description: 'Spotify',
    amount: 10.99,
    type: 'expense',
    category: 'abbonamenti',
    account: accountId,
    demo: true,
    recurring: { freq: 'monthly' },
  } satisfies TxPayload);

  batch.set(doc(collection(db, 'users', uid, 'transactions'), palestraTemplateId), {
    date: iso(nextYear, nextMonth, 9),
    description: 'Palestra',
    amount: 39.90,
    type: 'expense',
    category: 'salute',
    account: accountId,
    demo: true,
    recurring: { freq: 'monthly' },
  } satisfies TxPayload);

  await batch.commit();
  return ids;
}
