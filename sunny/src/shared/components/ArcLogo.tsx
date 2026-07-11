// ── Brand mark ───────────────────────────────────────────────────────────────

export function ArcLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5"
        stroke="rgb(200,160,90)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="40.06 13.35"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}
