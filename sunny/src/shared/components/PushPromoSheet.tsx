import { useEscapeKey } from '../hooks/useEscapeKey';

interface Props {
  open: boolean;
  onClose: () => void;
  onGoToSettings: () => void;
}

/** One-time bottom sheet (iOS PWA only) inviting the user to enable push notifications. */
export function PushPromoSheet({ open, onClose, onGoToSettings }: Props) {
  useEscapeKey(onClose, open);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up">

        <div className="flex items-center justify-between px-6 pt-6 pb-1">
          <h3 className="text-base font-semibold text-primary">Attiva le notifiche</h3>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm">✕</button>
        </div>

        <p className="px-6 pb-4 text-sm text-secondary leading-relaxed">
          Tieniti aggiornato sulla tua situazione finanziaria senza aprire l'app.
        </p>

        <div className="px-6 pb-2 space-y-2">
          <Item icon="📝" text="Promemoria spese a metà giornata e alla sera" />
          <Item icon="🔁" text="Avviso quando una voce ricorrente viene registrata" />
          <Item icon="📊" text="Riepilogo mensile con entrate, uscite e risparmio" />
        </div>

        <div className="px-6 pt-4 pb-6 space-y-2.5">
          <button
            onClick={onGoToSettings}
            className="w-full py-3.5 rounded-2xl bg-gold text-bg text-sm font-semibold active:scale-[0.98] transition-transform">
            Apri le impostazioni
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-secondary text-sm font-medium active:text-primary transition-colors">
            Non ora
          </button>
        </div>
      </div>
    </div>
  );
}

function Item({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="w-8 h-8 rounded-xl bg-elevated flex items-center justify-center text-sm flex-shrink-0">{icon}</span>
      <span className="text-sm text-primary">{text}</span>
    </div>
  );
}
