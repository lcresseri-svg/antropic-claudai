import { AffordabilityRequest, AffordabilityResult } from './aiCoachTypes';

const ADVICE_URL =
  `https://europe-west1-${import.meta.env.VITE_FIREBASE_PROJECT_ID as string}.cloudfunctions.net/generateAffordabilityAdvice`;

export async function callAffordabilityAdvice(
  req: AffordabilityRequest,
  idToken: string,
): Promise<{ ok: true; result: AffordabilityResult } | { ok: false; error: string; remaining?: number }> {
  try {
    const resp = await fetch(ADVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(req),
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (resp.status === 429) return { ok: false, error: 'rate-limit', remaining: 0 };
    if (!resp.ok) return { ok: false, error: (data.error as string) ?? 'unavailable' };
    return { ok: true, result: data as unknown as AffordabilityResult };
  } catch {
    return { ok: false, error: 'network' };
  }
}
