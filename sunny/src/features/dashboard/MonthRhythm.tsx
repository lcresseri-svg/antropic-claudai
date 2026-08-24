// "Ritmo del mese" — calendario a 7 colonne delle spese del mese corrente.
// Sostituisce l'idea di heatmap compressa: qui ogni quadratino è UN giorno,
// leggibile e tappabile. Tutto il calcolo sta in monthRhythm.ts (puro,
// testato); questo file è solo presentazione.
//
// Colori: le celle sono --accent con alpha crescente (nessun hex per tema), il
// numero usa la coppia --rhythm-ink / --rhythm-ink-hi che si inverte fra
// chiaro e scuro. Niente codice condizionale sul tema.

import { useMemo } from 'react';
import { Transaction } from '../../types';
import { formatCurrency } from '../../utils';
import {
  buildMonthRhythm, ScheduledOutflow, RhythmDay, RHYTHM_ALPHA, RHYTHM_INK_HI_FROM,
} from './monthRhythm';

interface Props {
  transactions: Transaction[];
  /** Uscite già impegnate (quota propria) — stessa lista della liquidità libera. */
  scheduled?: ScheduledOutflow[];
  /** Tap su un giorno: apre i movimenti di quella data. */
  onSelectDay?: (iso: string) => void;
  now?: Date;
}

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Fondo tratteggiato oro dei giorni programmati (ricorrenze / spese future). */
const SCHEDULED_FILL =
  'repeating-linear-gradient(45deg, rgba(var(--c-gold) / 0.5) 0 2px, transparent 2px 5px)';

/** Importo compatto senza decimali — nelle celle e in legenda conta l'ordine di grandezza. */
const round = (n: number) => Math.round(n).toLocaleString('it-IT');

export function MonthRhythm({ transactions, scheduled, onSelectDay, now }: Props) {
  const rhythm = useMemo(
    () => buildMonthRhythm({ transactions, scheduled, now }),
    [transactions, scheduled, now],
  );

  const blanks = Array.from({ length: rhythm.leadingBlanks }, (_, i) => i);

  return (
    <div className="glass-card rounded-[22px] shadow-elev-1 p-[18px]">
      <div className="flex items-center justify-between mb-1">
        <p className="label-caps text-secondary">Ritmo del mese</p>
        <span className="text-[11px] text-tertiary">
          {round(rhythm.dailyAverage)} €/giorno in media
        </span>
      </div>
      <p className="text-[11.5px] text-tertiary mb-3">
        Ogni quadratino è un giorno di {rhythm.monthLabel}: più è pieno, più hai speso.
      </p>

      <div className="grid grid-cols-7 gap-1.5 md:gap-[7px] text-center text-[9.5px] md:text-[10px] font-semibold text-tertiary mb-1.5">
        {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:gap-[7px] balance-num">
        {blanks.map(i => <div key={`b${i}`} />)}
        {rhythm.days.map(day => (
          <DayCell key={day.day} day={day} monthLabel={rhythm.monthLabel} onSelect={onSelectDay} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3.5 text-[11px] text-secondary">
        <span className="flex items-center gap-1">
          meno
          {[0, 1, 3, 4].map(l => (
            <span key={l} className="w-[11px] h-[11px] rounded-[3px]"
              style={{ background: `rgba(var(--c-gold) / ${RHYTHM_ALPHA[l]})` }} />
          ))}
          più
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[11px] h-[11px] rounded-[3px] border border-dashed border-gold/60"
            style={{ background: SCHEDULED_FILL }} />
          programmato
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[11px] h-[11px] rounded-[3px] outline outline-2 -outline-offset-1 outline-primary" />
          oggi
        </span>
      </div>

      {rhythm.peak && (
        <p className="mt-3 text-[11.5px] text-tertiary">
          Giorno più caro:{' '}
          <span className="text-primary font-semibold">
            {rhythm.peak.day} {rhythm.monthLabel} · {round(rhythm.peak.spent)} €
          </span>
          {rhythm.peak.topDescription && ` (${rhythm.peak.topDescription.toLowerCase()})`}. Oggi{' '}
          {round(rhythm.todaySpent)} €.
        </p>
      )}
    </div>
  );
}

function DayCell({ day, monthLabel, onSelect }: {
  day: RhythmDay;
  monthLabel: string;
  onSelect?: (iso: string) => void;
}) {
  const isScheduled = day.isFuture && day.scheduled > 0;
  const alpha = day.level >= 0 ? RHYTHM_ALPHA[day.level] : 0;

  // Tre stati esclusivi: speso (oro pieno) · programmato (tratteggio) · vuoto.
  const style: React.CSSProperties = isScheduled
    ? { background: SCHEDULED_FILL }
    : day.level >= 0
      ? { background: `rgba(var(--c-gold) / ${alpha})`,
          color: alpha >= RHYTHM_INK_HI_FROM ? 'var(--rhythm-ink-hi)' : 'var(--rhythm-ink)' }
      : { background: 'rgba(var(--c-primary) / 0.05)' };

  const cls = [
    'aspect-square rounded-[7px] md:rounded-lg flex items-center justify-center',
    'text-[11px] md:text-[12px] transition-colors',
    isScheduled ? 'border border-dashed border-gold/60 text-gold font-semibold' : '',
    day.level < 0 && !isScheduled ? 'text-tertiary/70' : '',
    day.level >= 0 ? 'font-semibold' : '',
    day.isToday ? 'outline outline-2 outline-offset-1 outline-primary font-bold' : '',
    onSelect ? 'cursor-pointer' : '',
  ].filter(Boolean).join(' ');

  const label = isScheduled
    ? `${day.day} ${monthLabel}: ${formatCurrency(day.scheduled)} programmati`
    : `${day.day} ${monthLabel}: ${formatCurrency(day.spent)}`;

  if (!onSelect) return <div className={cls} style={style} aria-label={label}>{day.day}</div>;

  return (
    <button type="button" className={cls} style={style} aria-label={label}
      onClick={() => onSelect(day.iso)}>
      {day.day}
    </button>
  );
}
