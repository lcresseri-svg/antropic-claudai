interface Props {
  insights: string[];
}

export function BudgetInsights({ insights }: Props) {
  if (insights.length === 0) return null;
  return (
    <section>
      <p className="label-caps text-secondary mb-3 px-1">Consigli Sunny</p>
      <div className="space-y-2.5">
        {insights.map((text, i) => (
          <div key={i} className="glass-card rounded-2xl p-4 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              ✦
            </div>
            <p className="text-[13px] text-primary leading-snug flex-1 self-center">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
