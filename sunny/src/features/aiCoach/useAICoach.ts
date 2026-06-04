import { useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { AffordabilityRequest, AffordabilityResult } from './aiCoachTypes';
import { callAffordabilityAdvice } from './aiCoachUtils';

export type CoachStatus = 'idle' | 'loading' | 'done' | 'error';

export interface CoachState {
  status: CoachStatus;
  result: AffordabilityResult | null;
  errorMsg: string;
  remaining: number | null;
  analyze: (req: AffordabilityRequest) => Promise<void>;
  reset: () => void;
}

export function useAICoach(): CoachState {
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [result, setResult] = useState<AffordabilityResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);

  const analyze = useCallback(async (req: AffordabilityRequest) => {
    setStatus('loading');
    setResult(null);
    setErrorMsg('');
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) { setStatus('error'); setErrorMsg('Sessione scaduta, ricarica la pagina.'); return; }
      const res = await callAffordabilityAdvice(req, idToken);
      if (res.ok) {
        setResult(res.result);
        setRemaining(res.result.remaining);
        setStatus('done');
      } else {
        if (res.error === 'rate-limit') {
          setRemaining(0);
          setStatus('error');
          setErrorMsg('Limite giornaliero raggiunto (ripristino a mezzanotte UTC).');
        } else {
          setStatus('error');
          setErrorMsg('Si è verificato un errore. Riprova tra qualche secondo.');
        }
      }
    } catch {
      setStatus('error');
      setErrorMsg('Errore di rete. Verifica la connessione e riprova.');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
  }, []);

  return { status, result, errorMsg, remaining, analyze, reset };
}
