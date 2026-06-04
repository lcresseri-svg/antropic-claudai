import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

interface Props {
  uid: string;
  onNext: (target: number | null) => void;
}

const PRESETS = [100, 300, 500];

export function SavingsTargetStep({ uid, onNext }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveTarget = isCustom
    ? (custom ? parseFloat(custom.replace(',', '.')) || null : null)
    : selected;

  const handleContinue = async () => {
    if (saving) return;
    if (effectiveTarget !== null && effectiveTarget > 0) {
      setSaving(true);
      await setDoc(
        doc(db, 'users', uid, 'meta', 'budget'),
        { savingsTarget: effectiveTarget },
        { merge: true },
      );
      setSaving(false);
    }
    onNext(effectiveTarget);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">
          Quanto vuoi risparmiare questo mese?
        </h2>
        <p className="text-sm text-secondary">
          Non è vincolante. Puoi cambiarlo quando vuoi dal Budget.
        </p>
      </div>

      <div className="space-y-2">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => { setSelected(p); setIsCustom(false); }}
            className={`w-full py-3.5 px-4 rounded-2xl border text-left font-semibold text-sm transition-all ${
              selected === p && !isCustom
                ? 'border-gold/50 bg-gold/8 text-primary'
                : 'border-divider bg-card text-secondary hover:bg-card-hover'
            }`}
          >
            {p} €
          </button>
        ))}

        <button
          onClick={() => { setIsCustom(true); setSelected(null); }}
          className={`w-full py-3.5 px-4 rounded-2xl border text-left transition-all ${
            isCustom
              ? 'border-gold/50 bg-gold/8'
              : 'border-divider bg-card text-secondary hover:bg-card-hover'
          }`}
        >
          {isCustom ? (
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="Importo personalizzato"
              className="bg-transparent w-full text-primary text-sm focus:outline-none"
            />
          ) : (
            <span className="text-sm font-semibold">Personalizzato</span>
          )}
        </button>

        <button
          onClick={() => onNext(null)}
          className="w-full py-2.5 px-4 text-sm text-secondary hover:text-primary transition-colors"
        >
          Decido dopo
        </button>
      </div>

      {(effectiveTarget !== null && effectiveTarget > 0) && (
        <button
          onClick={handleContinue}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Salvataggio…' : 'Continua'}
        </button>
      )}
    </div>
  );
}
