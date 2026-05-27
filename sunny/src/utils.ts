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

// Keyword → default category id. Used to guess a category from a description.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  spesa: ['supermercat', 'esselunga', 'coop', 'conad', 'lidl', 'carrefour', 'aldi', 'pam', 'despar', 'eurospin', 'penny', 'market', 'alimentari', 'panetteria', 'macelleria', 'fruttivendolo', 'spesa'],
  casa: ['affitto', 'mutuo', 'bolletta', 'luce', 'gas', 'enel', 'acqua', 'condominio', 'ikea', 'mobili', 'elettricità', 'riscaldamento', 'tari', 'rifiuti', 'internet', 'wifi', 'casa'],
  ristoranti: ['ristorante', 'pizzeria', 'pizza', 'bar', 'caffè', 'caffe', 'colazione', 'pranzo', 'cena', 'sushi', 'mcdonald', 'burger', 'kebab', 'trattoria', 'osteria', 'aperitivo', 'gelateria', 'gelato', 'pub'],
  trasporti: ['benzina', 'carburante', 'diesel', 'gasolio', 'autostrada', 'pedaggio', 'treno', 'trenitalia', 'italo', 'metro', 'metropolitana', 'taxi', 'uber', 'parcheggio', 'telepass', 'autobus', 'aereo', 'volo', 'ryanair', 'easyjet', 'monopattino', 'biglietto'],
  shopping: ['amazon', 'zalando', 'vestiti', 'abbigliamento', 'scarpe', 'zara', 'negozio', 'shopping', 'elettronica', 'mediaworld', 'unieuro', 'decathlon', 'regalo'],
  salute: ['farmacia', 'medico', 'dottore', 'dentista', 'visita', 'ospedale', 'analisi', 'ottico', 'occhiali', 'fisioterapia', 'psicolog', 'integratori', 'salute'],
  abbonamenti: ['netflix', 'spotify', 'disney', 'prime', 'abbonamento', 'dazn', 'youtube', 'icloud', 'dropbox', 'canone', 'palestra', 'gym', 'sky', 'apple music'],
  stipendio: ['stipendio', 'salario', 'busta paga', 'retribuzione'],
  freelance: ['fattura', 'freelance', 'consulenza', 'prestazione', 'partita iva'],
  dividendi: ['dividendo', 'dividendi', 'cedola'],
  azioni_etf: ['etf', 'azioni', 'azione', 'borsa', 'msci', 'vanguard'],
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'binance', 'coinbase'],
};

/** Guess a category id from a free-text description, restricted to the given candidates. */
export function guessCategory(description: string, candidates: { id: string; label: string }[]): string | null {
  const s = description.toLowerCase().trim();
  if (!s || candidates.length === 0) return null;
  for (const [id, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!candidates.some(c => c.id === id)) continue;
    if (words.some(w => s.includes(w))) return id;
  }
  for (const c of candidates) {
    const label = c.label.toLowerCase();
    if (label.length < 3 || label === 'altro') continue;
    if (s.includes(label) || label.includes(s)) return c.id;
  }
  return null;
}
