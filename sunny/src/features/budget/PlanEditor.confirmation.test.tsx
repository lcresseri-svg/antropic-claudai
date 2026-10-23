import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanEditor, type PlanEditorSection } from './PlanEditor';
import { initMonthlyBudget, type MonthlyBudget } from './monthlyBudget';
import { createPlanDraft } from './planDraft';

vi.mock('../../shared/providers/UiVersionProvider', () => ({ useUiVersion: () => '3.0' }));
vi.mock('./PlanDialog', () => ({ PlanDialog: ({ children }: any) => <section>{children}</section> }));

const planFor = (month: string): MonthlyBudget => ({
  ...initMonthlyBudget({ month }),
  status: 'draft', source: 'manual', savingsTarget: 300, incomeBudgets: { salary: 2400 },
  planningV3: { schemaVersion: 1, inputsReviewedAt: 1, cashInvestmentBudgets: {} },
});
const render = (plan: MonthlyBudget, section: PlanEditorSection) => renderToStaticMarkup(<PlanEditor
  uid="test" month={plan.month} plan={plan} categories={[]} transactions={[]}
  now={new Date(2026, 9, 23, 12)} section={section}
  onSave={async (_, next) => next} onClose={() => {}}
/>);
const confirmationButton = (html: string) => html.match(/<button\b[^>]*>Conferma piano<\/button>/)?.[0];
afterEach(() => vi.unstubAllGlobals());

describe('UI3 plan confirmation', () => {
  it.each(['income', 'goals', 'expenses'] as const)('can confirm a complete current plan from %s', section => {
    const button = confirmationButton(render(planFor('2026-10'), section));
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled');
  });

  it('can confirm a complete future plan without entering optional category limits', () => {
    expect(confirmationButton(render(planFor('2026-11'), 'goals'))).toBeDefined();
  });

  it('keeps confirmation actionable while explaining the required review', () => {
    const plan = { ...planFor('2026-10'), planningV3: undefined };
    const html = render(plan, 'expenses');
    expect(confirmationButton(html)).not.toContain('disabled');
    expect(html).toContain('Verifica gli investimenti dai conti, anche se sono zero.');
    expect(html).toContain('aria-describedby="plan-confirmation-help"');
  });

  it('keeps historical plans out of confirmation', () => {
    expect(confirmationButton(render(planFor('2026-09'), 'expenses'))).toBeUndefined();
  });

  it('saves changes to an already confirmed plan instead of confirming it again', () => {
    const html = render({ ...planFor('2026-10'), status: 'confirmed' }, 'goals');
    expect(confirmationButton(html)).toBeUndefined();
    expect(html).toContain('Salva modifiche');
  });

  it.each([undefined, { schemaVersion: 1 as const, inputsReviewedAt: 0, cashInvestmentBudgets: {} }])('offers confirmation for an older confirmed plan requiring review: %j', planningV3 => {
    const html = render({ ...planFor('2026-10'), status: 'confirmed', planningV3 }, 'goals');
    expect(confirmationButton(html)).not.toContain('disabled');
    expect(html).toContain('Verifica gli investimenti dai conti, anche se sono zero.');
  });

  it('uses the displayed plan confirmation even when a recovered local draft has an old confirmed base', () => {
    const cached = createPlanDraft({ ...planFor('2026-10'), status: 'confirmed' });
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ draft: cached, revision: 1 }) });
    const html = render({ ...planFor('2026-10'), status: 'confirmed', planningV3: undefined }, 'goals');
    expect(confirmationButton(html)).toBeDefined();
    expect(html).toContain('Salva bozza');
    expect(html).not.toContain('Salva modifiche');
  });
});
