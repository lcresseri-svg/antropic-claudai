import { NavLink } from 'react-router-dom';

interface Props {
  onAdd: () => void;
}

export function BottomNav({ onAdd }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden safe-bottom glass-nav"
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-end justify-around px-2 pt-2 pb-1">
        <NavBtn to="/" label="Home" icon={<HomeIcon />} />
        <NavBtn to="/insights" label="Insight" icon={<InsightIcon />} />

        {/* Centre add button — raised above the bar */}
        <div className="flex flex-col items-center pb-1">
          <button
            onClick={onAdd}
            aria-label="Aggiungi"
            className="w-14 h-14 -mt-6 rounded-full glass-cta-gold flex items-center justify-center shadow-float transition-transform active:scale-90"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <NavBtn to="/budget" label="Budget" icon={<TargetIcon />} />
        <NavBtn to="/transactions" label="Movimenti" icon={<ListIcon />} />
      </div>
    </nav>
  );
}

function NavBtn({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink to={to} aria-label={label} end
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors min-w-[56px] ${
          isActive ? 'text-gold' : 'text-secondary'
        }`
      }>
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </NavLink>
  );
}

function InsightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6"/><path d="M10 21h4"/>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5"/>
      <path d="M5 9.5V21h5v-5h4v5h5V9.5"/>
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="9"  y1="6"  x2="20" y2="6"/>
      <line x1="9"  y1="12" x2="20" y2="12"/>
      <line x1="9"  y1="18" x2="20" y2="18"/>
      <circle cx="5" cy="6"  r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="12" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="18" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  );
}
