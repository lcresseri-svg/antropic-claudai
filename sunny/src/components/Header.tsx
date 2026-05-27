interface Props {
  view: 'dashboard' | 'transactions';
  onViewChange: (v: 'dashboard' | 'transactions') => void;
  onAdd: () => void;
}

export function Header({ view, onViewChange, onAdd }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-cream border-b border-black/5">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">☀️</span>
          <span className="text-lg font-semibold tracking-tight text-dark">Sunny</span>
        </div>

        <nav className="flex items-center gap-1 bg-black/5 rounded-xl p-1">
          <button
            onClick={() => onViewChange('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              view === 'dashboard'
                ? 'bg-white text-dark shadow-sm'
                : 'text-dark/50 hover:text-dark/80'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onViewChange('transactions')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              view === 'transactions'
                ? 'bg-white text-dark shadow-sm'
                : 'text-dark/50 hover:text-dark/80'
            }`}
          >
            Transazioni
          </button>
        </nav>

        <button
          onClick={onAdd}
          className="w-9 h-9 rounded-xl bg-dark text-cream flex items-center justify-center text-xl leading-none hover:bg-dark/80 transition-colors shadow-sm"
          aria-label="Aggiungi transazione"
        >
          +
        </button>
      </div>
    </header>
  );
}
