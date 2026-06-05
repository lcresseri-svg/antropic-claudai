interface Props {
  dataMode: 'manual' | 'csv' | 'demo' | null;
  onComplete: () => void;
}

const DEMO_INSIGHTS = [
  {
    text: <>A questo ritmo chiuderesti il mese con circa <span className="text-gold font-semibold">€ 420</span> di risparmio.</>,
    sub: 'Previsione di fine mese',
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

export function FirstInsightStep({ dataMode, onComplete }: Props) {
  const isDemo = dataMode === 'demo';
  const hasRealData = dataMode === 'csv';
  const noData = !isDemo && !hasRealData;

  if (isDemo) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">Sunny è pronto 🎉</h2>
          <span className="inline-block px-2.5 py-1 rounded-full bg-gold/15 text-gold text-[11px] font-semibold">
            Stai usando dati demo
          </span>
        </div>

        <div className="space-y-2">
          {DEMO_INSIGHTS.map((ins, i) => (
            <div key={i} className="p-4 rounded-2xl bg-card border border-divider space-y-1">
              <p className="text-sm text-primary leading-relaxed">{ins.text}</p>
              <p className="text-xs text-secondary">{ins.sub}</p>
            </div>
          ))}
          <p className="text-xs text-secondary/50 text-center pt-1">
            Sostituisci i dati demo con i tuoi quando vuoi da Impostazioni → Dati
          </p>
        </div>

        <button
          onClick={onComplete}
          className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98]"
        >
          Vai a Oggi
        </button>
      </div>
    );
  }

  if (hasRealData) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">Sunny è pronto.</h2>
          <p className="text-sm text-secondary leading-relaxed">
            Le tue transazioni sono state importate. Nelle prossime ore Sunny analizzerà i tuoi dati e mostrerà previsioni e consigli personalizzati.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-divider flex items-center gap-3.5">
          <span className="text-2xl flex-shrink-0">🔮</span>
          <div>
            <p className="text-sm font-medium text-primary">Previsione di fine mese</p>
            <p className="text-xs text-secondary mt-0.5">Disponibile dopo l'analisi delle prime settimane</p>
          </div>
        </div>

        <button
          onClick={onComplete}
          className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98]"
        >
          Vai a Oggi
        </button>
      </div>
    );
  }

  // noData state
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">Sunny è pronto.</h2>
        <p className="text-sm text-secondary leading-relaxed">
          Aggiungi la prima transazione e inizierò a mostrarti previsioni e consigli personalizzati.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-card border border-divider space-y-2">
        <p className="text-xs text-secondary">Con qualche settimana di dati vedrai:</p>
        <ul className="space-y-1.5">
          {['Previsione di fine mese', 'Categorie dove spendi di più', 'Abbonamenti ricorrenti'].map(item => (
            <li key={item} className="flex items-center gap-2 text-xs text-secondary">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgb(var(--c-gold) / 0.6)' }} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Primary CTA goes to app where [+ Spesa] is the first action on Dashboard */}
      <button
        onClick={onComplete}
        className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98]"
      >
        Aggiungi prima spesa
      </button>
      <button
        onClick={onComplete}
        className="w-full py-2.5 rounded-2xl text-sm font-medium text-secondary bg-elevated active:bg-card-hover transition-colors"
      >
        Vai a Oggi
      </button>
    </div>
  );
}
