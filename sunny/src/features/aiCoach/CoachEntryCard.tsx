// "Stai programmando una spesa?" — l'ingresso all'AI Coach dal Piano.
//
// Prima l'unico accesso era un bottone flottante sopra ogni schermata: sempre
// lì, mai al momento giusto, e nel mezzo di quello che si stava guardando.
// Qui invece è nel Piano — l'unica schermata dove si sta già ragionando su
// quanto si può spendere — e chiede subito le due cose che servono, così la
// risposta arriva al primo tocco invece che dopo un form.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sanitizeNumericInput } from '../transactions/amountKeypad';

/** Oltre questa lunghezza non è più il nome di una spesa. */
const MAX_ITEM = 80;

export function CoachEntryCard() {
  const navigate = useNavigate();
  const [item, setItem] = useState('');
  const [cost, setCost] = useState('');

  const amount = parseFloat(cost.replace(',', '.')) || 0;
  const ready = item.trim().length > 0 && amount > 0;

  const ask = () => {
    if (!ready) return;
    const params = new URLSearchParams({ item: item.trim(), cost: String(amount) });
    navigate(`/ai-coach?${params.toString()}`);
  };

  return (
    <section className="accent-card rounded-[20px] shadow-elev-1 p-[18px]">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-[30px] h-[30px] rounded-[11px] bg-gold/[0.14] flex items-center justify-center text-sm flex-none">✦</span>
        <p className="label-caps text-gold">Chiedi a Sunny</p>
      </div>
      <p className="text-[15px] font-medium text-primary leading-[1.4]">
        Stai programmando una spesa?
      </p>
      <p className="text-[12.5px] text-secondary leading-relaxed mt-1">
        Dimmi cosa e quanto: ti dico se i tuoi numeri la reggono, in quanti mesi ci arrivi
        e dove puoi liberare margine davvero.
      </p>

      <form className="flex gap-2 mt-3.5"
        onSubmit={e => { e.preventDefault(); ask(); }}>
        <input type="text" value={item} maxLength={MAX_ITEM}
          onChange={e => setItem(e.target.value)}
          placeholder="Es. lavatrice, vacanza, bici"
          aria-label="Cosa vuoi comprare"
          className="flex-1 min-w-0 bg-elevated rounded-xl px-3.5 py-2.5 text-[13.5px] text-primary
                     placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
        <div className="relative w-[104px] flex-none">
          <input type="text" inputMode="decimal" value={cost}
            onChange={e => setCost(sanitizeNumericInput(e.target.value))}
            placeholder="0"
            aria-label="Quanto costa"
            className="w-full bg-elevated rounded-xl pl-3 pr-7 py-2.5 text-[13.5px] text-primary balance-num
                       placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-secondary pointer-events-none">€</span>
        </div>
      </form>

      <button type="button" onClick={ask} disabled={!ready}
        className="w-full mt-2.5 py-2.5 rounded-xl cta-gold-fill text-[13.5px] font-semibold
                   disabled:opacity-40 active:scale-[0.99] transition-all">
        Chiedi a Sunny
      </button>
    </section>
  );
}
