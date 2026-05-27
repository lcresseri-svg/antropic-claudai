import { useState, useEffect } from 'react';
import {
  Transaction, TransactionType, Category, Account, PaymentMethod,
  TYPE_META, CATEGORIES_BY_TYPE, CATEGORY_META,
  ACCOUNT_META, ALL_ACCOUNTS, PAYMENT_META, ALL_PAYMENTS,
} from '../types';

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
  const [account, setAccount] = useState<Account>('conto_corrente');
  const [toAccount, setToAccount] = useState<Account>('conto_risparmio');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('carta_debito');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setType('expense'); setDescription(''); setAmount('');
      setDate(today()); setCategory('spesa');
      setAccount('conto_corrente'); setToAccount('conto_risparmio');
      setPaymentMethod('carta_debito'); setNotes('');
    }
  }, [open]);

  useEffect(() => {
    const cats = CATEGORIES_BY_TYPE[type];
    if (!cats.includes(category)) setCategory(cats[0]);
    if (type === 'investment') setAccount('conto_investimenti');
    else if (type !== 'transfer') setAccount('conto_corrente');
  }, [type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!parsed || parsed <= 0 || !description.trim()) return;

    const tx: Omit<Transaction, 'id'> = {
      type, description: description.trim(),
      amount: parsed, date, category, account,
      paymentMethod: type !== 'transfer' ? paymentMethod : undefined,
      toAccount: type === 'transfer' ? toAccount : undefined,
      notes: notes.trim() || undefined,
    };
    onAdd(tx);
    onClose();
  };

  if (!open) return null;

  const cats = CATEGORIES_BY_TYPE[type];
  const typeKeys = Object.keys(TYPE_META) as TransactionType[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-cream rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1 sm:hidden sticky top-0 bg-cream z-10">
          <div className="w-10 h-1 rounded-full bg-dark/20" />
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-dark">Nuova transazione</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-dark/50"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {typeKeys.map(t => {
                const meta = TYPE_META[t];
                const active = type === t;
                return (
                  <button
                    key={t} type="button" onClick={() => setType(t)}
                    className={`py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                      active ? 'text-white border-transparent shadow-sm' : 'bg-white text-dark/50 border-black/5 hover:border-black/15'
                    }`}
                    style={active ? { backgroundColor: meta.color } : {}}
                  >
                    <span className="block text-base mb-0.5">{meta.icon}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-dark/50 mb-1.5">Importo (€)</label>
              <input
                type="number" inputMode="decimal" step="0.01" min="0.01"
                placeholder="0,00" value={amount}
                onChange={e => setAmount(e.target.value)} required
                className="w-full bg-white rounded-xl px-4 py-3 text-dark text-xl font-bold placeholder:text-dark/20 border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-dark/50 mb-1.5">Descrizione</label>
              <input
                type="text" placeholder="es. Supermercato, Affitto..."
                value={description} onChange={e => setDescription(e.target.value)}
                required maxLength={80}
                className="w-full bg-white rounded-xl px-4 py-3 text-dark placeholder:text-dark/25 border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>

            {/* Category */}
            {type !== 'transfer' && (
              <div>
                <label className="block text-xs font-medium text-dark/50 mb-1.5">Categoria</label>
                <div className="flex flex-wrap gap-2">
                  {cats.map(cat => {
                    const meta = CATEGORY_META[cat];
                    const sel = category === cat;
                    return (
                      <button
                        key={cat} type="button" onClick={() => setCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                          sel ? 'text-white border-transparent' : 'bg-white text-dark/60 border-black/5 hover:border-black/15'
                        }`}
                        style={sel ? { backgroundColor: meta.color } : {}}
                      >
                        {meta.icon} {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Account / ToAccount */}
            <div className={`grid gap-3 ${type === 'transfer' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="block text-xs font-medium text-dark/50 mb-1.5">
                  {type === 'transfer' ? 'Da conto' : 'Conto'}
                </label>
                <select
                  value={account} onChange={e => setAccount(e.target.value as Account)}
                  className="w-full bg-white rounded-xl px-3 py-3 text-sm text-dark border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/40"
                >
                  {ALL_ACCOUNTS.map(a => (
                    <option key={a} value={a}>{ACCOUNT_META[a].icon} {ACCOUNT_META[a].label}</option>
                  ))}
                </select>
              </div>
              {type === 'transfer' && (
                <div>
                  <label className="block text-xs font-medium text-dark/50 mb-1.5">A conto</label>
                  <select
                    value={toAccount} onChange={e => setToAccount(e.target.value as Account)}
                    className="w-full bg-white rounded-xl px-3 py-3 text-sm text-dark border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/40"
                  >
                    {ALL_ACCOUNTS.filter(a => a !== account).map(a => (
                      <option key={a} value={a}>{ACCOUNT_META[a].icon} {ACCOUNT_META[a].label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Payment method */}
            {type !== 'transfer' && (
              <div>
                <label className="block text-xs font-medium text-dark/50 mb-1.5">Metodo di pagamento</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PAYMENTS.map(p => {
                    const meta = PAYMENT_META[p];
                    const sel = paymentMethod === p;
                    return (
                      <button
                        key={p} type="button" onClick={() => setPaymentMethod(p)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                          sel
                            ? 'bg-dark text-cream border-transparent'
                            : 'bg-white text-dark/60 border-black/5 hover:border-black/15'
                        }`}
                      >
                        {meta.icon} {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date + Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-dark/50 mb-1.5">Data</label>
                <input
                  type="date" value={date} onChange={e => setDate(e.target.value)} required
                  className="w-full bg-white rounded-xl px-3 py-3 text-sm text-dark border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark/50 mb-1.5">Note (opz.)</label>
                <input
                  type="text" placeholder="..."
                  value={notes} onChange={e => setNotes(e.target.value)} maxLength={120}
                  className="w-full bg-white rounded-xl px-3 py-3 text-sm text-dark placeholder:text-dark/25 border border-black/5 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all mt-1 text-white"
              style={{ backgroundColor: TYPE_META[type].color }}
            >
              Aggiungi {TYPE_META[type].label.toLowerCase()}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
