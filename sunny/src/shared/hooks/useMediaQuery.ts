import { useEffect, useState } from 'react';

/**
 * Una media query come booleano React.
 *
 * Serve dove il breakpoint non si può esprimere in CSS perché il valore è un
 * NUMERO che entra in JavaScript — l'altezza di un grafico SVG, per esempio,
 * che su desktop cresce del ~30%. Ovunque il breakpoint sia una classe, restano
 * le varianti Tailwind: questo hook non è una scorciatoia per evitarle.
 *
 * Si aggiorna al ridimensionamento e alla rotazione, quindi il grafico non
 * resta della misura che aveva al primo render.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  });

  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia(query); } catch { return; }
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** `md` di Tailwind: da qui in su c'è la sidebar e i grafici respirano. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
