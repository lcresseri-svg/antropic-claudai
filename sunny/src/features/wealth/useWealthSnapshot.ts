/**
 * Fotografia periodica del patrimonio.
 *
 * Scrive `users/{uid}/wealthSnapshots/{YYYY-MM-DD}` una volta a settimana, così
 * l'app accumula uno STORICO che oggi non ha: il controvalore degli
 * investimenti esiste solo come "valore di adesso", e senza fotografie il
 * passato non è ricostruibile.
 *
 * Dove il controvalore manca (o è vecchio) `buildWealthSnapshot` ripiega sul
 * capitale VERSATO e lo dichiara in `staleValues`/`missing`: la fotografia non
 * inventa mai un valore di mercato, ma non lascia neanche un buco.
 *
 * Regole di ingaggio:
 *  - una sola volta per sessione, e solo dopo il primo snapshot SERVER
 *    (`synced`), mai sulla cache locale: fotografare dati stantii sarebbe
 *    peggio che non fotografare;
 *  - al massimo una scrittura ogni 7 giorni per dispositivo (`shouldWriteSnapshot`);
 *  - idempotente per giorno — stesso giorno, stesso documento riscritto;
 *  - fire-and-forget: un errore non arriva mai all'interfaccia, e in quel caso
 *    la data NON viene marcata, così il tentativo si ripete alla prossima
 *    apertura invece di saltare la settimana.
 */
import { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { Transaction, AccountDef, CategoryDef } from '../../types';
import { buildWealthSnapshot, romeDayKey } from './wealthSnapshotCore';
import { saveWealthSnapshot } from './wealthSnapshots';
import { shouldWriteSnapshot } from './snapshotSchedule';

const lastKeyStorage = (uid: string) => `sunny:wealthSnapshot:${uid}`;

function readLastKey(uid: string): string | null {
  try { return localStorage.getItem(lastKeyStorage(uid)); } catch { return null; }
}

function writeLastKey(uid: string, key: string): void {
  try { localStorage.setItem(lastKeyStorage(uid), key); } catch { /* ignore */ }
}

interface Opts {
  user: User | null;
  transactions: Transaction[];
  accounts: AccountDef[];
  categories: CategoryDef[];
  /** true dopo il primo snapshot confermato dal server. */
  synced: boolean;
  /** true quando le impostazioni sono arrivate: prima, `categories` è il default
   *  e i controvalori non ci sono ancora. */
  settingsLoaded: boolean;
}

export function useWealthSnapshot({
  user, transactions, accounts, categories, synced, settingsLoaded,
}: Opts): void {
  // Le liste cambiano identità a ogni snapshot Firestore: senza questo ref
  // l'effetto rifarebbe il giro (e il controllo su localStorage) di continuo.
  const done = useRef(false);

  useEffect(() => {
    if (!user || !synced || !settingsLoaded || done.current) return;

    const todayKey = romeDayKey();
    if (!shouldWriteSnapshot(readLastKey(user.uid), todayKey)) {
      done.current = true;
      return;
    }
    // Niente movimenti e nessun capitale iniziale: non c'è patrimonio da
    // fotografare, e una serie di zeri sporcherebbe lo storico.
    if (transactions.length === 0) return;

    done.current = true;
    const snapshot = buildWealthSnapshot(transactions, accounts, categories, todayKey);
    saveWealthSnapshot(user.uid, snapshot)
      .then(() => writeLastKey(user.uid, todayKey))
      .catch(e => console.error('wealth snapshot non scritto', (e as { code?: string })?.code ?? e));
  }, [user, synced, settingsLoaded, transactions, accounts, categories]);
}
