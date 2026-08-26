// "Stai programmando una spesa?" — l'ingresso all'AI Coach dal Piano.
//
// Prima l'unico accesso era un bottone flottante sopra ogni schermata: sempre
// lì, mai al momento giusto, e nel mezzo di quello che si stava guardando.
// Qui invece è nel Piano — l'unica schermata dove si sta già ragionando su
// quanto si può spendere.
//
// La card non chiede niente: i due campi che c'erano duplicavano il form
// dell'AI Coach, quindi si compilava qui per ritrovarsi la stessa domanda di
// là. Una riga sola che apre la schermata, e la domanda si fa una volta.
import { useNavigate } from 'react-router-dom';

export function CoachEntryCard() {
  const navigate = useNavigate();

  return (
    <section className="accent-card rounded-[20px] shadow-elev-1 overflow-hidden">
      <button type="button" onClick={() => navigate('/ai-coach')}
        aria-label="Apri l'AI Coach"
        className="row-tap w-full text-left p-[18px] flex items-center gap-3.5 transition-colors">
        <span className="w-[38px] h-[38px] rounded-[13px] bg-gold/[0.14] flex items-center justify-center text-[15px] flex-none">✦</span>
        <span className="flex-1 min-w-0">
          <span className="block label-caps text-gold mb-1">Chiedi a Sunny</span>
          <span className="block text-[15px] font-medium text-primary leading-[1.35]">
            Stai programmando una spesa?
          </span>
          <span className="block text-[12.5px] text-secondary leading-relaxed mt-1">
            Ti dico se i tuoi numeri la reggono, in quanti mesi ci arrivi e dove puoi
            liberare margine davvero.
          </span>
        </span>
        <span className="text-[15px] text-gold flex-none" aria-hidden>›</span>
      </button>
    </section>
  );
}
