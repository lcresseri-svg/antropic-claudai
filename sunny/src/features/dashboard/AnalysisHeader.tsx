// Header comune delle schermate di analisi (Entrate, Saldo per conto, Spese
// per categoria, Investimenti): freccia indietro in badge, titolo e una riga
// che dice a cosa serve la schermata. 56px, come tutti gli header del redesign.
//
// Sta qui e non in ognuna delle quattro perché erano quattro header diversi
// per la stessa identica cosa.

import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  subtitle?: string;
  /** Dove torna la freccia. Default: la home. */
  backTo?: string;
  /** Azione secondaria a destra (menu, link…). */
  action?: React.ReactNode;
}

export function AnalysisHeader({ title, subtitle, backTo = '/', action }: Props) {
  const navigate = useNavigate();
  return (
    <div className="h-14 flex items-center gap-3">
      <button type="button" onClick={() => navigate(backTo)} aria-label="Indietro"
        className="w-[34px] h-[34px] rounded-xl glass-card flex items-center justify-center text-secondary hover:text-primary transition-colors flex-none">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] md:text-xl font-semibold text-primary tracking-[-0.03em] truncate">{title}</h1>
        {subtitle && <p className="text-[11px] text-secondary truncate">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
