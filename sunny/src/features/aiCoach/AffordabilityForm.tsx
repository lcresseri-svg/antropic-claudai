import { useState } from 'react';
import { AffordabilityRequest } from './aiCoachTypes';

interface Props {
  onSubmit: (req: AffordabilityRequest) => void;
  loading: boolean;
}

export function AffordabilityForm({ onSubmit, loading }: Props) {
  const [itemName, setItemName] = useState('');
  const [cost, setCost] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = parseFloat(cost.replace(',', '.'));
    if (!itemName.trim() || isNaN(c) || c <= 0) return;
    onSubmit({
      itemName: itemName.trim(),
      cost: c,
      targetDate: targetDate || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-secondary mb-1.5 font-medium">Cosa vuoi acquistare?</label>
        <input
          type="text"
          value={itemName}
          onChange={e => setItemName(e.target.value)}
          placeholder="es. MacBook Pro, vacanza in Giappone, automobile…"
          className="w-full bg-card border border-divider rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-gold/40 transition-colors"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-xs text-secondary mb-1.5 font-medium">Costo totale (€)</label>
        <input
          type="number"
          value={cost}
          onChange={e => setCost(e.target.value)}
          placeholder="1200"
          min="1"
          step="any"
          className="w-full bg-card border border-divider rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-secondary/50 focus:outline-none focus:border-gold/40 transition-colors"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-xs text-secondary mb-1.5 font-medium">Entro quando? <span className="opacity-60">(opzionale)</span></label>
        <input
          type="date"
          value={targetDate}
          onChange={e => setTargetDate(e.target.value)}
          min={today}
          className="w-full bg-card border border-divider rounded-xl px-3.5 py-2.5 text-sm text-primary focus:outline-none focus:border-gold/40 transition-colors"
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !itemName.trim() || !cost}
        className="w-full py-3 rounded-xl glass-cta-gold text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {loading ? 'Analisi in corso…' : 'Analizza'}
      </button>
    </form>
  );
}
