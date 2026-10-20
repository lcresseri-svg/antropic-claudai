import { Transaction } from '../../types';
import { isPending, isExpiredTemplate } from '../../shared/recurrence';
import { OnboardingData } from './onboardingTypes';

// Persisted numeric IDs retain their meaning; UI3 groups them into three moments.
export function entryStage(step: number): number {
  return step === 0 || step === 3 ? 0 : step === 2 ? 1 : 2;
}
export function nextAfterSource(mode: OnboardingData['dataMode'], hasAccount: boolean) {
  if (!hasAccount) return 'account';
  if (mode === 'csv') return 'import';
  if (mode === 'demo') return 'demo-confirmation';
  return 'reading';
}
export function parseOpeningBalance(value: string): { initialBalance?: number } {
  if (!value.trim()) return {};
  const normalized = value.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) || !Number.isFinite(Number(normalized))) {
    throw new Error('Inserisci un saldo valido oppure lascia il campo vuoto.');
  }
  return { initialBalance: Number(normalized) };
}
export function buildFirstReading(mode: OnboardingData['dataMode'], transactions: Transaction[] | undefined, loading: boolean, today = new Date().toLocaleDateString('sv-SE')) {
  if (loading) return { kind: 'loading' as const };
  if (!transactions) return { kind: 'unavailable' as const };
  const visible = transactions.filter(t => !t.projected && !isExpiredTemplate(t));
  if (!visible.length) return { kind: 'empty' as const };
  const scheduled = visible.filter(t => isPending(t, today)).length;
  return { kind: 'ready' as const, recorded: visible.length - scheduled, scheduled, demo: mode === 'demo' || visible.some(t => t.demo) };
}
