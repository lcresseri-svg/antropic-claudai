import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from 'firebase/auth';
import * as cash from './availableCash';
import { WealthV2Screen } from './WealthV2Screen';

vi.mock('../../shared/hooks/useTodayRomeISO', () => ({ useTodayRomeISO: () => '2026-11-10' }));
vi.mock('../../shared/hooks/useOriginBack', () => ({ useOriginBack: () => () => {} }));
vi.mock('../../shared/components/PageToolbar', () => ({ PageToolbar: () => null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
vi.mock('../../shared/providers/UiVersionProvider', () => ({ useUiVersion: () => '3.0' }));
vi.mock('./wealthSnapshots', () => ({ buildWealthSnapshot: vi.fn(), planWealthBackfill: vi.fn(), saveWealthSnapshot: vi.fn(), applyWealthBackfill: vi.fn(), romeDayKey: () => '2026-11-10' }));
vi.mock('../../shared/providers/settings', () => ({ useSettings: () => ({
  accounts: [
    { id: 'bank', label: 'Bank', initialBalance: 1000 },
    { id: 'card', label: 'Card', creditCardPolicies: [{ fromMonth: '2026-10', enabled: true, paymentDay: 10, paymentAccountId: 'bank' }] },
  ], categories: [], cashReserve: 0, saveCashReserve: vi.fn(),
}) }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('WealthV2Screen payment-day calendar', () => {
  it('uses the refreshed Rome day so a bill already deducted from liquidity is not reserved again', () => {
    vi.useFakeTimers();
    // A stale mounted-screen clock would still be on November 9. The shared
    // calendar has now advanced to payment day, together with live liquidity.
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    const available = vi.spyOn(cash, 'computeAvailableCash');
    renderToStaticMarkup(<WealthV2Screen user={{ uid: 'synthetic' } as User} liquidity={900} transactions={[
      { id: 'expense', date: '2026-10-15', type: 'expense', amount: 100, description: 'Card purchase', category: 'food', account: 'card' },
    ]}/>);
    expect(available.mock.results[0].value).toMatchObject({ liquidity: 900, committed: 0, available: 900 });
  });
});
