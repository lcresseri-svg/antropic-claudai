import type { ReactNode } from 'react';
import { formatCurrency } from '../../utils';

export function RefundProgress({ gross, remaining }: { gross: number; remaining: number }) {
  const progress = gross > 0 ? Math.max(0, Math.min(100, (1 - remaining / gross) * 100)) : 0;
  return (
    <span className="block h-[5px] rounded-full overflow-hidden mb-2"
      style={{ background: 'rgba(var(--c-primary) / 0.08)' }} aria-hidden="true">
      <span className="block h-full rounded-full bg-green" style={{ width: `${progress}%` }} />
    </span>
  );
}

interface RefundPreviewProps {
  gross: number;
  refunded: number;
  covered: number;
  remaining: number;
  gain: number;
  children: ReactNode;
}

export function RefundPreview({ gross, refunded, covered, remaining, gain, children }: RefundPreviewProps) {
  return (
    <div className="bg-card rounded-2xl px-4 py-3.5 space-y-2">
      <p className="label-caps text-secondary">Dopo il rimborso</p>
      <PreviewRow label="Spesa originale" value={formatCurrency(gross)} />
      {refunded > 0 && <PreviewRow label="Già stornato" value={`−${formatCurrency(refunded)}`} />}
      <PreviewRow label="Questo storno" value={`−${formatCurrency(covered)}`} positive />
      <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-divider">
        <span className="text-[13px] font-semibold text-primary">Spesa effettiva</span>
        <span className="text-[21px] font-bold text-primary balance-num">{formatCurrency(remaining)}</span>
      </div>
      {gain > 0 && <PreviewRow label="Entrata da rimborso" value={`+${formatCurrency(gain)}`} positive />}
      <p className="text-[11px] text-secondary/70 leading-snug pt-1">{children}</p>
    </div>
  );
}

function PreviewRow({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-secondary">{label}</span>
      <span className={`text-[13px] font-semibold balance-num ${positive ? 'text-green' : 'text-primary'}`}>{value}</span>
    </div>
  );
}
