import { NavLink } from 'react-router-dom';

interface Props {
  onAdd: () => void;
  uiV2?: boolean;
}

export function BottomNav({ onAdd, uiV2 = false }: Props) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 safe-bottom pointer-events-none md:hidden"
      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
    >
      <div className="max-w-md mx-auto px-3 pb-2 flex justify-center">
        <div className="pointer-events-auto w-full flex items-center justify-around glass-nav rounded-[28px] px-2 py-1.5 shadow-float">
          <NavBtn to="/" label={uiV2 ? 'Oggi' : 'Home'} icon={<HomeIcon />} />
          <NavBtn to="/insights" label={uiV2 ? 'Consigli' : 'Insight'} icon={<InsightIcon />} />

          <button
            onClick={onAdd}
            aria-label="Aggiungi"
            className="w-12 h-12 rounded-full glass-cta-gold flex items-center justify-center mx-0.5 shrink-0 transition-transform active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>

          <NavBtn to="/budget" label={uiV2 ? 'Piano' : 'Budget'} icon={<TargetIcon />} />
          <NavBtn to="/transactions" label="Movimenti" icon={<ListIcon />} />
        </div>
      </div>
    </nav>
  );
}

function NavBtn({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink to={to} aria-label={label} end
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-2xl transform-gpu transition-all duration-200 ease-standard active:scale-[0.97] flex-1 min-w-0 ${
          isActive ? 'glass-active-pill text-gold' : 'text-secondary'
        }`
      }>
      {icon}
      <span className="text-[10px] font-medium leading-none truncate max-w-full">{label}</span>
    </NavLink>
  );
}

function InsightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6"/><path d="M10 21h4"/>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5"/>
      <path d="M5 9.5V21h5v-5h4v5h5V9.5"/>
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="9"  y1="6"  x2="20" y2="6"/>
      <line x1="9"  y1="12" x2="20" y2="12"/>
      <line x1="9"  y1="18" x2="20" y2="18"/>
      <circle cx="5" cy="6"  r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="12" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="18" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  );
}
