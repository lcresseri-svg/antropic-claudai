import { useNavigate } from 'react-router-dom';
import { ArcLogo } from '../shared/components/ArcLogo';

interface Props {
  brand: string;
  loading: boolean;
  isSettings: boolean;
  settingsOpen: boolean;
  onToggleSettings: (open: boolean) => void;
  onImport: () => void;
}

/** Mobile-only header — in-flow (shrink-0) so it doesn't trigger iOS viewport resize. */
export function AppHeader({ brand, loading, isSettings, settingsOpen, onToggleSettings, onImport }: Props) {
  const navigate = useNavigate();
  return (
    <header className="shrink-0 z-[40] glass-header md:hidden">
      <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button type="button" onClick={() => navigate('/')} aria-label="Vai alla dashboard"
            className="flex items-center gap-2.5 min-w-0 active:opacity-70 transition-opacity">
            <ArcLogo size={28} />
            <span className="font-semibold text-primary tracking-[-0.02em] truncate">{brand}</span>
          </button>
          {loading && <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse flex-shrink-0" />}
        </div>
        {!isSettings && (
          <div className="relative">
            <button type="button" onClick={() => onToggleSettings(!settingsOpen)}
              aria-label="Menu rapido" aria-expanded={settingsOpen}
              className="w-11 h-11 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-full">
              <HeaderGearIcon />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-10 z-[50] rounded-2xl py-1 w-44 animate-fade-in-fast border border-divider shadow-float glass-elevated">
                <button type="button" onClick={() => { navigate('/settings'); onToggleSettings(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-card-hover transition-colors text-left rounded-t-2xl">
                  <HeaderGearIcon /> Impostazioni
                </button>
                <div className="h-px bg-divider mx-3" />
                <button type="button" onClick={() => { onImport(); onToggleSettings(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-card-hover transition-colors text-left rounded-b-2xl">
                  <FolderIcon /> Importa
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function HeaderGearIcon() {
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
