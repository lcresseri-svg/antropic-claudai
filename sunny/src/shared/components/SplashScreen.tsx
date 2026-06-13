import { useState, useEffect, useRef } from 'react';

interface Props {
  isReady: boolean;
}

const MIN_DURATION = 800; // minimum time the splash stays before it may leave
const ENTER_MS = 500;
const LEAVE_MS = 350;

/** Full-screen brand splash shown on cold start. Plays an enter animation on
 *  mount, then — once `isReady` is true and at least MIN_DURATION has elapsed —
 *  fades out and unmounts itself. No spinner, no progress, no extra chrome. */
export function SplashScreen({ isReady }: Props) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const mountTime = useRef(Date.now());

  // Enter animation: flip `entered` on the next frame so the transition runs
  // from the initial (opacity 0, scale 0.85) state.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Leave once ready, respecting the minimum on-screen time, then unmount.
  useEffect(() => {
    if (!isReady) return;
    const elapsed = Date.now() - mountTime.current;
    const wait = Math.max(0, MIN_DURATION - elapsed);
    let unmountTimer: ReturnType<typeof setTimeout>;
    const leaveTimer = setTimeout(() => {
      setLeaving(true);
      unmountTimer = setTimeout(() => setGone(true), LEAVE_MS);
    }, wait);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(unmountTimer);
    };
  }, [isReady]);

  if (gone) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: '#0D0D0D',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    opacity: leaving ? 0 : 1,
    transition: leaving ? `opacity ${LEAVE_MS}ms ease-in` : undefined,
  };

  const logoStyle: React.CSSProperties = leaving
    ? {
        transform: 'scale(1.06)',
        transition: `transform ${LEAVE_MS}ms ease-in`,
      }
    : {
        opacity: entered ? 1 : 0,
        transform: entered ? 'scale(1)' : 'scale(0.85)',
        transition: `opacity ${ENTER_MS}ms ease-out, transform ${ENTER_MS}ms ease-out`,
      };

  return (
    <div style={overlayStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, ...logoStyle }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="splash-g" x1="12" y1="3" x2="12" y2="21" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F5C842" />
              <stop offset="100%" stopColor="#B8720C" />
            </linearGradient>
          </defs>
          <circle
            cx="12" cy="12" r="8.5"
            stroke="url(#splash-g)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="40.06 13.35"
            transform="rotate(135 12 12)"
          />
        </svg>
        <p
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 36,
            fontWeight: 400,
            letterSpacing: '-0.01em',
            color: '#F0EAD6',
            margin: 0,
          }}
        >
          Sunny
        </p>
      </div>
    </div>
  );
}
