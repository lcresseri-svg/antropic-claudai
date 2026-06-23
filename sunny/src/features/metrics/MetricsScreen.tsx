import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Admin-only product-metrics dashboard. Reads the top-level `metrics/{day}`
// collection (Admin SDK writes it; rules allow read only to the admin) and plots
// DAU/WAU/MAU + engagement. The route is gated by isAdminUser in App — this is
// admin DATA access, the one legitimate use of the admin identity for UI.

interface MetricsDay {
  date: string;
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  newUsers: number;
  totalUsers: number;
  readers?: Record<string, number>;
  adoption?: Record<string, number>;
}

const READER_LABELS: Record<string, string> = {
  insights_view: 'Insight visti',
  insight_open: 'Insight aperti',
  notif_open: 'Aperture da notifica',
};
const ADOPTION_LABELS: Record<string, string> = {
  tx_add: 'Transazioni aggiunte',
  forecast_view: 'Forecast visti',
  aicoach_open: 'AI Coach aperti',
};

export function MetricsScreen() {
  const [days, setDays] = useState<MetricsDay[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'metrics'), orderBy('date', 'desc'), limit(60)));
        setDays(snap.docs.map(d => d.data() as MetricsDay).reverse()); // ascending by date
      } catch {
        setError(true);
      }
    })();
  }, []);

  if (error) return <Shell><p className="text-sm text-secondary">Impossibile caricare le metriche.</p></Shell>;
  if (!days) return <Shell><p className="text-sm text-secondary">Caricamento…</p></Shell>;
  if (days.length === 0) {
    return (
      <Shell>
        <p className="text-sm text-secondary">
          Nessun dato ancora. La prima aggregazione gira ogni notte alle 00:15 (Europe/Rome).
        </p>
      </Shell>
    );
  }

  const latest = days[days.length - 1];

  return (
    <Shell>
      <p className="label-caps text-secondary mb-3">Ultimo giorno · {latest.date}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Kpi label="DAU" value={latest.dau} />
        <Kpi label="WAU" value={latest.wau} />
        <Kpi label="MAU" value={latest.mau} />
        <Kpi label="Stickiness" value={`${Math.round(latest.stickiness * 100)}%`} />
        <Kpi label="Nuovi utenti" value={latest.newUsers} />
        <Kpi label="Utenti totali" value={latest.totalUsers} />
      </div>

      <div className="glass-card rounded-2xl p-5 mb-4">
        <p className="label-caps text-secondary mb-4">Attivi nel tempo</p>
        <ActiveUsersChart days={days} />
        <div className="flex items-center gap-4 mt-3">
          <Legend color="var(--accent)" label="DAU" />
          <Legend color="#88B0C0" label="WAU" />
          <Legend color="#B5A8C8" label="MAU" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BarCard title="Lettori (ultimo giorno)" labels={READER_LABELS} values={latest.readers} total={latest.dau} />
        <BarCard title="Adozione (ultimo giorno)" labels={ADOPTION_LABELS} values={latest.adoption} total={latest.dau} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-24">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-5">Metriche</h1>
      {children}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-3.5">
      <p className="label-caps text-secondary mb-1.5">{label}</p>
      <p className="text-xl font-bold text-primary balance-num">{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-secondary">{label}</span>
    </div>
  );
}

function BarCard({ title, labels, values, total }: {
  title: string;
  labels: Record<string, string>;
  values?: Record<string, number>;
  total: number;
}) {
  const max = Math.max(1, total, ...Object.values(values ?? {}));
  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="label-caps text-secondary mb-3">{title}</p>
      <ul className="space-y-3">
        {Object.entries(labels).map(([key, label]) => {
          const v = values?.[key] ?? 0;
          return (
            <li key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] text-secondary">{label}</span>
                <span className="text-[13px] font-medium text-primary balance-num">{v}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, backgroundColor: 'var(--accent)' }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Compact multi-series line chart (DAU/WAU/MAU) — fixed viewBox, scales to width.
function ActiveUsersChart({ days }: { days: MetricsDay[] }) {
  const W = 600, H = 160, PAD = 6;
  const max = Math.max(1, ...days.map(d => Math.max(d.dau, d.wau, d.mau)));
  const n = days.length;
  const x = (i: number) => n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const line = (pick: (d: MetricsDay) => number) =>
    days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(pick(d)).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="overflow-visible">
      <path d={line(d => d.mau)} fill="none" stroke="#B5A8C8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line(d => d.wau)} fill="none" stroke="#88B0C0" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line(d => d.dau)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
