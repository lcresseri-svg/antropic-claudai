// Riepilogo del Wrapped — tutto l'anno in una schermata sola, scrollabile.
//
// Le storie sono una alla volta e passano; qui il lettore torna a cercare il
// numero che gli è rimasto in testa. Nessun timer, nessuna animazione a
// catena: è una tabella, e deve comportarsi come tale.
//
// Le celle che non hanno un dato non vengono mostrate (stessa regola delle
// storie): una griglia con "—" in mezzo racconta i buchi, non l'anno.
import { formatCurrency, formatEuroRound } from '../../utils';
import { YearWrapped, WRAPPED_TOP_CATS } from './yearWrapped';

interface Cell { label: string; value: string; tone?: 'gold' | 'green' | 'red' }

function buildCells(w: YearWrapped): Cell[] {
  const cells: Cell[] = [];
  if (w.incomeTotal > 0) cells.push({ label: 'Entrate', value: formatCurrency(w.incomeTotal), tone: 'green' });
  cells.push({ label: 'Uscite', value: formatCurrency(w.expenseTotal) });
  cells.push({ label: 'Risparmiato', value: formatCurrency(w.saved), tone: w.saved >= 0 ? 'green' : 'red' });
  if (w.savingsRate !== null) {
    cells.push({ label: 'Tasso risparmio', value: `${Math.round(w.savingsRate * 1000) / 10}%`.replace('.', ','), tone: 'gold' });
  }
  if (w.investedTotal > 0) cells.push({ label: 'Investito', value: formatCurrency(w.investedTotal), tone: 'gold' });
  if (w.netWorthEnd !== null) cells.push({ label: 'Patrimonio', value: formatCurrency(w.netWorthEnd) });
  cells.push({ label: 'Media mensile', value: formatCurrency(w.expenseMonthlyAvg) });
  cells.push({ label: 'Movimenti', value: new Intl.NumberFormat('it-IT').format(w.txCount) });
  if (w.peakMonth) cells.push({ label: 'Mese più caro', value: `${w.peakMonth.label} · ${formatEuroRound(w.peakMonth.expense)}` });
  if (w.lightestMonth && w.lightestMonth.key !== w.peakMonth?.key) {
    cells.push({ label: 'Più leggero', value: `${w.lightestMonth.label} · ${formatEuroRound(w.lightestMonth.expense)}` });
  }
  if (w.savingStreak >= 2) cells.push({ label: 'Streak', value: `${w.savingStreak} mesi`, tone: 'gold' });
  if (w.vsPrevYear?.expensePct != null) {
    const pct = Math.round(w.vsPrevYear.expensePct * 1000) / 10;
    cells.push({
      label: `vs ${w.year - 1}`,
      value: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${String(Math.abs(pct)).replace('.', ',')}% speso`,
      tone: pct <= 0 ? 'green' : 'red',
    });
  }
  return cells;
}

const TONE: Record<NonNullable<Cell['tone']>, string> = {
  gold: 'text-gold', green: 'text-green', red: 'text-red',
};

export function WrappedSummary({ w, onGoal }: { w: YearWrapped; onGoal: () => void }) {
  const head = w.categories.slice(0, WRAPPED_TOP_CATS);
  const last = w.months[w.months.length - 1];

  return (
    <div className="px-5 pb-10 pt-6">
      <p className="label-caps text-secondary">Il tuo {w.year} in numeri</p>
      <h1 className="text-[28px] font-bold text-primary tracking-[-0.03em] mt-1">Tutto in una schermata</h1>
      <p className="text-[12px] text-tertiary mt-1.5">
        Gennaio–{last?.label.toLowerCase() ?? 'dicembre'} {w.year}
        {w.hasPlanned && ' · il programmato è compreso'}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-5">
        {buildCells(w).map(c => (
          <div key={c.label} className="glass-card rounded-2xl p-[13px]">
            <p className="label-caps text-tertiary mb-1.5">{c.label}</p>
            <p className={`text-[17px] font-semibold balance-num ${c.tone ? TONE[c.tone] : 'text-primary'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {head.length > 0 && (
        <div className="glass-card rounded-2xl p-[15px] mt-2">
          <p className="label-caps text-tertiary mb-3">Le tue categorie dell'anno</p>
          <div className="space-y-2.5">
            {head.map(c => (
              <div key={c.id} className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: c.color }} />
                <span className="flex-1 text-[13px] text-secondary truncate">{c.label}</span>
                <span className="text-[13px] font-semibold text-primary balance-num">{formatCurrency(c.total)}</span>
              </div>
            ))}
            {w.otherCategories.count > 0 && (
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full flex-none bg-tertiary" />
                <span className="flex-1 text-[13px] text-secondary">Altre {w.otherCategories.count}</span>
                <span className="text-[13px] font-semibold text-primary balance-num">
                  {formatCurrency(w.otherCategories.total)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {w.hasPlanned && (
        <p className="text-[12px] text-tertiary leading-relaxed mt-4 px-1">
          {w.realizedCount} movimenti sono già avvenuti, {w.plannedCount} sono programmati e non ancora
          successi. Quando avverranno, questi numeri non cambieranno: sono già contati qui.
        </p>
      )}

      <button type="button" onClick={onGoal}
        className="cta-gold-fill w-full rounded-[14px] py-3 text-[13.5px] font-semibold mt-6 active:opacity-90 transition-opacity">
        Imposta l'obiettivo {w.year + 1}
      </button>
    </div>
  );
}
