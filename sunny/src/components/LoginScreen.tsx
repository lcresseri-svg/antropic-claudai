import { ArcLogo } from '../App';

interface Props {
  onSignIn: () => void;
  error: string | null;
}

export function LoginScreen({ onSignIn, error }: Props) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-8 animate-fade-in">

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <ArcMark />
        <h1 className="text-[40px] font-bold text-primary tracking-[-0.04em] mt-10 leading-none">
          Sunny
        </h1>
        <p className="text-secondary mt-4 text-[15px] max-w-[200px] leading-relaxed">
          Finanza personale,{' '}senza compromessi.
        </p>
      </div>

      {/* CTA */}
      <div className="w-full max-w-[300px] pb-14 space-y-3">
        <button onClick={onSignIn}
          className="w-full bg-primary text-bg py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all active:scale-[0.98] active:opacity-90">
          <GoogleIcon />
          Continua con Google
        </button>
        {error && (
          <p className="text-xs text-[#C0605A] text-center leading-relaxed">{error}</p>
        )}
        <p className="text-center pt-1 text-secondary/50 leading-relaxed"
          style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Dati sincronizzati e protetti
        </p>
      </div>
    </div>
  );
}

function ArcMark() {
  // r=30, circ≈188.5 | 320°=167.6 | 40°gap=20.9 | gap centred at top
  return (
    <svg width="88" height="88" viewBox="0 0 80 80" fill="none" aria-hidden className="animate-scale-in">
      <circle cx="40" cy="40" r="30"
        stroke="#E6B95C" strokeWidth="8" strokeLinecap="round"
        strokeDasharray="167.6 20.9"
        transform="rotate(-70 40 40)"
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
