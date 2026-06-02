import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export interface DigestInput {
  income: number;
  expenses: number;
  investments: number;
  saved: number;
  topInsights: string[];
}

export async function fetchDigest(input: DigestInput): Promise<string[]> {
  try {
    const fn = httpsCallable<DigestInput, { sentences: string[] }>(functions, 'generateDigest');
    const res = await fn(input);
    const sentences = res.data.sentences;
    if (Array.isArray(sentences) && sentences.length > 0) return sentences;
    return buildRuleBasedDigest(input);
  } catch {
    return buildRuleBasedDigest(input);
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function buildRuleBasedDigest({ income, expenses, investments, saved, topInsights }: DigestInput): string[] {
  const sentences: string[] = [];

  if (income > 0) {
    const ratio = expenses / income;
    if (ratio < 0.5) sentences.push(`Ottimo mese: hai speso solo il ${Math.round(ratio * 100)}% delle entrate, tenendo i costi sotto controllo.`);
    else if (ratio < 0.8) sentences.push(`Hai gestito bene il mese, con uscite pari al ${Math.round(ratio * 100)}% delle entrate.`);
    else sentences.push(`Attenzione: le uscite hanno raggiunto il ${Math.round(ratio * 100)}% delle entrate questo mese.`);
  }

  if (saved > 0) {
    sentences.push(`Hai risparmiato ${fmt(saved)} questo mese${investments > 0 ? `, dopo aver investito ${fmt(investments)}` : ''}.`);
  } else if (saved < 0) {
    sentences.push(`Le spese totali hanno superato le entrate di ${fmt(Math.abs(saved))}: tieni d'occhio il budget.`);
  }

  if (sentences.length < 2 && topInsights.length > 0) {
    sentences.push(topInsights[0]);
  }

  return sentences.slice(0, 3);
}
