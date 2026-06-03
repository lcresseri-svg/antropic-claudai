import { useRef, useState } from 'react';
import { Transaction, TYPE_META, ownShare } from '../../types';
import { formatCurrency, formatDateFull } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { haptic } from '../../shared/utils/haptics';

interface Props {
  tx: Transaction;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  onClick?: (tx: Transaction) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (tx: Transaction) => void;
  onEnterSelect?: (id: string) => void;
}

const THRESHOLD = 64;
const LP_DELAY  = 500;

export function TransactionRow({
  tx, selectable, selected, onToggle, onClick, onDelete, onDuplicate, onEnterSelect,
}: Props) {
  const { getCat, getAcc } = useSettings();
  const cat = getCat(tx.category);
  const acc = getAcc(tx.account);

  const isIncome      = tx.type === 'income';
  const isTransfer    = tx.type === 'transfer';
  const isInvestment  = tx.type === 'investment';
  const isProjected   = !!tx.projected;

  const prefix      = isIncome ? '+' : isTransfer ? '' : '−';
  const amountClass = isIncome ? 'text-green' : isInvestment ? 'text-gold' : isTransfer ? 'text-[#88B0C0]' : 'text-primary';

  const [offset, setOffset]   = useState(0);
  const [snapping, setSnapping] = useState(false);

  const dragRef = useRef<{
    sx: number; sy: number;
    intent: 'unknown' | 'swipe' | 'scroll';
    lpTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const suppressTap         = useRef(false);
  const thresholdFired      = useRef(false);

  const snapBack = () => {
    setSnapping(true);
    setOffset(0);
    setTimeout(() => setSnapping(false), 260);
  };

  // Swipe is disabled in select mode and for projected rows (they open the series).
  const noSwipe = selectable || isProjected;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (noSwipe) return;
    thresholdFired.current = false;
    dragRef.current = {
      sx: e.clientX, sy: e.clientY,
      intent: 'unknown',
      lpTimer: setTimeout(() => {
        dragRef.current = null;
        suppressTap.current = true;
        haptic.select();
        onEnterSelect?.(tx.id);
      }, LP_DELAY),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;

    if (dragRef.current.intent === 'unknown' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      if (Math.abs(dx) > Math.abs(dy)) {
        dragRef.current.intent = 'swipe';
        clearTimeout(dragRef.current.lpTimer!);
        dragRef.current.lpTimer = null;
      } else {
        dragRef.current.intent = 'scroll';
        clearTimeout(dragRef.current.lpTimer!);
        dragRef.current.lpTimer = null;
      }
    }

    if (dragRef.current.intent === 'swipe') {
      e.preventDefault();
      const next = Math.max(-THRESHOLD, Math.min(THRESHOLD, dx));
      setOffset(next);
      if (Math.abs(next) >= THRESHOLD - 2 && !thresholdFired.current) {
        thresholdFired.current = true;
        haptic.light();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { intent, lpTimer } = dragRef.current;
    if (lpTimer) clearTimeout(lpTimer);
    const dx = e.clientX - dragRef.current.sx;
    dragRef.current = null;

    if (intent !== 'swipe') return;

    suppressTap.current = true;

    if (dx <= -(THRESHOLD - 4) && onDelete) {
      // Reveal delete — row stays offset, user must tap the Elimina button to confirm
      setSnapping(false);
      setOffset(-THRESHOLD);
    } else if (dx >= (THRESHOLD - 4) && onDuplicate) {
      // Duplicate executes immediately on full right swipe
      snapBack();
      onDuplicate(tx);
    } else {
      snapBack();
    }
  };

  const handlePointerCancel = () => {
    if (dragRef.current?.lpTimer) clearTimeout(dragRef.current.lpTimer);
    dragRef.current = null;
    snapBack();
  };

  const handleTap = () => {
    if (suppressTap.current) { suppressTap.current = false; return; }
    // Tapping the row while revealed snaps it back instead of opening the modal
    if (offset !== 0) { snapBack(); return; }
    if (selectable) onToggle?.(tx.id);
    else onClick?.(tx);
  };

  const handleDeleteConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.heavy();
    snapBack();
    onDelete?.(tx.id);
  };

  return (
    <div className="relative overflow-hidden -mx-2 rounded-xl">
      {/* Delete action — revealed by left swipe */}
      {onDelete && (
        <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 rounded-xl"
          style={{ background: 'rgba(192,72,72,0.12)' }}>
          <button type="button" onClick={handleDeleteConfirm}
            className="text-[#E08B8B] text-sm font-semibold py-2 px-1">
            🗑 Elimina
          </button>
        </div>
      )}

      {/* Duplicate action — revealed by right swipe */}
      {onDuplicate && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-5 rounded-xl"
          style={{ background: 'rgba(100,160,80,0.12)' }}>
          <span className="text-green text-sm font-semibold">📋 Duplica</span>
        </div>
      )}

      {/* Front layer — slides on swipe, opaque to hide the action layers */}
      <div
        className="relative bg-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: snapping ? 'transform 0.25s ease-out' : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={handleTap}
          onKeyDown={e => e.key === 'Enter' && handleTap()}
          className={`w-full flex items-center gap-3.5 py-3 text-left active:bg-card-hover rounded-xl px-2 select-none cursor-pointer ${isProjected ? 'opacity-60' : ''}`}
        >
          {selectable && (
            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              selected ? 'bg-gold border-gold' : 'border-divider'
            }`}>
              {selected && <span className="text-bg text-xs font-bold">✓</span>}
            </span>
          )}

          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{ backgroundColor: cat.color + '18' }}>
            {cat.icon}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-primary truncate">{tx.description}</p>
            <p className="text-xs text-secondary mt-0.5 truncate">
              {formatDateFull(tx.date)} · {acc.label}
              {isTransfer && tx.toAccount && ` → ${getAcc(tx.toAccount).label}`}
              {isProjected ? ' · 🗓️' : tx.recurring && ' · 🔁'}
            </p>
          </div>

          <div className="text-right flex-shrink-0">
            <p className={`text-[15px] font-semibold balance-num ${amountClass}`}>
              {prefix}{formatCurrency(tx.amount)}
            </p>
            {isProjected ? (
              <p className="text-[11px] text-secondary mt-0.5">Programmato</p>
            ) : tx.shared ? (
              <p className="text-[11px] text-secondary mt-0.5">
                tua: {formatCurrency(ownShare(tx))}
              </p>
            ) : !isTransfer ? (
              <p className="text-[11px] text-secondary mt-0.5">{TYPE_META[tx.type].label}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
