// Storico del "Ritmo del mese": lo stesso calendario della home, ma su un mese
// qualsiasi, con una striscia di mesi da scorrere.
//
// Il calendario NON è ridisegnato qui: `RhythmGrid` e `RhythmLegend` sono gli
// stessi componenti della card, e i numeri vengono da `buildMonthRhythm` con
// un `monthKey` diverso. La scheda aggiunge solo la navigazione e il confronto
// col mese precedente.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Transaction } from '../../types';
import { SheetShell } from '../investments/SheetShell';
import { RhythmGrid, RhythmLegend, roundEuro } from './MonthRhythmCard';
import {
  buildMonthRhythm, rhythmMonths, shiftMonth, compareMonths, monthRhythmStats, ScheduledOutflow,
} from './monthRhythm';

interface Props {
  open: boolean;
  transactions: Transaction[];
  /** Uscite già impegnate — servono solo al mese corrente, i passati non ne hanno. */
  scheduled?: ScheduledOutflow[];
  now?: Date;
  onClose: () => void;
  /** Tap su un giorno: apre i movimenti di quella data. */
  onSelectDay?: (iso: string) => void;
}

/** "ago" — mese abbreviato, senza il punto che Intl aggiunge in italiano. */
function shortMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return new Intl.DateTimeFormat('it-IT', { month: 'short' })
    .format(new Date(Number(y), Number(m) - 1, 1))
    .replace('.', '');
}

/** "ago 26" — etichetta compatta per la striscia dei mesi. */
function chipLabel(monthKey: string): string {
  return `${shortMonth(monthKey)} ${monthKey.slice(2, 4)}`;
}

export function MonthRhythmSheet({ open, transactions, scheduled, now, onClose, onSelectDay }: Props) {
  const months = useMemo(() => rhythmMonths(transactions, now), [transactions, now]);
  const [monthKey, setMonthKey] = useState(() => months[months.length - 1]);

  // Riaprendo la scheda si torna al mese corrente: è il punto di partenza
  // atteso, non l'ultimo mese guardato mezz'ora fa.
  useEffect(() => { if (open) setMonthKey(months[months.length - 1]); }, [open, months]);

  const index = months.indexOf(monthKey);
  const canPrev = index > 0;
  const canNext = index >= 0 && index < months.length - 1;
  const go = (delta: number) => {
    const next = months[index + delta];
    if (next) setMonthKey(next);
  };

  // Frecce della tastiera: su desktop scorrere i mesi senza mirare un bottone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  });

  // Il mese selezionato entra sempre in vista nella striscia.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    stripRef.current?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [open, monthKey]);

  const rhythm = useMemo(
    () => buildMonthRhythm({ transactions, scheduled, now, monthKey }),
    [transactions, scheduled, now, monthKey],
  );
  const previous = useMemo(
    () => buildMonthRhythm({ transactions, scheduled, now, monthKey: shiftMonth(monthKey, -1) }),
    [transactions, scheduled, now, monthKey],
  );
  const cmp = useMemo(() => compareMonths(rhythm, previous), [rhythm, previous]);
  const stats = useMemo(() => monthRhythmStats(rhythm), [rhythm]);

  const hasPrevMonth = months.includes(shiftMonth(monthKey, -1));

  return (
    <SheetShell open={open} title="Ritmo mese per mese"
      subtitle={rhythm.isClosed ? 'Mese chiuso' : 'Mese in corso'} onClose={onClose}>

      {/* Navigatore: frecce + mese corrente */}
      <div className="flex items-center justify-between gap-2">
        <NavButton dir="prev" disabled={!canPrev} onClick={() => go(-1)} />
        <p className="text-[15px] font-semibold text-primary capitalize text-center flex-1 min-w-0 truncate">
          {rhythm.monthLabelFull}
        </p>
        <NavButton dir="next" disabled={!canNext} onClick={() => go(1)} />
      </div>

      {/* Striscia da scorrere: tutti i mesi con dati, dal primo a oggi */}
      <div ref={stripRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5">
        {months.map(m => {
          const selected = m === monthKey;
          return (
            <button key={m} type="button" data-selected={selected}
              aria-current={selected ? 'true' : undefined}
              onClick={() => setMonthKey(m)}
              className={`flex-none px-2.5 py-1 rounded-full text-[11.5px] transition-colors ${
                selected
                  ? 'bg-gold text-[var(--rhythm-ink-hi)] font-semibold'
                  : 'bg-elevated text-secondary'}`}>
              {chipLabel(m)}
            </button>
          );
        })}
      </div>

      <div className="glass-card rounded-[18px] p-3.5">
        <RhythmGrid rhythm={rhythm} onSelectDay={onSelectDay} />
        <RhythmLegend />
      </div>

      {/* Il mese in tre numeri */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Speso" value={`${roundEuro(rhythm.totalSpent)} €`} />
        <Stat label="Al giorno" value={`${roundEuro(rhythm.dailyAverage)} €`} />
        {/* "Giorno più caro · 2 agosto" non entra in un terzo di schermo da
            390px e finiva troncato: l'etichetta è corta e la data compatta. */}
        <Stat label="Più caro"
          value={rhythm.peak ? `${roundEuro(rhythm.peak.spent)} €` : '—'}
          hint={rhythm.peak ? `${rhythm.peak.day} ${shortMonth(rhythm.monthKey)}` : undefined} />
      </div>

      {/* Il resto in righe: qui i numeri hanno bisogno di una frase, non di
          un riquadro da 10px. Tutto sui giorni TRASCORSI. */}
      <div className="glass-card rounded-[18px] px-3.5">
        <DetailRow label="Giorni con spesa"
          value={`${stats.daysWithSpending} su ${stats.daysElapsed}`} />
        <DetailRow label="Giorni senza spendere"
          value={String(stats.daysWithout)}
          hint={stats.longestCleanStreak > 1 ? `${stats.longestCleanStreak} di fila` : undefined} />
        {stats.daysWithSpending > 0 && (
          <DetailRow label="Media nei giorni di spesa"
            value={`${roundEuro(stats.averageOnSpendingDays)} €`} />
        )}
        {rhythm.peak?.topDescription && (
          <DetailRow label="Spesa più grande" value={rhythm.peak.topDescription} />
        )}
        {stats.topWeekday && (
          // "Di domenica" regge sia il maschile che il femminile: "Il tuo
          // domenica" no, e i giorni della settimana in italiano si dividono.
          <DetailRow label={`Di ${stats.topWeekday.label}`}
            value={`${roundEuro(stats.topWeekday.total)} €`}
            hint={`${roundEuro(stats.topWeekday.average)} € in media`} />
        )}
        {!rhythm.isClosed && rhythm.scheduledAhead > 0 && (
          <DetailRow label="Già programmato" value={`${roundEuro(rhythm.scheduledAhead)} €`}
            hint="da qui a fine mese" />
        )}
      </div>

      {/* Confronto onesto: a mese in corso si guardano gli stessi giorni */}
      {hasPrevMonth && (
        <div className="accent-card rounded-[18px] p-3.5">
          <p className="label-caps text-gold mb-1.5">
            Rispetto a {previous.monthLabel}
            {cmp.throughDay != null && ` · primi ${cmp.throughDay} giorni`}
          </p>
          <p className="text-[13px] text-secondary leading-[1.6]">
            {cmp.previous === 0 && cmp.current === 0
              ? 'Nessuna spesa registrata in nessuno dei due mesi.'
              : (
                <>
                  <span className={`font-semibold ${cmp.delta > 0 ? 'text-red' : cmp.delta < 0 ? 'text-green' : 'text-primary'}`}>
                    {cmp.delta > 0 ? '+' : cmp.delta < 0 ? '−' : ''}{roundEuro(Math.abs(cmp.delta))} €
                  </span>
                  {cmp.deltaPct != null && ` (${cmp.delta > 0 ? '+' : cmp.delta < 0 ? '−' : ''}${Math.round(Math.abs(cmp.deltaPct) * 100)}%)`}
                  {' '}rispetto ai {roundEuro(cmp.previous)} € di {previous.monthLabel}.
                </>
              )}
          </p>
        </div>
      )}
    </SheetShell>
  );
}

function NavButton({ dir, disabled, onClick }: {
  dir: 'prev' | 'next'; disabled: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={dir === 'prev' ? 'Mese precedente' : 'Mese successivo'}
      className={`w-8 h-8 rounded-full bg-elevated flex items-center justify-center flex-none transition-opacity ${
        disabled ? 'opacity-30' : 'text-secondary'}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  );
}

function DetailRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-divider last:border-0">
      <span className="text-[12.5px] text-secondary min-w-0 truncate">{label}</span>
      <span className="text-[12.5px] text-primary font-semibold balance-num flex-none text-right">
        {value}
        {hint && <span className="text-[11px] text-tertiary font-normal"> · {hint}</span>}
      </span>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-xl px-3 py-2.5">
      <p className="text-[14px] font-semibold text-primary balance-num">{value}</p>
      <p className="text-[10px] text-secondary mt-0.5 truncate">
        {label}{hint && <span style={{ color: 'var(--accent)' }}> · {hint}</span>}
      </p>
    </div>
  );
}
