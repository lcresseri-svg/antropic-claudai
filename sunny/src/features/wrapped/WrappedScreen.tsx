// Sunny Wrapped — la shell: barre, avanzamento automatico, tocco, chiusura.
//
// È una rotta, non una sheet, ma copre tutto: header e bottom nav spariscono
// sotto un overlay a schermo intero. Fuori dalla finestra (o su un anno che
// non è quello in corso) la rotta rimanda alla home invece di aprire una
// retrospettiva fuori stagione — tranne per l'admin, che può guardarla in
// qualsiasi momento dell'anno con i dati che ci sono.
//
// TEMA: il Wrapped resta scuro anche con il tema chiaro attivo. Non tocca il
// tema dell'app — la classe `.wrapped-shell` ridichiara i token scuri solo
// dentro il contenitore (vedi index.css), così uscendo torna tutto da solo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { useScrollLock } from '../../shared/useScrollLock';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { isAdminUser } from '../../shared/featureFlags';
import { buildWealthHistory } from '../dashboard/wealthAnalytics';
import { canOpenWrapped, isWrappedInSeason, wrappedPeriodEnd } from './wrappedWindow';
import { buildYearWrapped } from './yearWrapped';
import { WrappedStoryBody } from './WrappedStories';
import { WrappedSummary } from './WrappedSummary';
import { WrappedGoalScreen, CloseButton } from './WrappedGoalScreen';
import { markWrappedSeen } from './wrappedStorage';
import { ArcLogo } from '../../shared/components/ArcLogo';

/** Durata di una storia. Deve restare allineata a --wrapped-ms in index.css:
 *  la barra è l'animazione di questo stesso conto alla rovescia. */
const STORY_MS = 15000;

/** Oltre questo spostamento il gesto è uno swipe, non un tocco. */
const SWIPE_PX = 50;
/** Trascinamento verso il basso che chiude. */
const CLOSE_PX = 90;

interface Props {
  transactions: Transaction[];
  /** Occorrenze proiettate delle serie ricorrenti (già calcolate dall'app). */
  projected: Transaction[];
  user: User;
  onSetSavingsTarget: (monthly: number) => void;
}

type Phase = 'stories' | 'summary' | 'goal';

export function WrappedScreen({ transactions, projected, user, onSetSavingsTarget }: Props) {
  const { year: yearParam = '' } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const { getCat, getAcc, accounts, categories } = useSettings();

  const year = Number(yearParam);
  const todayISO = new Date().toISOString().slice(0, 10);
  const admin = isAdminUser(user);
  const allowed = canOpenWrapped(year, todayISO, { admin });

  // `buildWealthHistory` scarta di proposito le righe `projected` (sono di sola
  // vista). Qui il programmato È parte del racconto, quindi le occorrenze
  // proiettate entrano nella serie come movimenti normali: la copia toglie solo
  // il flag e non esce da questo useMemo — nessuna scrittura, nessun effetto
  // altrove.
  const netWorth = useMemo(() => {
    if (!allowed) return [];
    const withPlanned = [
      ...transactions,
      ...projected.map(({ projected: _p, ...rest }) => rest as Transaction),
    ];
    return buildWealthHistory(withPlanned, accounts, categories, 'custom', {
      // La finestra del patrimonio finisce con il periodo raccontato: l'`now`
      // sposta il tetto di getWealthRange, che altrimenti taglierebbe a oggi.
      now: new Date(Date.UTC(year, 11, 31)),
      customStart: `${year}-01-01`,
      customEnd: wrappedPeriodEnd(year, todayISO),
    }).map(p => ({ date: p.date, total: p.total }));
  }, [allowed, transactions, projected, accounts, categories, year, todayISO]);

  const w = useMemo(
    () => buildYearWrapped({ transactions, projected, getCat, getAcc, year, todayISO, netWorth }),
    [transactions, projected, getCat, getAcc, year, todayISO, netWorth],
  );

  const [phase, setPhase] = useState<Phase>('stories');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const stories = w.stories;
  const go = useCallback((delta: 1 | -1) => {
    setIndex(i => {
      const next = i + delta;
      if (next < 0) return 0;
      if (next >= stories.length) { setPhase('summary'); return i; }
      return next;
    });
  }, [stories.length]);

  const close = useCallback(() => navigate('/', { replace: true }), [navigate]);
  useScrollLock(true);
  useEscapeKey(close, true);

  // Il Wrapped si "consuma" solo se guardato IN STAGIONE: una anteprima
  // dell'admin a marzo non deve far sparire la card di dicembre.
  const inSeason = isWrappedInSeason(todayISO);
  useEffect(() => {
    if (phase !== 'stories' && inSeason) markWrappedSeen(user.uid, year);
  }, [phase, inSeason, user.uid, year]);

  // ── Avanzamento automatico ────────────────────────────────────────────────
  // Il tempo residuo è tenuto a mano invece di ripartire da capo a ogni pausa:
  // con il dito giù la barra si ferma dov'è, e ripartendo il timer deve
  // ripartire da lì, altrimenti barra e avanzamento raccontano due storie.
  const timer = useRef<number | undefined>(undefined);
  const startedAt = useRef(0);
  const left = useRef(STORY_MS);

  useEffect(() => { left.current = STORY_MS; }, [index, phase]);

  useEffect(() => {
    if (phase !== 'stories') return;
    if (paused) {
      window.clearTimeout(timer.current);
      left.current = Math.max(0, left.current - (Date.now() - startedAt.current));
      return;
    }
    startedAt.current = Date.now();
    timer.current = window.setTimeout(() => go(1), left.current);
    return () => window.clearTimeout(timer.current);
  }, [phase, index, paused, go]);

  // ── Gesti ─────────────────────────────────────────────────────────────────
  const down = useRef<{ x: number; y: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    down.current = { x: e.clientX, y: e.clientY };
    setPaused(true);
  };

  const onUp = (e: React.PointerEvent) => {
    const from = down.current;
    down.current = null;
    setPaused(false);
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (dy > CLOSE_PX && Math.abs(dy) > Math.abs(dx)) return close();
    if (Math.abs(dx) > SWIPE_PX) return go(dx < 0 ? 1 : -1);
    // Tocco secco: metà destra avanti, metà sinistra indietro.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    go(e.clientX - rect.left > rect.width / 2 ? 1 : -1);
  };

  if (!allowed) return <Navigate to="/" replace />;

  // Un anno senza un solo movimento non è un anno da raccontare.
  if (w.txCount === 0) {
    return (
      <div className="wrapped-shell fixed inset-0 z-[70] flex flex-col items-center justify-center px-8 text-center">
        <p className="label-caps text-gold">Sunny Wrapped {w.year}</p>
        <p className="text-[19px] font-semibold text-primary mt-3 leading-snug">
          Per ora non c'è niente da raccontare.
        </p>
        <p className="text-[14px] text-secondary mt-2 leading-relaxed">
          Registra qualche movimento e torna a trovarci: il tuo {w.year} si scrive da sé.
        </p>
        <button type="button" onClick={close}
          className="cta-gold-fill rounded-2xl px-6 py-3 text-[14px] font-semibold mt-7">
          Torna alla home
        </button>
      </div>
    );
  }

  if (phase === 'goal') {
    return (
      <div className="wrapped-shell fixed inset-0 z-[70] overflow-y-auto">
        <WrappedGoalScreen w={w} onClose={close} onSkip={close}
          onSave={monthly => onSetSavingsTarget(monthly)} />
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="wrapped-shell fixed inset-0 z-[70] overflow-y-auto">
        <div className="mx-auto w-full max-w-[430px]">
          <div className="flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2.5">
              <ArcLogo size={22} />
              <span className="label-caps text-gold">Sunny Wrapped</span>
            </div>
            <CloseButton onClick={close} />
          </div>
          <WrappedSummary w={w} onGoal={() => setPhase('goal')} />
        </div>
      </div>
    );
  }

  const id = stories[index];
  const cover = id === 'cover';
  const glow = cover ? 'wrapped-glow-top'
    : id === 'savingsRate' || id === 'vsPrev' ? 'wrapped-glow-bottom' : '';

  return (
    <div className={`wrapped-shell fixed inset-0 z-[70] ${glow}`}>
      <div className="mx-auto w-full max-w-[430px] h-full flex flex-col p-5"
        onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { down.current = null; setPaused(false); }}>

        {/* Barre di avanzamento: una per storia effettivamente raccontata. */}
        <div className="flex gap-1" aria-hidden="true">
          {stories.map((s, i) => (
            <span key={s} className="flex-1 h-[2.5px] rounded-sm overflow-hidden"
              style={{ background: 'rgba(var(--c-primary) / 0.18)' }}>
              {i < index && <span className="block h-full w-full" style={{ background: 'rgba(var(--c-gold) / 0.5)' }} />}
              {i === index && (
                <span key={index} className="wrapped-bar-fill block h-full w-full"
                  style={{ background: 'rgb(var(--c-gold))', animationPlayState: paused ? 'paused' : 'running' }} />
              )}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 h-6">
          {cover ? (
            <div className="flex items-center gap-2.5">
              <ArcLogo size={22} />
              <span className="label-caps text-gold">Sunny Wrapped</span>
            </div>
          ) : <span />}
          <CloseButton onClick={close} />
        </div>

        <div className="flex-1 flex flex-col justify-center min-h-0 overflow-y-auto scrollbar-hide">
          <WrappedStoryBody key={id} id={id} w={w} />
        </div>

        <p className="text-[11.5px] text-tertiary text-center">
          {index === 0 && stories.length > 1 && 'tocca per avanzare · '}
          {index + 1} / {stories.length}
          {index === stories.length - 1 && ' · continua'}
        </p>
      </div>
    </div>
  );
}
