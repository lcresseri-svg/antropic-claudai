/**
 * Motion tokens — the JS mirror of the durations/easings declared in
 * tailwind.config.js (keyframes + transitionTimingFunction). Keep in sync.
 *
 * The app's motion language is calm and quick: entries use the "emphasized"
 * curve, exits are shorter and use the "exit" curve. `prefers-reduced-motion`
 * is honoured globally in index.css (animations collapse to ~0ms), so JS-side
 * timers only ever OVER-wait there — never show a dead, unanimated frame.
 */
export const MOTION = {
  duration: {
    instant: 80,
    fast: 120,
    base: 180,
    medium: 240,
    slow: 320,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

/** How long a closing sheet stays mounted so animate-sheet-down can play (its
 *  CSS duration is 180ms; +20ms of slack absorbs frame scheduling). */
export const SHEET_EXIT_MS = 200;
