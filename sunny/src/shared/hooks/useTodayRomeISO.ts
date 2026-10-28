import { useEffect, useState } from 'react';
import { todayRomeISO } from '../romeDate';
export { todayRomeISO } from '../romeDate';
/** Refresh statements at midnight and after returning to a suspended tab. */
export function useTodayRomeISO():string {
  const [today, setToday] = useState(todayRomeISO);
  useEffect(() => {
    const refresh = () => setToday(todayRomeISO());
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  return today;
}
