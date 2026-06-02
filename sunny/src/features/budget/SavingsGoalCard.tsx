import { formatCurrency } from '../../utils';
import { ProgressBar } from '../../shared/components';

interface Props {
  predicted: number;
  target: number;
  onEdit: () => void;
}

export function SavingsGoalCard({ predicted, target, onEdit }: Props) {
  const pct = target > 0 ? Math.round((predicted / target) * 100) : 0;
  const onTrack = target > 0 && predicted >= target;
  const shown = Math.max(0, predicted);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary">Obiettivo del mese</p>
        <button onClick={onEdit} className="text-xs font-medium text-gold">Modifica</button>
      </div>

      <p className="text-[42px] leading-none font-bold balance-num text-primary">
        {formatCurrency(shown)}
      </p>
      <p className="text-[13px] text-secondary mt-2">
        Risparmio previsto a fine mese
      </p>

      <div className="mt-5">
        <ProgressBar
          value={shown}
          max={target}
          color={onTrack ? 'rgb(var(--c-green))' : 'rgb(var(--c-gold))'}
        />
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-xs text-secondary">
            Target {formatCurrency(target)}
          </span>
          <span className={`text-xs font-semibold balance-num ${onTrack ? 'text-green' : 'text-gold'}`}>
            {Math.max(0, pct)}% completato
          </span>
        </div>
      </div>

      {onTrack && (
        <p className="text-[13px] text-green mt-4">Sei in linea con il tuo obiettivo ✨</p>
      )}
    </div>
  );
}
