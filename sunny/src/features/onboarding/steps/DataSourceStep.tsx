// Dati iniziali.
//
// L'ordine è invertito rispetto a prima: i dati demo vengono per PRIMI. Sono
// l'unica opzione che mostra l'app funzionante in venti secondi, e metterli in
// fondo dopo due opzioni che chiedono lavoro significava non farli scegliere
// mai. Ogni card dice quanto costa in tempo e cosa si ottiene — non solo cosa
// è.
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
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-[25px] font-bold text-primary tracking-[-0.03em] leading-tight"
          style={{ textWrap: 'pretty' } as React.CSSProperties}>
          Da cosa partiamo?
        </h2>
        <p className="text-[13.5px] text-secondary leading-[1.55]">
          Sunny ha bisogno di qualche movimento per dire qualcosa di sensato.
        </p>
      </div>

      <div className="space-y-2.5">
        <Card icon="✨" tint="#E6B95C" title="Guarda com'è con dati veri" time="~20 sec"
          recommended highlighted disabled={loading} onClick={handleDemo}
          detail={loading
            ? 'Creazione dati in corso…'
            : 'Tre mesi di movimenti realistici: vedi subito previsione, categorie e abbonamenti. Si cancellano con un tocco dalle Impostazioni.'} />

        <Card icon="📄" tint="#88B0C0" title="Importa un file" time="~1 min"
          dimmed={loading} disabled={loading} onClick={() => onNext('csv')}
          detail="Estratto conto in Excel o CSV. Sunny riconosce data, importo e descrizione e prova a indovinare le categorie." />

        <Card icon="✏️" tint="#8A9270" title="Inserisco a mano" time="~30 sec"
          dimmed={loading} disabled={loading} onClick={() => onNext('manual')}
          detail="Parti dalla prima spesa. Le altre si aggiungono man mano, anche dallo shortcut su iPhone." />
      </div>

      <p className="text-[11.5px] text-tertiary text-center leading-relaxed">
        Niente di questo è definitivo: i dati demo restano riconoscibili e rimovibili.
      </p>
    </div>
  );
}

function Card({ icon, tint, title, time, detail, recommended, highlighted, dimmed, disabled, onClick }: {
  icon: string; tint: string; title: string; time: string; detail: string;
  recommended?: boolean; highlighted?: boolean; dimmed?: boolean; disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`w-full p-4 rounded-[20px] text-left transition-colors ${
        highlighted ? 'accent-card' : 'glass-card hover:bg-card-hover'} ${dimmed ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-[11px] flex items-center justify-center text-base flex-none"
          style={{ background: `${tint}29` }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-primary">{title}</span>
            {recommended && (
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] rounded-full px-1.5 py-0.5 flex-none"
                style={{ background: 'rgb(var(--c-gold))', color: 'var(--accent-on)' }}>
                Consigliato
              </span>
            )}
            <span className="ml-auto text-[11.5px] text-tertiary flex-none">{time}</span>
          </div>
          <p className="text-[12.5px] text-secondary leading-[1.55] mt-1">{detail}</p>
        </div>
      </div>
    </button>
  );
}
