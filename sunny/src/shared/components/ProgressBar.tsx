interface Props {
  value: number;
  max: number;
  color?: string;
  className?: string;
}

/** Thin, animated progress bar matching the app's design tokens. */
export function ProgressBar({ value, max, color = 'rgb(var(--c-gold))', className = '' }: Props) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`h-1.5 rounded-full progress-track overflow-hidden ${className}`}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
