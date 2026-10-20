import { useUiVersion } from '../../../shared/providers/UiVersionProvider';
import { Transaction } from '../../../types';
import { buildFirstReading } from '../entryJourney';

interface Props {
  transactions?: Transaction[];
  loading?: boolean;
  error?: string | null;
  onOptionalGoals?: () => void;
  onOptionalSavings?: () => void;
  dataMode: 'manual' | 'csv' | 'demo' | null;
  onComplete: () => void;
}

const DEMO_INSIGHTS = [
  {
    text: <>A questo ritmo chiuderesti il mese con circa <span className="text-gold font-semibold">€ 420</span> di risparmio.</>,
    sub: 'Media ultimi 3 mesi',
  },
  {
    text: <>Hai <span className="text-gold font-semibold">3 abbonamenti ricorrenti</span> per circa <span className="text-gold font-semibold">€ 66,88</span>/mese.</>,
    sub: 'Netflix · Spotify · Palestra',
  },
  {
    text: <>La categoria più alta è <span className="text-gold font-semibold">Casa</span> con €760 questo mese.</>,
    sub: 'Affitto + utenze',
  },
];

const UPCOMING = ['Previsione di fine mese', 'Categorie dove spendi di più', 'Abbonamenti ricorrenti'];

export function FirstInsightStep({ dataMode, onComplete, transactions, loading = false, error, onOptionalGoals, onOptionalSavings }: Props) {
  const ui3 = useUiVersion() === '3.0';
  const reading = buildFirstReading(dataMode, error ? undefined : transactions, loading && !error);
  if (ui3) return <div className="ui31-first-reading space-y-6">
    <div><p className="label-caps text-secondary">La prima lettura</p><h2 className="text-2xl font-bold mt-2">Partiamo da quello che c’è.</h2></div>
    {(dataMode === 'demo' || (reading.kind === 'ready' && reading.demo)) && <p className="ui31-demo-notice">Stai esplorando dati di esempio. Non rappresentano le tue finanze.</p>}
    <div className="ui31-entry-reading" aria-live="polite">
      {reading.kind === 'loading' && <p>Sto caricando i movimenti…</p>}
      {reading.kind === 'unavailable' && <p role={error ? 'alert' : undefined}>{error ? `${error}. La lettura non è disponibile; puoi riprovare da Oggi.` : 'La lettura dei movimenti non è ancora disponibile. Li ritrovi in Oggi appena caricati.'}</p>}
      {reading.kind === 'empty' && <><h3>Nessun movimento da leggere, per ora.</h3><p>Aggiungi il primo movimento in Sunny. Un saldo assente non viene interpretato come zero.</p></>}
      {reading.kind === 'ready' && <><h3>{reading.recorded} {reading.recorded === 1 ? 'movimento registrato' : 'movimenti registrati'}</h3><p>{reading.scheduled} {reading.scheduled === 1 ? 'movimento programmato, distinto' : 'movimenti programmati, distinti'} da quelli già registrati.</p><p>Apri Oggi per leggere il mese, oppure Movimenti per controllare i dati.</p></>}
    </div>
    <p className="text-sm text-secondary">Piano, limiti e obiettivi sono facoltativi. Puoi usare Sunny anche senza configurarli.</p>
    <button type="button" onClick={onComplete} className="w-full cta-gold-fill py-4 rounded-2xl font-semibold">Apri Oggi</button>
    <div className="ui31-entry-optional">
      {onOptionalGoals && <button type="button" onClick={onOptionalGoals}>Scegli preferenze <span>Facoltativo</span></button>}
      {onOptionalSavings && <button type="button" onClick={onOptionalSavings}>Imposta un obiettivo di risparmio <span>Facoltativo</span></button>}
    </div>
  </div>;
  const hasData = dataMode === 'demo';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">
          {hasData ? 'Ho trovato il tuo primo insight.' : 'Sunny è pronto.'}
        </h2>
      </div>

      {hasData ? (
        <div className="space-y-2">
          {DEMO_INSIGHTS.map((ins, i) => (
            <div key={i} className="p-4 rounded-2xl bg-card border border-divider space-y-1">
              <p className="text-sm text-primary leading-relaxed">{ins.text}</p>
              <p className="text-xs text-secondary">{ins.sub}</p>
            </div>
          ))}
          <p className="text-xs text-secondary/50 text-center pt-1">
            Dati demo — sostituiscili con i tuoi quando vuoi dalle Impostazioni
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-secondary leading-relaxed">
            Aggiungi la prima transazione e inizierò a mostrarti previsioni e consigli personalizzati.
          </p>
          <div className="p-4 rounded-2xl bg-card border border-divider space-y-2">
            <p className="text-xs text-secondary">Con qualche settimana di dati vedrai:</p>
            <ul className="space-y-1.5">
              {UPCOMING.map(item => (
                <li key={item} className="flex items-center gap-2 text-xs text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgb(var(--c-gold) / 0.6)' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98]"
      >
        Vai alla dashboard
      </button>
    </div>
  );
}
