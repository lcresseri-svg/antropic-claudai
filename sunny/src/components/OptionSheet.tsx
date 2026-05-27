import { ReactNode } from 'react';

export interface Option { id: string; label: string; icon: string; color: string; }

interface Props {
  open: boolean;
  title: string;
  options: Option[];
  onPick: (id: string) => void;
  onClose: () => void;
  footer?: ReactNode;
}

export function OptionSheet({ open, title, options, onPick, onClose, footer }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      <div className="relative w-full max-w-md bg-elevated rounded-3xl p-5 shadow-float animate-sheet-up max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-primary">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-secondary">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto scrollbar-hide">
          {options.map(o => (
            <button key={o.id} onClick={() => onPick(o.id)}
              className="flex items-center gap-2.5 p-3 rounded-2xl bg-card hover:bg-card-hover transition-colors text-left">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                style={{ backgroundColor: o.color + '22' }}>{o.icon}</span>
              <span className="text-sm font-medium text-primary truncate">{o.label}</span>
            </button>
          ))}
        </div>
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </div>
  );
}
