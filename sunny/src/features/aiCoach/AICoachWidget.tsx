import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../../shared/providers/settings';
import { useAICoach } from './useAICoach';
import { AffordabilityForm } from './AffordabilityForm';
import { AffordabilityResultCard } from './AffordabilityResultCard';

export function AICoachWidget() {
  const [open, setOpen] = useState(false);
  const { categories } = useSettings();
  const { status, result, errorMsg, remaining, analyze, reset } = useAICoach();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClose = () => { setOpen(false); reset(); };

  return (
    <div
      ref={panelRef}
      className="fixed bottom-[76px] right-4 md:bottom-6 md:right-6 z-[45] flex flex-col items-end gap-3"
    >
      {/* Chat panel */}
      {open && (
        <div
          className="w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-divider shadow-float glass-elevated overflow-hidden animate-fade-in-fast"
          style={{ maxHeight: 'calc(100vh - 180px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
            <div className="flex items-center gap-2">
              <SparkleIcon />
              <span className="text-sm font-semibold text-primary">AI Coach</span>
              {remaining !== null && (
                <span className="text-xs text-secondary opacity-70">{remaining} rimaste</span>
              )}
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-full hover:bg-card-hover"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 240px)' }}>
            {status === 'done' && result ? (
              <AffordabilityResultCard
                result={result}
                categories={categories}
                onReset={reset}
              />
            ) : (
              <div className="space-y-4">
                <AffordabilityForm onSubmit={analyze} loading={status === 'loading'} />
                {status === 'error' && (
                  <div className="rounded-xl bg-[#E08B8B]/10 border border-[#E08B8B]/25 px-4 py-3">
                    <p className="text-sm text-[#E08B8B]">{errorMsg}</p>
                    {remaining === 0 && (
                      <p className="text-xs text-[#E08B8B]/70 mt-1">Ripristino a mezzanotte UTC.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="AI Coach"
        className="w-16 h-16 rounded-full shadow-float glass-cta-gold flex items-center justify-center transition-all duration-200 active:scale-90"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 3l14 14M17 3L3 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        ) : (
          <SparkleIcon size={26} />
        )}
      </button>
    </div>
  );
}

function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"/>
    </svg>
  );
}
