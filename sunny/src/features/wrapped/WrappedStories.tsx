// Le storie del Wrapped — una schermata, un dato, una battuta.
//
// Layout comune (dall'alto): etichetta → numero grande → eventuale grafica →
// battuta → nota. Il numero è la schermata: tutto il resto gli sta intorno.
//
// Regola sulla copy: nessuna frase può affermare qualcosa che i numeri non
// dicono. Le battute che sarebbero una CLAIM ("il mese più leggero è costato
// meno della metà del più caro") sono calcolate e cadono da sole quando non
// reggono — una battuta sbagliata su un dato vero costa più di quanto renda.
import { ReactNode } from 'react';
import { formatCurrency, formatEuroRound } from '../../utils';
import { YearWrapped, WrappedStoryId } from './yearWrapped';

/** "38.412" + ",60 €": l'intero grande, decimali e simbolo in piccolo. */
function splitAmount(n: number): [string, string] {
  const s = formatCurrency(n);
  const i = s.lastIndexOf(',');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)];
}

/** "27" + ",4%" per le percentuali, con la virgola italiana. */
function splitPercent(fraction: number, signed = false): [string, string] {
  const v = Math.round(fraction * 1000) / 10;
  const [int, dec = '0'] = Math.abs(v).toFixed(1).split('.');
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  // "+31,0%" è rumore: il decimale compare solo quando dice qualcosa.
  return [`${sign}${int}`, dec === '0' ? '%' : `,${dec}%`];
}

const nf = new Intl.NumberFormat('it-IT');

type Tone = 'primary' | 'gold' | 'green' | 'red';
const TONE: Record<Tone, string> = {
  primary: 'text-primary', gold: 'text-gold', green: 'text-green', red: 'text-red',
};

/** Il numero che occupa mezza schermata. `size` scende quando le cifre salgono. */
function Big({ head, tail, size, tone = 'primary' }: {
  head: string; tail?: string; size: number; tone?: Tone;
}) {
  return (
    <p className={`balance-num font-bold leading-[0.9] tracking-[-0.05em] animate-rise-in ${TONE[tone]}`}
      style={{ fontSize: size, animationDelay: '0.08s' }}>
      {head}
      {tail && <span className="text-secondary" style={{ fontSize: Math.round(size * 0.44) }}>{tail}</span>}
    </p>
  );
}

function Story({ label, children, punch, note }: {
  label: string; children?: ReactNode; punch: string; note?: ReactNode;
}) {
  return (
    <div className="animate-rise-in">
      <p className="label-caps text-secondary mb-[18px]">{label}</p>
      {children}
      <p className="text-[19px] font-semibold text-primary leading-[1.35] tracking-[-0.02em] mt-6"
        style={{ textWrap: 'pretty' } as React.CSSProperties}>
        {punch}
      </p>
      {note && <p className="text-[14px] text-secondary leading-[1.65] mt-3">{note}</p>}
    </div>
  );
}

/** Quanto è grande il numero: le cifre non devono mai andare a capo. */
const sizeFor = (text: string) =>
  text.length >= 11 ? 44 : text.length >= 9 ? 54 : text.length >= 7 ? 62 : text.length >= 6 ? 74 : 84;

// ── Grafiche ─────────────────────────────────────────────────────────────────

function CategoryBars({ w }: { w: YearWrapped }) {
  return (
    <div className="mt-6 space-y-2.5">
      {w.categories.slice(0, 3).map(c => (
        <div key={c.id} className="flex items-center gap-3">
          <span className="w-8 flex-none text-[11.5px] text-tertiary balance-num">
            {Math.round(c.share * 100)}%
          </span>
          <span className="flex-1 h-2 rounded-full" style={{
            background: `linear-gradient(90deg, ${c.color} ${c.share * 100}%, ${c.color}1F ${c.share * 100}%)`,
          }} />
        </div>
      ))}
    </div>
  );
}

function MonthHistogram({ w }: { w: YearWrapped }) {
  const max = Math.max(...w.months.map(m => m.expense), 1);
  return (
    <div className="mt-7">
      <div className="flex items-end gap-[5px] h-[120px]">
        {w.months.map(m => {
          const peak = m.key === w.peakMonth?.key;
          const light = m.key === w.lightestMonth?.key;
          return (
            <span key={m.key} className="flex-1 rounded-[3px]" style={{
              height: `${Math.max(2, (m.expense / max) * 100)}%`,
              background: peak ? 'rgb(var(--c-red))'
                : light ? 'rgb(var(--c-green))'
                : 'rgba(var(--c-gold) / 0.28)',
            }} />
          );
        })}
      </div>
      <div className="flex gap-[5px] mt-1.5">
        {w.months.map(m => (
          <span key={m.key} className={`flex-1 text-center text-[9.5px] ${
            m.key === w.peakMonth?.key ? 'text-red font-semibold'
              : m.key === w.lightestMonth?.key ? 'text-green font-semibold'
              : 'text-tertiary'}`}>
            {m.initial}
          </span>
        ))}
      </div>
    </div>
  );
}

function InvestedBlocks({ w }: { w: YearWrapped }) {
  return (
    <div className="flex gap-[5px] mt-7">
      {w.months.map(m => (
        <span key={m.key} className="flex-1 h-[34px] rounded-md" style={{
          background: m.invest > 0 ? 'rgba(var(--c-gold) / 0.85)' : 'rgba(var(--c-primary) / 0.06)',
        }} />
      ))}
    </div>
  );
}

function NetWorthChart({ w }: { w: YearWrapped }) {
  const s = w.netWorthSeries;
  const min = Math.min(...s), max = Math.max(...s);
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(1, s.length - 1)) * 320;
  const y = (v: number) => 86 - ((v - min) / span) * 78;
  const line = s.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 320 90" className="w-full mt-6" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L320,90 L0,90 Z`} fill="rgba(var(--c-gold) / 0.12)" />
      <path d={line} fill="none" stroke="rgb(var(--c-gold))" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(s.length - 1)} cy={y(s[s.length - 1])} r="3.4" fill="rgb(var(--c-gold))" />
    </svg>
  );
}

function StreakGrid({ w }: { w: YearWrapped }) {
  const first = w.months.length - w.savingStreak;
  return (
    // Dodici celle su un telefono non stanno in riga a larghezza fissa: sono
    // elastiche e quadrate, così la griglia resta una riga sola anche a 360px.
    <div className="flex gap-1 mt-7">
      {w.months.map((m, i) => {
        const inStreak = i >= first && w.savingStreak > 0;
        const red = m.txCount > 0 && m.net < 0;
        return (
          <span key={m.key}
            className={`flex-1 aspect-square max-w-[34px] rounded-[10px] flex items-center justify-center text-[12px] ${
              inStreak ? 'font-bold' : red ? 'text-red' : 'text-tertiary'}`}
            style={{
              background: inStreak ? 'rgb(var(--c-gold))'
                : red ? 'rgba(var(--c-red) / 0.16)'
                : 'rgba(var(--c-primary) / 0.06)',
              color: inStreak ? 'var(--accent-on)' : undefined,
            }}>
            {m.initial}
          </span>
        );
      })}
    </div>
  );
}

// ── Le storie ────────────────────────────────────────────────────────────────

/** Come chiamiamo il pezzo di anno che non è ancora successo. */
function plannedNote(w: YearWrapped): string | null {
  if (!w.hasPlanned) return null;
  const last = w.months[w.months.length - 1]?.label.toLowerCase() ?? 'il mese';
  return `Dentro c'è anche quello che hai già programmato per ${last}: ${nf.format(w.plannedCount)} ${
    w.plannedCount === 1 ? 'movimento' : 'movimenti'} non ancora avvenuti.`;
}

export function WrappedStoryBody({ id, w }: { id: WrappedStoryId; w: YearWrapped }) {
  switch (id) {
    case 'cover': {
      const planned = plannedNote(w);
      return (
        <div className="animate-rise-in">
          <p className="balance-num font-bold text-gold leading-[0.9] tracking-[-0.05em]"
            style={{ fontSize: 110 }}>{w.year}</p>
          <p className="text-[19px] font-semibold text-primary leading-[1.35] tracking-[-0.02em] mt-7">
            {w.monthsCovered === 12 ? 'Dodici mesi' : `${w.monthsCovered} mesi`}, {nf.format(w.txCount)} movimenti
            e qualche decisione discutibile.
          </p>
          <p className="text-[14px] text-secondary leading-[1.65] mt-3">
            {planned ?? 'Li abbiamo contati tutti. Due minuti e te li raccontiamo.'}
          </p>
        </div>
      );
    }

    case 'expense': {
      const [head, tail] = splitAmount(w.expenseTotal);
      return (
        <Story label="Uscite dell'anno"
          punch="Non tutte in caffè, promesso."
          note={<>
            {formatCurrency(w.expenseMonthlyAvg)} al mese in media, su {w.monthsCovered} mesi.
            {w.peakMonth && w.lightestMonth && w.lightestMonth.expense * 2 < w.peakMonth.expense
              && ' Il tuo mese più leggero è costato meno della metà del più caro.'}
          </>}>
          <Big head={head} tail={tail} size={sizeFor(head)} />
        </Story>
      );
    }

    case 'topCategory': {
      const top = w.categories[0];
      const rest = w.categories.slice(1, 3);
      return (
        <Story label="Categoria numero uno"
          punch={`${top.label}. ${top.share >= 0.3 ? 'Quasi un terzo di tutto.' : 'Prima, e di parecchio.'}`}
          note={rest.length > 0
            ? <>Dietro: {rest.map(c => `${c.label} ${formatCurrency(c.total)}`).join(' e ')}.</>
            : <>È l'unica categoria in cui hai speso qualcosa.</>}>
          <p className="text-[34px] font-bold text-primary tracking-[-0.03em] leading-none">
            {top.icon} {top.label}
          </p>
          <p className="balance-num text-[40px] font-bold text-gold tracking-[-0.04em] mt-2">
            {formatCurrency(top.total)}
          </p>
          <CategoryBars w={w} />
        </Story>
      );
    }

    case 'peakMonth': {
      const peak = w.peakMonth!;
      const light = w.lightestMonth!;
      return (
        <Story label="Il mese più caro"
          punch={`${peak.label}: meglio non parlarne. A ${light.label.toLowerCase()} invece eri in ferie anche dal tuo conto.`}
          note={<>Il più leggero è stato {light.label.toLowerCase()}, {formatCurrency(light.expense)}.</>}>
          <p className="text-[46px] font-bold text-red tracking-[-0.04em] leading-none">{peak.label}</p>
          <p className="balance-num text-[34px] font-bold text-primary tracking-[-0.04em] mt-2">
            {formatCurrency(peak.expense)}
          </p>
          <MonthHistogram w={w} />
        </Story>
      );
    }

    case 'savingsRate': {
      const rate = w.savingsRate ?? 0;
      const [head, tail] = splitPercent(rate);
      const kept = Math.max(0, Math.round(rate * 100));
      return (
        <Story label="Tasso di risparmio"
          punch={rate > 0
            ? `Su 100 € entrati, ${kept} sono rimasti. Il tuo io di gennaio non ci credeva.`
            : 'Quest\'anno è uscito più di quello che è entrato. Capita, e si vede.'}
          note={<>{formatCurrency(w.saved)} messi da parte su {formatCurrency(w.incomeTotal)} di entrate.</>}>
          <Big head={head} tail={tail} size={116} tone={rate > 0 ? 'gold' : 'red'} />
        </Story>
      );
    }

    case 'invested': {
      const head = formatEuroRound(w.investedTotal);
      return (
        <Story label="Investito nell'anno"
          punch={w.investedMonths >= w.monthsCovered
            ? 'Un versamento al mese, tutti i mesi. Noiosissimo. Perfetto.'
            : 'Non tutti i mesi, ma i soldi non se ne sono accorti.'}
          note={w.investedShareOfIncome !== null
            ? <>Il {Math.round(w.investedShareOfIncome * 100)}% di quello che è entrato è finito lì dentro.</>
            : <>{w.investedMonths} mesi su {w.monthsCovered} con un versamento.</>}>
          <Big head={head} size={sizeFor(head)} tone="gold" />
          <p className="text-[14px] text-secondary mt-3">
            {formatEuroRound(w.investedTotal / w.monthsCovered)} al mese · {w.investedMonths} mesi su {w.monthsCovered}
          </p>
          <InvestedBlocks w={w} />
        </Story>
      );
    }

    case 'netWorth': {
      const up = (w.netWorthDelta ?? 0) >= 0;
      return (
        <Story label="Patrimonio netto"
          punch={up ? 'La riga che conta va su.' : 'Quest\'anno la riga è scesa. Almeno sai di quanto.'}
          note={<>{(w.netWorthDelta ?? 0) >= 0 ? '+' : '−'}{formatEuroRound(Math.abs(w.netWorthDelta ?? 0))} in {w.monthsCovered} mesi.</>}>
          <p className="balance-num text-[26px] font-semibold text-tertiary">
            {formatEuroRound(w.netWorthStart ?? 0)}
          </p>
          <p className="balance-num font-bold text-primary tracking-[-0.05em] leading-[0.95] mt-1"
            style={{ fontSize: Math.min(56, sizeFor(formatEuroRound(w.netWorthEnd ?? 0))) }}>
            {formatEuroRound(w.netWorthEnd ?? 0)}
          </p>
          {w.netWorthDeltaPct !== null && (
            <span className={`inline-block mt-3 rounded-full px-3 py-1.5 text-[13px] font-semibold ${up ? 'text-green' : 'text-red'}`}
              style={{ background: `rgba(var(--c-${up ? 'green' : 'red'}) / 0.14)` }}>
              {splitPercent(w.netWorthDeltaPct, true).join('')}
            </span>
          )}
          <NetWorthChart w={w} />
        </Story>
      );
    }

    case 'streak':
      return (
        <Story label="Mesi chiusi in risparmio, di fila"
          punch={`Da ${w.months[w.months.length - w.savingStreak].label.toLowerCase()} non hai più chiuso un mese in rosso.`}
          note={<>Su {w.monthsCovered} mesi raccontati.</>}>
          <Big head={String(w.savingStreak)} size={140} tone="gold" />
          <StreakGrid w={w} />
        </Story>
      );

    case 'largest': {
      const l = w.largest!;
      const head = formatEuroRound(l.amount);
      return (
        <Story label={l.planned ? 'La spesa più grande (già in programma)' : 'La spesa più grande'}
          punch={w.peakMonth && l.date.slice(0, 7) === w.peakMonth.key
            ? `Ecco cosa è successo a ${w.peakMonth.label.toLowerCase()}.`
            : 'Una sola voce, e si è sentita.'}
          note={<>Vale il {Math.round((l.amount / Math.max(1, w.expenseTotal)) * 100)}% di tutto quello che hai speso quest'anno.</>}>
          <Big head={head} size={sizeFor(head)} />
          <div className="glass-card rounded-[18px] p-[15px] flex items-center gap-3 mt-6">
            <span className="w-[34px] h-[34px] rounded-xl flex items-center justify-center text-[17px] flex-none"
              style={{ background: `${l.categoryColor}1F` }}>{l.categoryIcon}</span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-primary truncate">{l.description}</p>
              <p className="text-[12px] text-secondary truncate">
                {l.categoryLabel} · {new Date(`${l.date}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · {l.accountLabel}
              </p>
            </div>
          </div>
        </Story>
      );
    }

    case 'count':
      return (
        <Story label="Movimenti registrati"
          punch={`${nf.format(w.txCount)} volte hai detto "poi lo segno". E poi l'hai segnato.`}
          note={<>{w.txPerDay >= 1
            ? `Circa ${nf.format(Math.round(w.txPerDay * 10) / 10)} al giorno.`
            : `Uno ogni ${Math.round(1 / Math.max(w.txPerDay, 0.0001))} giorni.`}</>}>
          <Big head={nf.format(w.txCount)} size={w.txCount >= 1000 ? 116 : 140} />
        </Story>
      );

    case 'vsPrev': {
      const v = w.vsPrevYear!;
      const spentLess = (v.expensePct ?? 0) < 0;
      const savedMore = (v.savedPct ?? 0) > 0;
      return (
        <Story label={`${w.year} contro ${w.year - 1}`}
          punch={spentLess && savedMore
            ? 'Hai speso meno e messo via di più. Raro. Segnatelo.'
            : spentLess ? 'Hai speso meno dell\'anno scorso.'
            : savedMore ? 'Hai speso di più, ma ne è rimasto di più.'
            : 'Anno più caro del precedente. Almeno adesso lo sai.'}
          note={<>Stessi {w.monthsCovered} mesi a confronto, non un anno intero contro un pezzo d'anno.</>}>
          {v.expensePct !== null && (
            <>
              <Big head={splitPercent(v.expensePct, true).join('')} size={92} tone={spentLess ? 'green' : 'red'} />
              <p className="text-[14px] text-secondary mt-2">speso</p>
            </>
          )}
          {v.savedPct !== null && (
            <div className="mt-6">
              <p className={`balance-num text-[46px] font-bold tracking-[-0.04em] ${savedMore ? 'text-green' : 'text-red'}`}>
                {splitPercent(v.savedPct, true).join('')}
              </p>
              <p className="text-[14px] text-secondary mt-1">messo da parte</p>
            </div>
          )}
        </Story>
      );
    }
  }
}
