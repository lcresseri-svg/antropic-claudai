// Card di ingresso al Wrapped, in cima alla home.
//
// Vive solo dentro la finestra (20–31 dicembre) e solo finché ha qualcosa da
// dire: chi l'ha già guardato o ha detto "più tardi" non la rivede fino
// all'anno prossimo. Sotto una manciata di movimenti non compare affatto —
// una retrospettiva dell'anno costruita su quattro spese è una presa in giro.
//
// Il conto dell'anno si calcola SOLO quando la card è davvero visibile: per
// 354 giorni all'anno questo componente è due booleani e un return null.
import { useMemo, useState } from 'react';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { wrappedSeasonYear } from './wrappedWindow';
import { buildYearWrapped } from './yearWrapped';
import { markEntryDismissed, shouldShowWrappedEntry } from './wrappedStorage';

interface Props {
  transactions: Transaction[];
  projected: Transaction[];
  userId: string;
  onOpen: (year: number) => void;
}

const nf = new Intl.NumberFormat('it-IT');

export function WrappedEntryCard({ transactions, projected, userId, onOpen }: Props) {
  const { getCat, getAcc } = useSettings();
  const [dismissed, setDismissed] = useState(false);

  const todayISO = new Date().toISOString().slice(0, 10);
  const year = wrappedSeasonYear(todayISO);
  const visible = year !== null && !dismissed && shouldShowWrappedEntry(userId, year);

  const w = useMemo(
    () => (visible && year !== null
      ? buildYearWrapped({ transactions, projected, getCat, getAcc, year, todayISO })
      : null),
    [visible, year, transactions, projected, getCat, getAcc, todayISO],
  );

  if (!w || !w.hasEnough || year === null) return null;

  const dismiss = () => {
    markEntryDismissed(userId, year);
    setDismissed(true);
  };

  return (
    <div className="accent-card rounded-[22px] shadow-elev-1 p-[18px] animate-rise-in">
      <div className="flex items-center gap-2.5">
        <span className="w-[30px] h-[30px] rounded-[11px] flex items-center justify-center text-[14px] text-gold flex-none"
          style={{ background: 'rgba(var(--c-gold) / 0.14)' }}>✦</span>
        <span className="label-caps text-gold">Sunny Wrapped</span>
      </div>

      <h2 className="text-[34px] font-bold text-primary leading-none tracking-[-0.04em] mt-3">
        Il tuo <span className="text-gold">{year}</span>
      </h2>

      <p className="text-[12.5px] text-secondary leading-[1.55] mt-2.5">
        {w.monthsCovered === 12 ? 'Dodici mesi' : `${w.monthsCovered} mesi`}, {nf.format(w.txCount)} movimenti,
        qualche decisione discutibile. Due minuti e te li raccontiamo tutti.
      </p>

      <div className="flex items-center gap-2.5 mt-3.5">
        <button type="button" onClick={() => onOpen(year)}
          className="cta-gold-fill flex-1 rounded-[14px] py-2.5 text-[13.5px] font-semibold active:opacity-90 transition-opacity">
          Guarda il tuo {year}
        </button>
        <button type="button" onClick={dismiss}
          className="px-3 text-[12.5px] text-tertiary flex-none">
          Più tardi
        </button>
      </div>
    </div>
  );
}
