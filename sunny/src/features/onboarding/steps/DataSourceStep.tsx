import { ConfirmationDialog } from '../../../shared/components/DiscardConfirmation';
// Dati iniziali.
//
// L'ordine è invertito rispetto a prima: i dati demo vengono per PRIMI. Sono
// l'unica opzione che mostra l'app funzionante in venti secondi, e metterli in
// fondo dopo due opzioni che chiedono lavoro significava non farli scegliere
// mai. Ogni card dice quanto costa in tempo e cosa si ottiene — non solo cosa
// è.
import { useState } from 'react';
import { useUiVersion } from '../../../shared/providers/UiVersionProvider';
import { SystemIcon } from '../../../shared/components/SystemIcon';
import { writeDemoData } from '../demoData';

interface Props {
  deferDemo?: boolean;
  uid: string;
  accountId: string;
  existingDemoIds?: string[];
  onNext: (mode: 'manual' | 'csv' | 'demo', demoIds?: string[]) => void;
}

export function DataSourceStep({ uid, accountId, onNext, existingDemoIds, deferDemo }: Props) {
  const ui3 = useUiVersion() === '3.0';
  const [demoIds,setDemoIds]=useState<string[]|undefined>(existingDemoIds);
  const [confirmDemo,setConfirmDemo]=useState(false);
  const [error,setError]=useState('');
  const [loading, setLoading] = useState(false);

  const handleDemo = async () => {
    if (loading) return;
    setLoading(true);setError('');
    try {
      const ids = await writeDemoData(uid, accountId);
      setDemoIds(ids);setLoading(false);setConfirmDemo(false);onNext('demo', ids);
    } catch (err) {
      setError('Impossibile aggiungere i dati di esempio. Riprova.');
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

      {ui3 ? <div className="ui31-source-options">
        <Card icon="📝" tint="#8A9270" title="Inserisco a mano" time="" onClick={() => onNext('manual')}
          detail="Scegli un conto, poi aggiungi il primo movimento. Puoi rimandare il saldo se non lo conosci." />
        <Card icon="💾" tint="#88B0C0" title="Importa un file" time="" onClick={() => onNext('csv')}
          detail="CSV o Excel: controlla colonne, anteprima e conti prima di confermare l’importazione." />
        <Card icon="✨" tint="#B5A8C8" title="Esplora con dati di esempio" time="" onClick={() => deferDemo ? onNext('demo') : demoIds ? onNext('demo', demoIds) : setConfirmDemo(true)} disabled={loading}
          detail="Aggiunge movimenti dimostrativi riconoscibili al tuo account, dopo una conferma. Non descrivono le tue finanze e si possono rimuovere." />
      </div> : <div className="space-y-2.5">
        <Card icon="✨" tint="#E6B95C" title="Esplora con dati di esempio" time="~20 sec"
          recommended highlighted disabled={loading} onClick={()=>demoIds?onNext('demo',demoIds):setConfirmDemo(true)}
          detail={loading
            ? 'Creazione dati in corso…'
            : 'Tre mesi di movimenti realistici: vedi subito previsione, categorie e abbonamenti. Si cancellano con un tocco dalle Impostazioni.'} />

        <Card icon="📄" tint="#88B0C0" title="Importa un file" time="~1 min"
          dimmed={loading} disabled={loading} onClick={() => onNext('csv')}
          detail="Estratto conto in Excel o CSV. Sunny riconosce data, importo e descrizione e prova a indovinare le categorie." />

        <Card icon="✏️" tint="#8A9270" title="Inserisco a mano" time="~30 sec"
          dimmed={loading} disabled={loading} onClick={() => onNext('manual')}
          detail="Parti dalla prima spesa. Le altre si aggiungono man mano, anche dallo shortcut su iPhone." />
      </div>}

      {error&&<p role="alert" className="text-red">{error}</p>}
      {confirmDemo&&<ConfirmationDialog title="Aggiungere dati di esempio?" description={error||"Sunny aggiungerà movimenti dimostrativi al tuo account. Restano riconoscibili e rimovibili dalle Impostazioni."} confirmLabel="Aggiungi dati di esempio" onCancel={()=>setConfirmDemo(false)} onConfirm={()=>void handleDemo()} busy={loading}/>}
      <p className="text-[11.5px] text-tertiary text-center leading-relaxed">
        Niente di questo è definitivo: i dati di esempio restano riconoscibili e rimovibili.
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
          style={{ background: `${tint}29` }}><SystemIcon icon={icon} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
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
