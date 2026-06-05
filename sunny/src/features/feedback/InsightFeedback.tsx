import { useState } from 'react';
import { User } from 'firebase/auth';
import { useFeedback } from './useFeedback';

interface Props {
  insightKey: string;
  user: User | null;
}

type Reason = 'Non è chiaro' | 'È sbagliato' | 'Troppo generico' | 'Non mi interessa' | 'Altro';
const REASONS: Reason[] = ['Non è chiaro', 'È sbagliato', 'Troppo generico', 'Non mi interessa', 'Altro'];

export function InsightFeedback({ insightKey, user }: Props) {
  const { submit, submitting, done } = useFeedback(user);
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);

  const handleUp = () => {
    if (voted) return;
    setVoted('up');
    submit('other', `[+1] ${insightKey}`);
  };

  const handleDown = () => {
    if (voted) return;
    setVoted('down');
    setReasonOpen(true);
  };

  const handleReason = (reason: Reason) => {
    setReasonOpen(false);
    const type = reason === 'È sbagliato' ? 'bug' : 'confusion';
    submit(type, `[-1] ${insightKey} · ${reason}`);
  };

  if (done && voted === 'up') {
    return (
      <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-1.5">
        <span className="text-[11px] text-secondary/60">Grazie 👍</span>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
      {!reasonOpen ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-secondary/50 flex-1">Utile?</span>
          <button
            type="button"
            onClick={handleUp}
            disabled={!!voted || submitting}
            aria-label="Utile"
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              voted === 'up' ? 'bg-gold/15 text-gold' : 'bg-elevated text-secondary disabled:opacity-40'
            }`}
          >
            👍 Sì
          </button>
          <button
            type="button"
            onClick={handleDown}
            disabled={!!voted || submitting}
            aria-label="Non utile"
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              voted === 'down' ? 'bg-elevated text-secondary' : 'bg-elevated text-secondary disabled:opacity-40'
            }`}
          >
            👎 No
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-secondary">Perché non è utile?</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => handleReason(r)}
                disabled={submitting}
                className="px-2.5 py-1 rounded-lg bg-elevated text-secondary text-[11px] font-medium active:bg-card-hover transition-colors disabled:opacity-40"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
