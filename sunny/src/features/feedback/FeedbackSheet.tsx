import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { useFeedback } from './useFeedback';
import { FeedbackType, FEEDBACK_OPTIONS } from './feedbackTypes';

interface Props {
  open: boolean;
  user: User;
  onClose: () => void;
}

export function FeedbackSheet({ open, user, onClose }: Props) {
  const { submit, submitting, done, error, reset } = useFeedback(user);
  const [type, setType] = useState<FeedbackType>('idea');
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) { setType('idea'); setText(''); reset(); }
  }, [open, reset]);

  useEscapeKey(onClose, open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md sm:max-w-[460px] glass-elevated rounded-[26px] shadow-float animate-sheet-up sm:animate-scale-in max-h-[85dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="text-base font-semibold text-primary">Lascia un feedback</h3>
          <button type="button" aria-label="Chiudi"
            onPointerDown={e => { e.preventDefault(); onClose(); }}
            onClick={onClose}
            className="w-10 h-10 -mr-1.5 rounded-full bg-elevated flex items-center justify-center text-secondary text-base active:scale-90 transition-transform">✕</button>
        </div>

        <div className="overflow-y-auto overscroll-contain scrollbar-hide px-6 pb-6 flex-1">
          {done ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">🙏</p>
              <p className="text-sm font-semibold text-primary mb-1">Grazie!</p>
              <p className="text-[13px] text-secondary">Il tuo feedback è stato inviato.</p>
              <button onClick={onClose}
                className="w-full mt-6 py-3 rounded-xl glass-cta-gold text-sm font-semibold">
                Chiudi
              </button>
            </div>
          ) : (
            <>
              <p className="label-caps text-secondary mb-3">Di cosa si tratta?</p>
              <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {FEEDBACK_OPTIONS.map(o => (
                  <button key={o.type} type="button" onClick={() => setType(o.type)}
                    aria-pressed={type === o.type}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors flex-none ${
                      type === o.type ? 'cta-gold-fill' : 'bg-elevated text-secondary'
                    }`}>
                    <span className="text-[13px]">{o.icon}</span>
                    {o.label}
                  </button>
                ))}
              </div>

              <p className="label-caps text-secondary mb-2">Raccontaci di più <span className="normal-case font-normal text-secondary/60">(facoltativo)</span></p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Cosa ti è piaciuto, cosa non va, cosa miglioreresti…"
                className="w-full bg-card rounded-[16px] px-3.5 py-3 text-primary text-sm outline-none resize-none placeholder:text-secondary/50 focus:ring-1 focus:ring-gold/40"
              />
              <div className="flex items-start justify-between gap-3 mt-2 px-1">
                <p className="text-[11px] text-tertiary leading-snug">
                  Non includere dati sensibili. Inviamo solo il testo, il tipo e la versione dell'app.
                </p>
                <p className="text-[11px] text-tertiary balance-num flex-none">{text.length}/1000</p>
              </div>

              {error && <p className="text-[13px] text-red mt-3">{error}</p>}

              <button
                onClick={() => submit(type, text)}
                disabled={submitting}
                className="w-full mt-5 py-3.5 rounded-2xl bg-primary text-bg text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform">
                {submitting ? 'Invio…' : 'Invia feedback'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
