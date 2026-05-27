export function formatCurrency(amount: number, opts?: { sign?: boolean }): string {
  const s = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(Math.abs(amount));
  if (opts?.sign) return `${amount < 0 ? '−' : '+'}${s}`;
  return amount < 0 ? `−${s}` : s;
}

export function formatCompact(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(new Date(dateStr));
}

export function formatMonthShort(key: string): string {
  return new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(new Date(key + '-01'));
}

export function formatMonthLong(key: string): string {
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(key + '-01'));
}

export function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date());
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buonanotte';
  if (h < 13) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}
