interface Props {
  value: number;
  max: number;
  color?: string;
  /** Secondary "committed but not yet spent" amount, drawn after `value` as a
   *  lighter, striped segment so it reads as planned/scheduled, not spent. */
  pending?: number;
  className?: string;
}

/** Thin, animated progress bar matching the app's design tokens. */
export function ProgressBar({ value, max, color = 'rgb(var(--c-gold))', pending = 0, className = '' }: Props) {
  const safeMax = max > 0 ? max : (value + pending) || 1;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const valPct = clamp((value / safeMax) * 100);
  // The pending segment fills the remaining room after the spent part.
  const pendPct = Math.min(clamp((pending / safeMax) * 100), 100 - valPct);
  return (
    <div className={`h-1.5 rounded-full progress-track overflow-hidden flex ${className}`}>
      <div className="h-full transition-[width] duration-[600ms] ease-emphasized"
        style={{ width: `${valPct}%`, backgroundColor: color }} />
      {pendPct > 0 && (
        <div className="h-full transition-[width] duration-[600ms] ease-emphasized"
          style={{
            width: `${pendPct}%`,
            // Lighter, hatched fill = "programmato" (committed, not yet spent).
            backgroundColor: color,
            opacity: 0.4,
            backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 5px)`,
          }} />
      )}
    </div>
  );
}
