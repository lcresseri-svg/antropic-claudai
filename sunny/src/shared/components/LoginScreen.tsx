// Primo avvio.
//
// Le rassicurazioni stanno SOPRA il CTA, non sotto: erano una microscritta in
// fondo alla schermata, cioè dopo la decisione. Dicono le stesse cose, ma nel
// momento in cui servono — prima di premere "Continua con Google".
//
// Il marchio ha perso il glow: il filtro gaussiano sporcava il bordo dell'arco
// sui display non-retina, e non aggiungeva niente.
interface Props {
  onSignIn: () => void;
  error: string | null;
}

const PROMISES = [
  'Nessun collegamento bancario richiesto',
  'Dati sincronizzati e protetti',
  'Puoi partire da dati demo',
];

export function LoginScreen({ onSignIn, error }: Props) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-8 animate-fade-in">
      <div className="w-full max-w-[420px] flex-1 flex flex-col items-center justify-center text-center">
        <ArcMark />
        <h1 className="font-serif text-[42px] md:text-[46px] text-primary mt-8 leading-none">Sunny</h1>
        <p className="text-secondary mt-3.5 text-[15.5px] max-w-[250px] leading-relaxed">
          Finanza personale, senza compromessi.
        </p>
      </div>

      <div className="w-full max-w-[360px] pb-14 space-y-4">
        <ul className="space-y-2">
          {PROMISES.map(t => (
            <li key={t} className="flex items-center gap-2.5 text-[12.5px] text-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--c-gold))"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {t}
            </li>
          ))}
        </ul>

        <button onClick={onSignIn}
          className="w-full bg-primary text-bg py-4 rounded-[18px] font-semibold flex items-center justify-center gap-3
                     transition-all active:scale-[0.98] active:opacity-90"
          style={{ boxShadow: '0 12px 28px -14px rgba(26,23,20,.7)' }}>
          <GoogleIcon />
          Continua con Google
        </button>

        {error && <p className="text-xs text-red text-center leading-relaxed">{error}</p>}

        <p className="text-center text-[11.5px] text-tertiary leading-relaxed">
          Serve solo per sincronizzare i tuoi dati fra i dispositivi.
        </p>
      </div>
    </div>
  );
}

function ArcMark() {
  // Arco a 270°, apertura in basso — r=28, circ≈175.93 | 270°=131.95 | 90°=43.98
  return (
    <svg width="132" height="132" viewBox="0 0 80 80" fill="none" aria-hidden className="animate-scale-in md:w-40 md:h-40">
      <defs>
        <linearGradient id="amg" x1="40" y1="10" x2="40" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E5B647" />
          <stop offset="100%" stopColor="#9A6A12" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="28"
        stroke="url(#amg)" strokeWidth="10.5" strokeLinecap="round"
        strokeDasharray="131.95 43.98"
        transform="rotate(135 40 40)"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
