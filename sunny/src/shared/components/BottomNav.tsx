import { NavLink } from 'react-router-dom';

interface Props {
  onAdd: () => void;
}

export function BottomNav({ onAdd }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 safe-bottom pointer-events-none">
      <div className="max-w-2xl mx-auto px-4 pb-4 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2 glass-nav rounded-full px-2.5 py-1.5">
          <NavBtn to="/" label="Home" icon={<HomeIcon />} />
          <button onClick={onAdd}
            className="w-12 h-12 rounded-full glass-cta-gold flex items-center justify-center mx-1.5 transition-transform active:scale-90">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="#0D0D0D" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
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
        `w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
          isActive ? 'glass-active-pill text-gold' : 'text-secondary'
        }`
      }>
      {icon}
    </NavLink>
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
