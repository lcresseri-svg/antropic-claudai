interface Props {
  onActivate: () => void;
}

/**
 * Shown in place of the BudgetScreen when the budget feature is turned off in
 * settings. The tab stays reachable on purpose: it explains what the budget
 * does and offers a one-tap shortcut to re-enable it in General settings.
 */
export function BudgetDisabled({ onActivate }: Props) {
  return (
    <div className="pb-32 space-y-6">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Budget</h1>

      <div className="bg-card rounded-2xl p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl mb-4"
          style={{ backgroundColor: 'rgba(230,185,92,0.12)' }}>
          🎯
        </div>
        <p className="text-base font-semibold text-primary mb-2">La gestione del budget è disattivata</p>
        <p className="text-[13px] text-secondary leading-relaxed max-w-sm mx-auto">
          Con il budget attivo puoi fissare un obiettivo di risparmio, impostare limiti di
          spesa per categoria e confrontarli con quanto spendi davvero ogni mese. Sunny ti
          mostra previsioni di fine mese e suggerimenti basati sulle tue abitudini.
        </p>
      </div>

      <div className="bg-card rounded-2xl divide-y divide-divider">
        <Feature icon="🎯" title="Obiettivo di risparmio" sub="Decidi quanto mettere da parte e segui i progressi" />
        <Feature icon="📊" title="Limiti per categoria" sub="Tieni sotto controllo le spese che contano di più" />
        <Feature icon="🔮" title="Previsione di fine mese" sub="Stima entrate, uscite e risparmio dei prossimi giorni" />
      </div>

      <button onClick={onActivate}
        className="w-full py-3.5 rounded-2xl font-semibold bg-gold text-bg active:scale-[0.98] transition-transform">
        Attiva la gestione del budget
      </button>
      <p className="text-[12px] text-secondary text-center -mt-3">
        Si attiva da Impostazioni → Generali
      </p>
    </div>
  );
}

function Feature({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5 p-4">
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: 'rgba(136,176,192,0.14)' }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{title}</p>
        <p className="text-xs text-secondary mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
