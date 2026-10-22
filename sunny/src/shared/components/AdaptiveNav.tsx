import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArcLogo } from './ArcLogo';

interface Props {
  onAdd: () => void;
  onImport: () => void;
  aiEnabled: boolean;
  showCommitments: boolean;
  isSettings?: boolean;
}

const principal = [
  ['/', 'Oggi', 'M3 10.5 12 3l9 7.5 M5 9.5V21h5v-5h4v5h5V9.5'],
  ['/transactions', 'Movimenti', 'M4 6h16 M4 12h16 M4 18h16'],
  ['/wealth', 'Patrimonio', 'M3 17l5-5 4 3 5-7 M3 21h18'],
] as const;

const wealthRoutes = ['/wealth', '/wealth-v2', '/investments', '/account-balance', '/wealth-history'];

export function AdaptiveNav({ onAdd, onImport, aiEnabled, showCommitments, isSettings }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = pathname === '/transactions' ? '/transactions'
    : wealthRoutes.includes(pathname) ? '/wealth'
    : pathname === '/settings' ? null : '/';
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => document.documentElement.style.setProperty('--ui-bottom-height', `${nav.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--ui-bottom-height'); };
  }, []);
  return <>
    <a className="ui3-skip" href="#page-content">Salta al contenuto</a>
    <nav ref={ref} className={`ui3-nav glass-nav ${isSettings ? 'ui3-nav-settings' : ''}`} aria-label="Navigazione principale">
      <button className="ui3-brand" onClick={() => navigate('/')} aria-label="Sunny · Vai a Oggi">
        <ArcLogo size={28} /><span>sunny</span>
      </button>
      <div className="ui3-primary-nav">
        {principal.map(([to, label, path], index) => <Link key={to} to={to} aria-label={label} aria-current={active === to ? 'page' : undefined} data-ui31-primary="true" className={`ui3-nav-link ui3-nav-position-${index}`}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={path} /></svg>
          <span>{label}</span>
        </Link>)}
        <button className="ui3-add cta-gold-fill" onClick={onAdd} aria-label="Aggiungi movimento"><span aria-hidden>＋</span><span className="ui3-add-label">Aggiungi</span></button>
      </div>
      <NavLink to="/budget" className="ui31-month-shortcut" aria-label="Il tuo mese">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="M8 14h3m-3 3h7"/></svg>
        <span>Il tuo mese</span>
      </NavLink>
      <div className="ui3-secondary-nav">
        {showCommitments && <NavLink to="/commitments">Impegni</NavLink>}
        <NavLink to="/insights">Consigli</NavLink>
        {aiEnabled && <NavLink to="/ai-coach">AI Coach</NavLink>}
        <button onClick={onImport}>Importa CSV</button>
        <NavLink to="/settings">Impostazioni</NavLink>
      </div>
      <p className="ui3-nav-footer">Una visione più chiara.<br />Un passo alla volta.</p>
    </nav>
  </>;
}
