interface Props {
  onSignIn: () => void;
  error: string | null;
}

export function LoginScreen({ onSignIn, error }: Props) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-8 animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <SunMark />
        <h1 className="text-5xl font-bold text-primary tracking-tight mt-8">Sunny</h1>
        <p className="text-secondary mt-3 text-base max-w-[16rem] leading-relaxed">
          La tua finanza personale, semplice e chiara.
        </p>
      </div>

      <div className="w-full max-w-xs pb-12 space-y-4">
        <button onClick={onSignIn}
          className="w-full bg-primary text-bg py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-transform active:scale-[0.98]">
          <GoogleIcon /> Continua con Google
        </button>
        {error && <p className="text-xs text-[#E08B8B] text-center">{error}</p>}
        <p className="text-[11px] text-secondary/60 text-center leading-relaxed">
          I tuoi dati sono sincronizzati e salvati in modo sicuro
        </p>
      </div>
    </div>
  );
}

function SunMark() {
  return (
    <svg width="80" height="80" viewBox="0 0 200 200" className="animate-scale-in">
      <circle cx="100" cy="100" r="34" fill="#E6B95C" />
      <g stroke="#E6B95C" strokeWidth="9" strokeLinecap="round">
        <line x1="100" y1="34" x2="100" y2="50" />
        <line x1="100" y1="150" x2="100" y2="166" />
        <line x1="34" y1="100" x2="50" y2="100" />
        <line x1="150" y1="100" x2="166" y2="100" />
        <line x1="53" y1="53" x2="64" y2="64" />
        <line x1="136" y1="136" x2="147" y2="147" />
        <line x1="147" y1="53" x2="136" y2="64" />
        <line x1="64" y1="136" x2="53" y2="147" />
      </g>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
