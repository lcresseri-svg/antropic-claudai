import { useState } from 'react';
import { useSettings } from '../../../shared/providers/settings';
import { AccountDef } from '../../../types';

interface Props {
  onNext: (accountId: string) => void;
}

const ACCOUNT_TYPES: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'checking',   label: 'Conto corrente',      icon: '🏦', color: '#6FA8DC' },
  { value: 'card',       label: 'Carta',               icon: '💳', color: '#B5A8C8' },
  { value: 'cash',       label: 'Contanti',            icon: '💵', color: '#E6B95C' },
  { value: 'investment', label: 'Conto investimenti',  icon: '📊', color: '#D4956A' },
];

export function AccountStep({ onNext }: Props) {
  const { accounts, saveAccounts } = useSettings();
  const [name, setName] = useState('Conto principale');
  const [type, setType] = useState('checking');
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);

    const typeInfo = ACCOUNT_TYPES.find(t => t.value === type)!;
    const id = `onb_${Date.now()}`;
    const newAcc: AccountDef = {
      id,
      label: trimmed,
      icon: typeInfo.icon,
      color: typeInfo.color,
      isInvestment: type === 'investment',
      ...(balance ? { initialBalance: parseFloat(balance.replace(',', '.')) || 0 } : {}),
    };

    saveAccounts([...accounts, newAcc]);
    onNext(id);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">Aggiungi il tuo primo conto</h2>
        <p className="text-sm text-secondary">Ti serve solo un nome. Potrai modificarlo quando vuoi.</p>
      </div>

      <div className="space-y-3">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">Nome conto</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Es. Conto principale"
            className="w-full px-4 py-3 rounded-2xl bg-card border border-divider text-primary text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {ACCOUNT_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`p-3 rounded-2xl border flex items-center gap-2 transition-all text-left ${
                  type === t.value
                    ? 'border-gold/50 bg-gold/8'
                    : 'border-divider bg-card hover:bg-card-hover'
                }`}
              >
                <span>{t.icon}</span>
                <span className={`text-xs font-medium ${type === t.value ? 'text-primary' : 'text-secondary'}`}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Balance (optional) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">
            Saldo attuale <span className="normal-case">(opzionale)</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            placeholder="Es. 1250"
            className="w-full px-4 py-3 rounded-2xl bg-card border border-divider text-primary text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={!name.trim() || saving}
        className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? 'Salvataggio…' : 'Crea conto'}
      </button>
    </div>
  );
}
