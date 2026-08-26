// Impegni (flag `commitments`): abbonamenti, rate e ricorrenti con il loro
// costo mensile equivalente, le prossime scadenze e i residui.
//
// La domanda a cui risponde non è "quali serie ho" ma "quanto del mese è già
// deciso prima che io decida qualcosa": da qui l'hero, che mette il costo
// fisso accanto alla quota di entrate che si porta via.
//
// Tutti i numeri vengono dal modulo puro `commitments.ts` — una voce per
// serie, niente doppioni fra template, istanze e proiezioni.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { formatCurrency, formatDate, capitalize } from '../../utils';
import { recentMonths } from '../insights/insightsEngine';
import { AnalysisHeader } from '../dashboard/AnalysisHeader';
import { PageHead } from '../../shared/components/PageHead';
import { buildCommitments, Commitment } from './commitments';

interface Props {
  /** FULL set (allTransactions): expired templates still resolve series. */
  transactions: Transaction[];
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'giornaliero', weekly: 'settimanale', monthly: 'mensile', yearly: 'annuale',
};

/** Entro quanti giorni una scadenza è "vicina" e va in oro. */
const SOON_DAYS = 7;
const DAY_MS = 86_400_000;

export function CommitmentsScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const c = useMemo(() => buildCommitments(transactions, todayISO), [transactions, todayISO]);

  // Quota di entrate assorbita dagli impegni: il costo fisso da solo non dice
  // se è tanto o poco, e "tanto o poco" è l'unica cosa che interessa.
  const incomeShare = useMemo(() => {
    const months = recentMonths(transactions, 3, new Date());
    const avg = months.reduce((s, m) => s + m.income, 0) / Math.max(1, months.length);
    return avg > 0 ? c.fixedMonthlyCost / avg : null;
  }, [transactions, c.fixedMonthlyCost]);

  const subsTotal = total(c.subscriptions);
  const instTotal = total(c.installments);
  const recTotal = total(c.recurring);
  const invTotal = c.investedMonthly;
  const bar = (v: number) => (c.fixedMonthlyCost > 0 ? (v / c.fixedMonthlyCost) * 100 : 0);
  const upcomingTotal = c.upcoming.reduce((s, u) => s + u.amount, 0);
  const upcomingInvested = c.upcoming.reduce((s, u) => s + (u.investment ? u.amount : 0), 0);

  // Riga → movimenti della serie sul suo conto. Entrambi i filtri sono già
  // supportati da TransactionList (?account=, ?series=) e si combinano in AND.
  const openMovements = (commitment: Commitment) => {
    const params = new URLSearchParams();
    if (commitment.account) params.set('account', commitment.account);
    params.set('series', commitment.seriesId);
    navigate(`/transactions?${params.toString()}`);
  };

  return (
    <div className="pb-32 md:pb-6">
      <AnalysisHeader title="Impegni" subtitle="Quanto del mese è già deciso" backTo="/wealth" />
      <PageHead title="Impegni" subtitle="Quanto del mese è già deciso, prima che tu decida qualcosa" />

      <div className="flex flex-col wide:flex-row gap-3.5 md:gap-4 wide:items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 wide:flex-1 wide:min-w-0">

          {/* Hero: il costo fisso e cosa si porta via */}
          <section className="hero-card rounded-[26px] shadow-elev-2 p-[22px] animate-rise-in">
            <p className="label-caps text-secondary mb-2">Costo fisso mensile</p>
            <p className="balance-num text-[36px] md:text-[56px] md:leading-[0.95] leading-none font-bold text-primary">
              {formatCurrency(c.fixedMonthlyCost)}
              <span className="text-[17px] font-semibold text-secondary ml-1">/mese</span>
            </p>
            {incomeShare !== null && c.fixedMonthlyCost > 0 && (
              <p className="text-[12.5px] text-secondary leading-relaxed mt-2.5">
                Il <span className="font-semibold text-primary">{Math.round(incomeShare * 100)}%</span> delle
                tue entrate esce prima che tu decida qualcosa.
              </p>
            )}

            {c.fixedMonthlyCost > 0 && (
              <>
                <div className="flex gap-[2px] h-2 mt-4 rounded-full overflow-hidden"
                  style={{ background: 'rgba(var(--c-primary) / 0.08)' }}>
                  <span style={{ width: `${bar(recTotal)}%`, background: 'rgb(var(--c-gold))' }} />
                  <span style={{ width: `${bar(instTotal)}%`, background: 'rgb(var(--c-red))' }} />
                  <span style={{ width: `${bar(subsTotal)}%`, background: 'rgb(var(--c-green))' }} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                  <Legend color="rgb(var(--c-gold))" label="Ricorrenti" value={recTotal} />
                  <Legend color="rgb(var(--c-red))" label="Rate" value={instTotal} />
                  <Legend color="rgb(var(--c-green))" label="Abbonamenti" value={subsTotal} />
                </div>
              </>
            )}

            {/* Un PAC parte da solo come una bolletta, ma non è un costo: sta
                fuori dalla barra e fuori dal totale, con scritto perché. */}
            {invTotal > 0 && (
              <div className="mt-4 pt-3.5 flex items-start justify-between gap-3"
                style={{ borderTop: '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-[12.5px] text-primary font-medium">Investi ogni mese</p>
                  <p className="text-[11.5px] text-secondary leading-relaxed mt-0.5">
                    Esce dal conto come il resto, ma resta tuo: fuori dal costo fisso.
                  </p>
                </div>
                <p className="text-[15px] font-semibold text-gold balance-num flex-none whitespace-nowrap">
                  +{formatCurrency(invTotal)}<span className="text-[11px] text-secondary font-normal">/mese</span>
                </p>
              </div>
            )}
          </section>

          {/* Prossimi 30 giorni: una timeline, non un elenco di righe uguali */}
          {c.upcoming.length > 0 && (
            <section className="glass-card rounded-[20px] shadow-elev-1 p-[18px] animate-rise-in"
              style={{ animationDelay: '0.06s' }}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <p className="label-caps text-secondary">Prossimi 30 giorni</p>
                <div className="text-right flex-none">
                  <p className="text-[13px] font-semibold text-primary balance-num">{formatCurrency(upcomingTotal)}</p>
                  {upcomingInvested > 0 && (
                    <p className="text-[11px] text-secondary balance-num">
                      di cui {formatCurrency(upcomingInvested)} investiti
                    </p>
                  )}
                </div>
              </div>
              <ul>
                {c.upcoming.map((u, i) => {
                  const days = Math.round(
                    (Date.parse(`${u.date}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / DAY_MS,
                  );
                  const soon = days <= SOON_DAYS;
                  return (
                    <li key={i} className="flex items-stretch gap-3">
                      <span className={`w-[38px] flex-none text-[11.5px] font-semibold balance-num pt-2.5 ${
                        soon ? 'text-gold' : 'text-secondary'}`}>
                        {formatDate(u.date)}
                      </span>
                      <span className="w-px flex-none" style={{ background: 'var(--border)' }} />
                      <span className="flex-1 min-w-0 flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0 flex items-center gap-1.5">
                          <span className="text-[13.5px] text-primary truncate">{u.description}</span>
                          {u.investment && <InvestmentTag />}
                        </span>
                        <span className={`text-[13.5px] font-semibold balance-num flex-none ${
                          u.investment ? 'text-gold' : 'text-primary'}`}>
                          {formatCurrency(u.amount)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4 wide:w-[352px] ultra:w-[384px] wide:flex-none">
          <Group title="Rate" items={c.installments} total={instTotal}
            empty="Nessun piano a rate attivo." onOpen={openMovements} />
          <Group title="Abbonamenti" items={c.subscriptions} total={subsTotal}
            empty="Nessun abbonamento attivo." onOpen={openMovements} />
          <Group title="Ricorrenti" items={c.recurring} total={recTotal}
            empty="Nessuna spesa ricorrente attiva." onOpen={openMovements} />
          {c.investments.length > 0 && (
            <Group title="Investimenti" items={c.investments} total={invTotal}
              note="Non è un costo: esce dal conto e resta tuo."
              empty="" onOpen={openMovements} />
          )}
        </div>
      </div>
    </div>
  );
}

const total = (items: Commitment[]) => items.reduce((s, c) => s + c.monthlyEquivalent, 0);

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] text-secondary">
      <span className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
      {label} <span className="font-semibold text-primary balance-num">{formatCurrency(value)}</span>
    </span>
  );
}

function Group({ title, items, total: sum, empty, note, onOpen }: {
  title: string; items: Commitment[]; total: number; empty: string; note?: string;
  onOpen: (c: Commitment) => void;
}) {
  return (
    <section className="glass-card rounded-[20px] shadow-elev-1 p-[18px]">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="label-caps text-secondary">{title}</p>
        {items.length > 0 && (
          <p className="text-[12.5px] text-secondary balance-num">
            <span className="font-semibold text-primary">{formatCurrency(sum)}</span>/mese
          </p>
        )}
      </div>
      {note && items.length > 0 && (
        <p className="text-[11.5px] text-secondary leading-relaxed -mt-0.5 mb-1.5">{note}</p>
      )}
      {items.length === 0
        ? <p className="text-[12px] text-tertiary py-1">{empty}</p>
        : <ul>{items.map(c => <Row key={c.seriesId} c={c} onOpen={onOpen} />)}</ul>}
    </section>
  );
}

/** Nella timeline versamenti e bollette stanno mescolati: il tag è l'unica
 *  cosa che li distingue. Dentro il gruppo "Investimenti" non serve — lo dice
 *  già il titolo — e lì basta l'importo in oro. */
function InvestmentTag() {
  // Su schermo stretto la parola per intero mangia la descrizione: resta la
  // freccia, che con l'importo in oro basta, e il testo torna da `sm` in su.
  return (
    <span title="Investimento"
      className="flex-none inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase
                 tracking-[0.06em] text-gold px-1.5 py-[1px] rounded-full bg-gold/[0.14]">
      <span aria-hidden>↗</span>
      <span className="sr-only sm:not-sr-only">Investimento</span>
    </span>
  );
}

function Row({ c, onOpen }: { c: Commitment; onOpen: (c: Commitment) => void }) {
  const isPlan = c.kind === 'installment' && c.totalInstallments != null;
  const isInvestment = c.type === 'investment';
  const paid = Math.min(c.paidInstallments ?? 0, c.totalInstallments ?? 0);
  const progress = isPlan && c.totalInstallments ? paid / c.totalInstallments : 0;

  // Su una voce annuale il numero grande è la quota mensile: senza dirlo
  // sembra un errore accanto a un abbonamento da 890 € l'anno.
  const sub = c.freq === 'yearly'
    ? `annuale ${formatCurrency(c.amount)} · quota mensile`
    : `${c.freq ? FREQ_LABEL[c.freq] : 'ricorrente'}${c.nextDate ? ` · prossima ${formatDate(c.nextDate)}` : ''}`;

  return (
    <li className="border-b border-divider last:border-b-0">
      <button type="button" onClick={() => onOpen(c)}
        aria-label={`Vedi i movimenti di ${c.description}`}
        className="row-tap w-full flex flex-col gap-1.5 py-2.5 text-left rounded-xl transition-colors">
        <span className="w-full flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[13.5px] text-primary truncate">{c.description}</span>
            <span className="block text-[11px] text-tertiary truncate">{sub}</span>
          </span>
          <span className={`text-[13.5px] font-semibold whitespace-nowrap balance-num flex-none ${
            isInvestment ? 'text-gold' : 'text-primary'}`}>
            {formatCurrency(c.monthlyEquivalent)}<span className="text-[11px] text-secondary font-normal">/mese</span>
          </span>
        </span>

        {/* Un piano a rate ha un inizio e una fine: la barra li dice in un
            colpo, il paragrafo di 11px che c'era prima no. */}
        {isPlan && (
          <span className="w-full">
            <span className="block h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--c-primary) / 0.08)' }}>
              <span className="block h-full rounded-full bg-gold" style={{ width: `${progress * 100}%` }} />
            </span>
            <span className="block text-[11px] text-secondary mt-1">
              {paid}/{c.totalInstallments} · {formatCurrency(c.remainingAmount ?? 0)} residui
              {c.expectedEnd && ` · fine ${capitalize(monthYear(c.expectedEnd))}`}
            </span>
          </span>
        )}
      </button>
    </li>
  );
}

/** "febbraio 2027" — per la fine di un piano il giorno non serve. */
function monthYear(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}
