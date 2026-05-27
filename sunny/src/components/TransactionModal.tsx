import { useState, useEffect } from 'react';
import { Transaction, TransactionType, TYPE_META, TYPE_ORDER } from '../types';
import { formatCurrency } from '../utils';
import { useSettings } from '../settings';

interface Props {
  open: boolean;
  editing?: Transaction | null;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id'>) => void;
  onDelete?: (id: string) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function TransactionModal({ open, editing, onClose, onSave, onDelete }: Props) {
  const { categories, accounts } = useSettings();
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [yourPart, setYourPart] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type); setDescription(editing.description);
      setAmount(String(editing.amount)); setDate(editing.date);
      setCategory(editing.category); setAccount(editing.account);
      setToAccount(editing.toAccount ?? accounts[1]?.id ?? '');
      setNotes(editing.notes ?? '');
      setIsShared(!!editing.shared);
      setYourPart(editing.shared ? String(editing.amount - editing.shared) : '');
    } else {
      setType('expense'); setDescription(''); setAmount(''); setDate(today());
      setCategory(''); setAccount(accounts[0]?.id ?? '');
      setToAccount(accounts[1]?.id ?? ''); setNotes('');
      setIsShared(false); setYourPart('');
    }
  }, [open, editing]);

  const typeCats = categories.filter(c => c.kind === type);
  useEffect(() => {
    if (type === 'transfer') return;
    if (!typeCats.some(c => c.id === category)) setCategory(typeCats[0]?.id ?? '');
  }, [type, categories]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount.replace(',', '.'));
    if (!value || value <= 0 || !description.trim()) return;
    const mine = parseFloat(yourPart.replace(',', '.'));
    const shared = type === 'expense' && isShared && mine > 0 && mine < value
      ? value - mine
      : undefined;
    onSave({
      type, description: description.trim(), amount: value, date,
      category: type === 'transfer' ? 'trasferimento' : category,
      account,
      toAccount: type === 'transfer' ? toAccount : undefined,
      notes: notes.trim() || undefined,
      shared,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />

      <div className="relative w-full max-w-md bg-elevated rounded-3xl shadow-float max-h-[92vh] overflow-y-auto scrollbar-hide animate-sheet-up">
        <div className="sticky top-0 bg-elevated z-10 px-6 pt-6 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">{editing ? 'Modifica' : 'Nuova transazione'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-secondary">✕</button>
        </div>

        <form onSubmit={submit} className="px-6 pb-6 space-y-5">
          {/* Type segmented */}
          <div className="grid grid-cols-4 gap-1.5 bg-card rounded-2xl p-1.5">
            {TYPE_ORDER.map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className="py-2.5 rounded-xl text-[11px] font-semibold transition-all"
                style={type === t ? { backgroundColor: TYPE_META[t].color, color: '#0D0D0D' } : { color: '#8B8B8B' }}>
                {TYPE_META[t].label}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-1">
              <span className="text-3xl font-semibold text-secondary">€</span>
              <input
                type="text" inputMode="decimal" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                autoFocus={!editing}
                className="bg-transparent text-5xl font-bold text-primary text-center w-44 outline-none balance-num placeholder:text-divider"
              />
            </div>
          </div>

          {/* Description */}
          <Field label="Descrizione">
            <input type="text" placeholder="es. Supermercato" value={description} maxLength={80}
              onChange={e => setDescription(e.target.value)} required
              className="w-full bg-card rounded-2xl px-4 py-3.5 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
          </Field>

          {/* Category */}
          {type !== 'transfer' && (
            <Field label="Categoria">
              <div className="flex flex-wrap gap-2">
                {typeCats.map(c => {
                  const sel = category === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                      className="px-3 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-1.5"
                      style={sel ? { backgroundColor: c.color, color: '#0D0D0D' } : { backgroundColor: '#161616', color: '#8B8B8B' }}>
                      <span>{c.icon}</span>{c.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Shared expense */}
          {type === 'expense' && (
            <div className="bg-card rounded-2xl overflow-hidden">
              <button type="button"
                onClick={() => { setIsShared(s => !s); setYourPart(''); }}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                <div>
                  <p className="text-sm font-medium text-primary">Spesa condivisa</p>
                  <p className="text-xs text-secondary mt-0.5">Hai pagato per altri — conta solo la tua parte</p>
                </div>
                <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isShared ? 'bg-gold' : 'bg-divider'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isShared ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </button>
              {isShared && (() => {
                const total = parseFloat(amount.replace(',', '.')) || 0;
                const mine = parseFloat(yourPart.replace(',', '.')) || 0;
                const others = total > 0 && mine > 0 && mine < total ? total - mine : null;
                return (
                  <div className="border-t border-divider px-4 pb-4 pt-3 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-secondary mb-2 block">La tua parte (€)</label>
                      <input type="text" inputMode="decimal" placeholder="es. 25"
                        value={yourPart}
                        onChange={e => setYourPart(e.target.value.replace(/[^\d.,]/g, ''))}
                        className="w-full bg-elevated rounded-xl px-4 py-3 text-primary placeholder:text-secondary/40 outline-none focus:ring-1 focus:ring-gold/40 text-lg font-semibold balance-num" />
                    </div>
                    {others !== null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-secondary">Parte degli altri (movimento)</span>
                        <span className="font-semibold text-secondary balance-num">{formatCurrency(others)}</span>
                      </div>
                    )}
                    {others !== null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-secondary">Tua spesa effettiva</span>
                        <span className="font-semibold text-primary balance-num">{formatCurrency(mine)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Accounts */}
          <div className={`grid gap-3 ${type === 'transfer' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Field label={type === 'transfer' ? 'Da conto' : 'Conto'}>
              <Select value={account} onChange={setAccount} options={accounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
            </Field>
            {type === 'transfer' && (
              <Field label="A conto">
                <Select value={toAccount} onChange={setToAccount}
                  options={accounts.filter(a => a.id !== account).map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
              </Field>
            )}
          </div>

          {/* Date */}
          <Field label="Data">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full bg-card rounded-2xl px-4 py-3.5 text-primary outline-none focus:ring-1 focus:ring-gold/40" />
          </Field>

          <button type="submit"
            className="w-full py-4 rounded-2xl font-semibold text-bg transition-transform active:scale-[0.98]"
            style={{ backgroundColor: TYPE_META[type].color }}>
            {editing ? 'Salva modifiche' : `Aggiungi ${TYPE_META[type].label.toLowerCase()}`}
          </button>

          {editing && onDelete && (
            <button type="button" onClick={() => { onDelete(editing.id); onClose(); }}
              className="w-full py-3 rounded-2xl font-medium text-[#E08B8B] text-sm">
              Elimina transazione
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-2 px-1">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-card rounded-2xl px-4 py-3.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 appearance-none">
      {options.map(o => <option key={o.value} value={o.value} className="bg-elevated">{o.label}</option>)}
    </select>
  );
}
