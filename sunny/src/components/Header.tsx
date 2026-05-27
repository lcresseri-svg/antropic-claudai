import { User } from 'firebase/auth';

interface Props {
  view: 'dashboard' | 'transactions';
  onViewChange: (v: 'dashboard' | 'transactions') => void;
  onAdd: () => void;
  onImport: () => void;
  user: User;
  onLogOut: () => void;
}

export function Header({ view, onViewChange, onAdd, onImport, user, onLogOut }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-cream border-b border-black/5">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xl">☀️</span>
          <span className="text-lg font-semibold tracking-tight text-dark">Sunny</span>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1 bg-black/5 rounded-xl p-1 flex-shrink-0">
          {(['dashboard', 'transactions'] as const).map(v => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                view === v ? 'bg-white text-dark shadow-sm' : 'text-dark/50 hover:text-dark/80'
              }`}
            >
              {v === 'dashboard' ? 'Dashboard' : 'Transazioni'}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onImport}
            className="px-3 py-2 rounded-xl bg-black/5 text-dark/60 text-xs font-medium hover:bg-black/10 transition-colors hidden sm:flex items-center gap-1.5"
            aria-label="Importa"
          >
            <span>📂</span> Importa
          </button>
          <button
            onClick={onImport}
            className="w-9 h-9 rounded-xl bg-black/5 text-dark/60 flex items-center justify-center sm:hidden hover:bg-black/10 transition-colors"
            aria-label="Importa"
          >
            📂
          </button>

          <button
            onClick={onAdd}
            className="w-9 h-9 rounded-xl bg-dark text-cream flex items-center justify-center text-xl leading-none hover:bg-dark/80 transition-colors"
            aria-label="Aggiungi transazione"
          >
            +
          </button>

          <button
            onClick={onLogOut}
            title={`Esci (${user.displayName})`}
            className="w-8 h-8 rounded-full overflow-hidden border-2 border-transparent hover:border-gold transition-colors flex-shrink-0"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName ?? ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-sage flex items-center justify-center text-white text-xs font-bold">
                {(user.displayName ?? 'U')[0]}
              </div>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
