import { describe, it, expect } from 'vitest';
import {
  initMonthlyBudget, confirmMonthlyBudget, applyMonthlyBudgetEdit,
  shouldShowBudgetSetupPrompt, prevMonthKey, monthKeyOf, monthlyToBudgetState,
  MonthlyBudget,
} from './monthlyBudget';
import { BudgetState } from '../../types';

const NOW = 1_700_000_000_000;

function mk(over: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    month: '2026-05', savingsTarget: 500,
    categoryBudgets: { a: 200, b: 100 }, incomeBudgets: {}, investmentBudgets: {},
    suggestionAccepted: true, status: 'confirmed', source: 'manual',
    createdAt: NOW, updatedAt: NOW, confirmedAt: NOW, ...over,
  };
}

describe('month-key helpers', () => {
  it('monthKeyOf formats local Y-M', () => {
    expect(monthKeyOf(new Date(2026, 5, 15))).toBe('2026-06');
  });
  it('prevMonthKey rolls over the year', () => {
    expect(prevMonthKey('2026-01')).toBe('2025-12');
    expect(prevMonthKey('2026-06')).toBe('2026-05');
  });
});

describe('initMonthlyBudget', () => {
  it('copies from the previous month and stays unconfirmed (auto_initialized)', () => {
    const prev = mk({ month: '2026-05' });
    const next = initMonthlyBudget({ month: '2026-06', previous: prev, now: NOW });
    expect(next.month).toBe('2026-06');
    expect(next.categoryBudgets).toEqual({ a: 200, b: 100 });
    expect(next.status).toBe('auto_initialized');
    expect(next.source).toBe('copied_from_previous_month');
    expect(next.copiedFromMonth).toBe('2026-05');
    expect(next.confirmedAt).toBeUndefined();
  });

  it('falls back to the legacy budget when there is no previous month', () => {
    const legacy: BudgetState = {
      savingsTarget: 300, categoryBudgets: { x: 50 },
      incomeBudgets: {}, investmentBudgets: {}, suggestionAccepted: false,
    };
    const next = initMonthlyBudget({ month: '2026-06', legacy, now: NOW });
    expect(next.categoryBudgets).toEqual({ x: 50 });
    expect(next.source).toBe('copied_from_legacy_budget');
    expect(next.status).toBe('auto_initialized');
  });

  it('creates an empty budget when nothing exists', () => {
    const next = initMonthlyBudget({ month: '2026-06', now: NOW });
    expect(next.categoryBudgets).toEqual({});
    expect(next.source).toBe('auto_initialized');
    expect(next.status).toBe('auto_initialized');
  });
});

describe('confirm / edit', () => {
  it('confirmMonthlyBudget sets confirmed + confirmedAt', () => {
    const m = confirmMonthlyBudget(mk({ status: 'auto_initialized', confirmedAt: undefined }), NOW);
    expect(m.status).toBe('confirmed');
    expect(m.confirmedAt).toBe(NOW);
  });

  it('editing a non-confirmed budget moves it to draft', () => {
    const m = applyMonthlyBudgetEdit(mk({ status: 'auto_initialized' }), { categoryBudgets: { a: 250 } }, NOW);
    expect(m.status).toBe('draft');
    expect(m.categoryBudgets).toEqual({ a: 250 });
  });

  it('editing a confirmed budget keeps it confirmed', () => {
    const m = applyMonthlyBudgetEdit(mk({ status: 'confirmed' }), { savingsTarget: 600 }, NOW);
    expect(m.status).toBe('confirmed');
    expect(m.savingsTarget).toBe(600);
  });
});

describe('shouldShowBudgetSetupPrompt', () => {
  it('prompts when missing or not confirmed', () => {
    expect(shouldShowBudgetSetupPrompt(undefined)).toBe(true);
    expect(shouldShowBudgetSetupPrompt(mk({ status: 'auto_initialized' }))).toBe(true);
    expect(shouldShowBudgetSetupPrompt(mk({ status: 'draft' }))).toBe(true);
  });
  it('does not prompt when confirmed', () => {
    expect(shouldShowBudgetSetupPrompt(mk({ status: 'confirmed' }))).toBe(false);
  });
});

describe('monthlyToBudgetState', () => {
  it('projects to the legacy BudgetState shape', () => {
    const bs = monthlyToBudgetState(mk());
    expect(bs).toEqual({
      savingsTarget: 500, categoryBudgets: { a: 200, b: 100 },
      incomeBudgets: {}, investmentBudgets: {}, suggestionAccepted: true,
    });
  });
});
