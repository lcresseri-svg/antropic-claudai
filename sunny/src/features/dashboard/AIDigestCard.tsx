import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../../shared/providers/settings';
import { fetchDigest, DigestInput } from './aiDigest';

interface Props {
  input: DigestInput;
}

export function AIDigestCard({ input }: Props) {
  const { insightDepth, aiEnabled } = useSettings();
  const [sentences, setSentences] = useState<string[] | null>(null);
  const [visible, setVisible] = useState(false);
  const cacheRef = useRef<{ key: string; sentences: string[] } | null>(null);
  const inputKey = JSON.stringify(input);

  useEffect(() => {
    if (!aiEnabled || input.income === 0 && input.expenses === 0) return;

    if (cacheRef.current?.key === inputKey) {
      setSentences(cacheRef.current.sentences);
      setVisible(true);
      return;
    }

    setSentences(null);
    setVisible(false);

    fetchDigest(input).then(s => {
      cacheRef.current = { key: inputKey, sentences: s };
      setSentences(s);
      requestAnimationFrame(() => setVisible(true));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  if (!aiEnabled || insightDepth === 'minimal') return null;
  if (input.income === 0 && input.expenses === 0) return null;

  return (
    <div className="glass-card rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="label-caps text-secondary">Riepilogo AI</p>
        <SparkleIcon />
      </div>

      {sentences === null ? (
        <div className="flex items-center gap-2.5 py-1">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-gold/40 border-t-gold animate-spin" />
          <span className="text-xs text-secondary">Elaborazione...</span>
        </div>
      ) : (
        <div className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="space-y-1.5">
            {sentences.map((s, i) => (
              <p key={i} className="text-[13px] text-primary leading-relaxed">{s}</p>
            ))}
          </div>
          <p className="text-[10px] text-secondary/40 mt-3 text-right">Sunny AI · Gemini</p>
        </div>
      )}
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-gold/70">
      <path d="M12 3v1m0 16v1M4.22 4.22l.7.7m13.86 13.86.7.7M3 12h1m16 0h1M4.22 19.78l.7-.7M19.07 4.93l-.7.7"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  );
}
