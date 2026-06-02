import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

interface Props {
  open: boolean;
  onClose: () => void;
  onChoose: (scope: 'single' | 'series') => void;
}

/**
 * Outlook-style prompt shown when an already-recorded occurrence of a recurring
 * series is tapped: edit just that entry, or open the whole series.
 */
export function SeriesEditChoiceSheet({ open, onClose, onChoose }: Props) {
  useEscapeKey(onClose, open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up">

        <div className="flex items-center justify-between px-6 pt-6 pb-1">
          <h3 className="text-base font-semibold text-primary">Movimento ricorrente</h3>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm">✕</button>
        </div>
        <p className="px-6 pb-4 text-sm text-secondary">Cosa vuoi modificare?</p>

        <div className="px-6 pb-6 space-y-2.5">
          <Choice
            icon="📄" title="Solo questa occorrenza"
            subtitle="Modifica unicamente questo movimento già registrato."
            onClick={() => onChoose('single')}
          />
          <Choice
            icon="🔁" title="Tutta la serie"
            subtitle="Apri la serie: la regola e le occorrenze future. Le voci già registrate non cambiano."
            onClick={() => onChoose('series')}
          />
        </div>
      </div>
    </div>
  );
}

function Choice({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-start gap-3.5 p-4 rounded-2xl bg-elevated active:bg-card-hover transition-colors text-left">
      <span className="w-9 h-9 rounded-xl bg-card flex items-center justify-center text-base flex-shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary">{title}</span>
        <span className="block text-xs text-secondary mt-0.5">{subtitle}</span>
      </span>
    </button>
  );
}
