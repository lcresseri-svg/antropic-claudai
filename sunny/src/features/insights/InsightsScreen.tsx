import { Transaction } from '../../types';
import { Insights } from './Insights';

interface Props {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
}

export function InsightsScreen(p: Props) {
  return (
    <div className="pb-32">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-6">Insight</h1>
      <Insights {...p} limit={20} />
    </div>
  );
}
