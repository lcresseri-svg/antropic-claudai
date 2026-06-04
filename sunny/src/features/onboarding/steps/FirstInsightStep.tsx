interface Props {
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

export function FirstInsightStep({ dataMode, onComplete }: Props) {
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
