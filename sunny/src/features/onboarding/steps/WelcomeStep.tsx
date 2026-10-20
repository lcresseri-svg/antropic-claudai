import { useUiVersion } from '../../../shared/providers/UiVersionProvider';
interface Props {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: Props) {
  const ui3 = useUiVersion() === '3.0';
  return (
    <div className="text-center space-y-10">
      <div className="space-y-4">
        <h1 className="text-[2rem] font-bold text-primary tracking-[-0.04em] leading-tight">
          Capisci i tuoi soldi,<br />senza stress.
        </h1>
        <p className="text-secondary text-base leading-relaxed">
          {ui3 ? 'Scegli da dove partire, controlla i dati e ottieni la prima lettura. Nessun collegamento bancario richiesto.' : 'Sunny ti aiuta a leggere le tue spese, prevedere il mese e costruire abitudini finanziarie più serene.'}
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98]"
        >
          {ui3 ? 'Scegli da dove partire' : 'Inizia'}
        </button>
        <p className="text-xs text-secondary/60">Puoi modificare tutto in seguito.</p>
      </div>
    </div>
  );
}
