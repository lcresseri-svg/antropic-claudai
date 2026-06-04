import { useState } from 'react';
import { writeDemoData } from '../demoData';

interface Props {
  uid: string;
  accountId: string;
  onNext: (mode: 'manual' | 'csv' | 'demo', demoIds?: string[]) => void;
}

export function DataSourceStep({ uid, accountId, onNext }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDemo = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const ids = await writeDemoData(uid, accountId);
      onNext('demo', ids);
    } catch (err) {
      console.error('demo data error', err);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">Aggiungi qualche dato per iniziare</h2>
        <p className="text-sm text-secondary">Sunny funziona meglio quando può leggere le tue abitudini.</p>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onNext('manual')}
          className="w-full p-4 rounded-2xl border border-divider bg-card text-left hover:bg-card-hover transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">✏️</span>
            <div>
              <div className="text-sm font-medium text-primary">Aggiungi una transazione manuale</div>
              <div className="text-xs text-secondary mt-0.5">Inserisci la prima spesa o entrata</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => onNext('csv')}
          className="w-full p-4 rounded-2xl border border-divider bg-card text-left hover:bg-card-hover transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">📄</span>
            <div>
              <div className="text-sm font-medium text-primary">Importa CSV</div>
              <div className="text-xs text-secondary mt-0.5">Carica le transazioni da un file</div>
            </div>
          </div>
        </button>

        <button
          onClick={handleDemo}
          disabled={loading}
          className="w-full p-4 rounded-2xl border border-gold/30 bg-gold/5 text-left hover:border-gold/50 hover:bg-gold/8 transition-colors disabled:opacity-60"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">✨</span>
            <div>
              <div className="text-sm font-medium text-primary">Usa dati demo</div>
              <div className="text-xs text-secondary mt-0.5">
                {loading
                  ? 'Creazione dati in corso…'
                  : 'Vedi Sunny con dati realistici, rimovibili quando vuoi'}
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
