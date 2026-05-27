import { useState, useEffect } from 'react';
import { Transaction, Category, TransactionType, CATEGORY_META, EXPENSE_CATEGORIES, ALL_CATEGORIES } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (tx: Omit<Transaction, 'id'>) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AddTransactionModal({ open, onClose, onAdd }: Props) {
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<Category>('spesa');

  useEffect(() => {
    if (open) {
      setType('expense');
      setDescription('');
      setAmount('');
      setDate(today());
      setCategory('spesa');
    }
  }, [open]);

  // Auto-switch category when type changes
  useEffect(() => {
    if (type === 'income') setCategory('stipendio');
    else setCategory('spesa');
  }, [type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!parsed || parsed <= 0 || !description.trim()) return;
    onAdd({ type, description: description.trim(), amount: parsed, date, category });
    onClose();
  };

  const availableCategories = type === 'income'
    ? ALL_CATEGORIES
    : EXPENSE_CATEGORIES;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-cream rounded-2xl shadow-2xl overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-dark/20" />
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-dark">Nuova transazione</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-dark/50 transition-colors"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type toggle */}
            <div className="flex gap-2 bg-black/5 rounded-xl p-1">
              {(['expense', 'income'] as TransactionType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    type === t
                      ? t === 'income'
                        ? 'bg-sage text-white shadow-sm'
                        : 'bg-dark text-cream shadow-sm'
                      : 'text-dark/50 hover:text-dark/80'
                  }`}
                >
                  {t === 'income' ? '↑ Entrata' : '↓ Uscita'}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-dark/50 mb-1.5">
                Importo (€)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="w-full bg-white rounded-xl px-4 py-3 text-dark text-lg font-semibold placeholder:text-dark/25 border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-dark/50 mb-1.5">
                Descrizione
              </label>
              <input
                type="text"
                placeholder="es. Supermercato, Affitto..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                maxLength={80}
                className="w-full bg-white rounded-xl px-4 py-3 text-dark placeholder:text-dark/25 border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-dark/50 mb-1.5">
                Categoria
              </label>
              <div className="flex flex-wrap gap-2">
                {availableCategories.map(cat => {
                  const meta = CATEGORY_META[cat];
                  const selected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                        selected ? 'text-white border-transparent' : 'bg-white text-dark/60 border-black/5 hover:border-black/10'
                      }`}
                      style={selected ? { backgroundColor: meta.color, borderColor: meta.color } : {}}
                    >
                      {meta.icon} {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-dark/50 mb-1.5">
                Data
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full bg-white rounded-xl px-4 py-3 text-dark border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all mt-2"
              style={{
                backgroundColor: type === 'income' ? '#8A9270' : '#1C1C1E',
                color: '#F8F7F4',
              }}
            >
              {type === 'income' ? 'Aggiungi entrata' : 'Aggiungi uscita'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
