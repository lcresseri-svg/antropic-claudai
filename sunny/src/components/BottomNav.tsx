export type View = 'home' | 'transactions' | 'settings';

interface Props {
  view: View;
  onView: (v: View) => void;
  onAdd: () => void;
}

const items: { id: View; label: string; icon: JSX.Element }[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'transactions', label: 'Movimenti', icon: <ListIcon /> },
  { id: 'settings', label: 'Impostazioni', icon: <GearIcon /> },
];

export function BottomNav({ view, onView, onAdd }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 safe-bottom pointer-events-none">
      <div className="max-w-2xl mx-auto px-4 pb-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 bg-elevated/90 backdrop-blur-xl rounded-full p-1.5 shadow-float border border-divider">
          {items.slice(0, 2).map(it => <NavBtn key={it.id} {...it} active={view === it.id} onClick={() => onView(it.id)} />)}
          <button onClick={onAdd}
            className="w-11 h-11 rounded-full bg-gold text-bg flex items-center justify-center text-2xl leading-none mx-0.5 transition-transform active:scale-90">
            +
          </button>
          {items.slice(2).map(it => <NavBtn key={it.id} {...it} active={view === it.id} onClick={() => onView(it.id)} />)}
        </div>
      </div>
    </nav>
  );
}

function NavBtn({ label, icon, active, onClick }: { label: string; icon: JSX.Element; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label}
      className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${active ? 'text-gold' : 'text-secondary'}`}>
      {icon}
    </button>
  );
}

function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>;
}
function ListIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="7" x2="20" y2="7"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="17" x2="20" y2="17"/><circle cx="4" cy="7" r="0.5"/><circle cx="4" cy="12" r="0.5"/><circle cx="4" cy="17" r="0.5"/></svg>;
}
function GearIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
