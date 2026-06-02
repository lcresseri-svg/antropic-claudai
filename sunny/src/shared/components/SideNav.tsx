import { NavLink, useNavigate } from 'react-router-dom';

interface Props {
  loading?: boolean;
  onAdd: () => void;
  onImport: () => void;
}

export function SideNav({ loading, onAdd, onImport }: Props) {
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-[220px] z-30 glass-nav"
      style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-14 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <SunnyLogo />
        <span className="font-semibold text-primary tracking-[-0.02em]">Sunny</span>
        {loading && <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse ml-auto flex-shrink-0" />}
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <SideLink to="/" label="Dashboard" icon={<HomeIcon />} />
        <SideLink to="/insights" label="Insight" icon={<InsightIcon />} />
        <SideLink to="/budget" label="Budget" icon={<TargetIcon />} />
        <SideLink to="/transactions" label="Movimenti" icon={<ListIcon />} />
      </nav>

      {/* Actions */}
      <div className="p-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <button onClick={onImport}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-secondary hover:text-primary hover:bg-card-hover transition-colors text-left">
          <FolderIcon />
          Importa CSV
        </button>
        <button onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-secondary hover:text-primary hover:bg-card-hover transition-colors text-left">
          <GearIcon />
          Impostazioni
        </button>
        <button onClick={onAdd}
          className="w-full py-2.5 rounded-xl glass-cta-gold text-sm font-semibold flex items-center justify-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          Aggiungi
        </button>
      </div>
    </aside>
  );
}

function SideLink({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink to={to} end
      className={({ isActive }) =>
        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gold/8 text-gold'
            : 'text-secondary hover:text-primary hover:bg-card-hover'
        }`
      }>
      {icon}
      {label}
    </NavLink>
  );
}

function SunnyLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5"
        stroke="rgb(200,160,90)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="40.06 13.35"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}

function InsightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6"/><path d="M10 21h4"/>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-5h4v5h5V9.5"/>
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="9" y1="6" x2="20" y2="6"/>
      <line x1="9" y1="12" x2="20" y2="12"/>
      <line x1="9" y1="18" x2="20" y2="18"/>
      <circle cx="5" cy="6" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="12" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="18" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
