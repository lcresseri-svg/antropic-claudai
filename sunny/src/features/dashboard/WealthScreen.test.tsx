import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WealthScreen } from '../wealth/WealthScreen';
const settings = vi.hoisted(() => ({
  accounts: [], categories: [] as import('../../types').CategoryDef[], enableInvestments: true, includeInvestments: true,
  getCat: () => ({ id: 'fund', label: 'Fondo', icon: 'A', color: '#888' }),
  getAcc: () => ({ id: 'cash', label: 'Conto', icon: 'A', color: '#888' }),
}));
vi.mock('../../shared/providers/settings', () => ({ useSettings: () => settings }));
vi.mock('../../shared/providers/UiVersionProvider', () => ({ useUiVersion: () => '3.0' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
vi.mock('../../shared/hooks/useMediaQuery', () => ({ useIsDesktop: () => false }));
const base = { transactions: [], netWorth: 50, liquidity: -50, investmentTotal: 100, accountBalances: {cash:-50}, investmentByCategory: {} };
describe('wealth composition boundaries', () => {
  it('qualifies known capital separately when account balances and included net worth are unavailable',()=>{
    settings.includeInvestments=false;
    settings.categories=[{id:'fund',label:'Fondo',icon:'A',color:'#888',kind:'investment',initialBalance:1000}];
    const html=renderToStaticMarkup(<WealthScreen {...base} netWorth={0} liquidity={0} investmentTotal={1000} accountBalances={{}}/>);
    settings.categories=[];
    expect(html).toContain('Capitale investito registrato');
    expect(html).toContain('1000,00');
    expect(html).toContain('Investimenti esclusi dal patrimonio');
    expect(html).not.toContain('data-wealth-series="liq"');
  });
  it('does not present missing balances as zero assets or a free-cash estimate',()=>{
    const html=renderToStaticMarkup(<WealthScreen {...base} netWorth={0} liquidity={0} investmentTotal={0} accountBalances={{}} showAvailableCash/>);
    expect(html).toContain('Saldo iniziale non indicato');
    expect(html).not.toContain('liquid-headline-value');
    expect(html).not.toContain('ui31-cash-value');
  });
  it('keeps available cash gated and qualifies unreliable data',()=>{
    expect(renderToStaticMarkup(<WealthScreen {...base}/>)).not.toContain('ui31-cash-summary');
    expect(renderToStaticMarkup(<WealthScreen {...base} showAvailableCash/>)).toContain('ui31-cash-summary');
    const error=renderToStaticMarkup(<WealthScreen {...base} showAvailableCash error="offline"/>);
    expect(error).toContain('Sintesi non disponibile');
    expect(error).not.toContain('ui31-cash-value');
  });
  it('keeps signed balances without interpreting negative liquidity as a positive share', () => {
    settings.includeInvestments = true;
    const html = renderToStaticMarkup(<WealthScreen {...base} />);
    expect(html).not.toContain('% del totale');
    expect(html).not.toContain('Composizione del patrimonio, base capitale');
  });
  it('does not call excluded investments a proportion of the included total', () => {
    settings.includeInvestments = false;
    const html = renderToStaticMarkup(<WealthScreen {...base} netWorth={200} liquidity={200} />);
    expect(html).not.toContain('50% del totale');
    expect(html).toContain('investimenti esclusi dal totale');
    expect(html).not.toContain('Composizione del patrimonio, base capitale');
  });
});
