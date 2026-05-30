import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { CategoryDef, AccountDef, TransactionType, TYPE_META, TYPE_ORDER } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { EditDefSheet, DefDraft } from './EditDefSheet';

interface Props {
  user: User;
  onLogOut: () => void;
  onDeleteAll: () => Promise<void>;
}

const newId = () => `x_${Date.now().toString(36)}`;
type Sub = 'menu' | 'accounts' | 'categories';

type DragState = {
  list: 'accounts' | TransactionType;
  fromIdx: number;
  overIdx: number;
  startY: number;
};

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function SettingsScreen({ user, onLogOut, onDeleteAll }: Props) {
  const navigate = useNavigate();
  const { categories, accounts, saveCategories, saveAccounts } = useSettings();
  const [sub, setSub] = useState<Sub>('menu');
  const [editing, setEditing] = useState<{ kind: 'category' | 'account'; draft: DefDraft; isNew: boolean; withKind?: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Keep a ref for stable event handlers that always see latest state
  const ref = useRef({ drag, accounts, categories, saveAccounts, saveCategories });
  ref.current = { drag, accounts, categories, saveAccounts, saveCategories };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const { drag: d, accounts: accs, categories: cats } = ref.current;
      if (!d) return;
      const listLen = d.list === 'accounts'
        ? accs.length
        : cats.filter(c => c.kind === d.list).length;
      const delta = e.clientY - d.startY;
      const newOver = Math.max(0, Math.min(listLen - 1, d.fromIdx + Math.round(delta / 56)));
      setDrag(prev => prev && newOver !== prev.overIdx ? { ...prev, overIdx: newOver } : prev);
    };
    const onEnd = () => {
      const { drag: d, accounts: accs, categories: cats, saveAccounts: sA, saveCategories: sC } = ref.current;
      if (!d) { setDrag(null); return; }
      if (d.fromIdx !== d.overIdx) {
        if (d.list === 'accounts') {
          sA(reorder(accs, d.fromIdx, d.overIdx));
        } else {
          const kind = d.list as TransactionType;
          const kindItems = cats.filter(c => c.kind === kind);
          const newKind = reorder(kindItems, d.fromIdx, d.overIdx);
          let ki = 0;
          sC(cats.map(c => c.kind === kind ? newKind[ki++] : c));
        }
      }
      setDrag(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    };
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCategory = (c?: CategoryDef, forKind?: TransactionType) => setEditing({
    kind: 'category', isNew: !c,
    withKind: !forKind,
    draft: c ? { ...c } : { id: newId(), label: '', icon: '•', color: '#8A9270', kind: forKind ?? 'expense' },
  });
  const openAccount = (a?: AccountDef) => setEditing({
    kind: 'account', isNew: !a,
    draft: a ? { ...a } : { id: newId(), label: '', icon: '🏦', color: '#6FA8DC' },
  });

  const save = (d: DefDraft) => {
    if (!editing) return;
    if (editing.kind === 'category') {
      const def: CategoryDef = { id: d.id, label: d.label, icon: d.icon, color: d.color, kind: d.kind ?? 'expense' };
      saveCategories(editing.isNew ? [...categories, def] : categories.map(c => c.id === d.id ? def : c));
    } else {
      const def: AccountDef = { id: d.id, label: d.label, icon: d.icon, color: d.color };
      saveAccounts(editing.isNew ? [...accounts, def] : accounts.map(a => a.id === d.id ? def : a));
    }
    setEditing(null);
  };

  const remove = (id: string) => {
    if (!editing) return;
    if (editing.kind === 'category') saveCategories(categories.filter(c => c.id !== id));
    else saveAccounts(accounts.filter(a => a.id !== id));
    setEditing(null);
  };

  const enterSub = (s: Sub) => { setSub(s); setEditMode(false); };
  const exitToMenu = () => { setSub('menu'); setEditMode(false); };
  const toggleEditMode = () => { setEditMode(m => !m); setDrag(null); };
  const catsByKind = (k: TransactionType) => categories.filter(c => c.kind === k);

  // Live-preview helpers during drag
  const liveAccounts = drag?.list === 'accounts'
    ? reorder(accounts, drag.fromIdx, drag.overIdx)
    : accounts;
  const liveCats = (k: TransactionType) => {
    const base = catsByKind(k);
    return drag?.list === k ? reorder(base, drag.fromIdx, drag.overIdx) : base;
  };
  const draggingId = drag
    ? (drag.list === 'accounts'
      ? accounts[drag.fromIdx]?.id
      : catsByKind(drag.list as TransactionType)[drag.fromIdx]?.id)
    : null;

  const startDrag = (list: 'accounts' | TransactionType, idx: number, startY: number) =>
    setDrag({ list, fromIdx: idx, overIdx: idx, startY });

  return (
    <div className="space-y-6 pb-28 animate-fade-in">
      {sub === 'menu' && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1 as any)} aria-label="Indietro"
              className="w-9 h-9 -ml-2 flex items-center justify-center text-secondary active:text-primary">
              <ChevronLeft />
            </button>
            <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] flex-1">Impostazioni</h1>
          </div>

          {/* Profile */}
          <div className="bg-card rounded-2xl p-5 flex items-center gap-4">
            {user.photoURL
              ? <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" />
              : <div className="w-12 h-12 rounded-full bg-green flex items-center justify-center text-bg font-bold">{(user.displayName ?? 'U')[0]}</div>}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-primary truncate">{user.displayName}</p>
              <p className="text-xs text-secondary truncate">{user.email}</p>
            </div>
            <button onClick={onLogOut} className="text-xs font-medium text-secondary px-3 py-2 rounded-xl bg-elevated">Esci</button>
          </div>

          {/* Management entries */}
          <div className="bg-card rounded-2xl divide-y divide-divider">
            <Row icon="🏦" color="#6FA8DC" label="Gestisci conti" onClick={() => enterSub('accounts')} />
            <Row icon="🏷️" color="#8A9270" label="Gestisci categorie" onClick={() => enterSub('categories')} />
          </div>

          {/* Danger zone */}
          <div className="bg-card rounded-2xl overflow-hidden">
            {confirmReset ? (
              <div className="p-4 space-y-3">
                <p className="text-sm font-medium text-primary">Eliminare tutte le transazioni?</p>
                <p className="text-xs text-secondary">Questa azione è irreversibile.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmReset(false)}
                    className="flex-1 py-2.5 rounded-xl bg-elevated text-secondary text-sm font-medium">Annulla</button>
                  <button onClick={async () => { await onDeleteAll(); setConfirmReset(false); }}
                    className="flex-1 py-2.5 rounded-xl bg-[#E08B8B]/15 text-[#E08B8B] text-sm font-semibold">Elimina tutto</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)}
                className="w-full flex items-center gap-3.5 p-4 text-left active:bg-card-hover">
                <span className="text-[#E08B8B]">🗑</span>
                <span className="text-sm font-medium text-[#E08B8B]">Elimina tutte le transazioni</span>
              </button>
            )}
          </div>

          <p className="text-center text-xs text-secondary/60 pt-2">Sunny · finanza personale</p>
        </>
      )}

      {sub === 'accounts' && (
        <>
          <ManageHeader title="Conti" editMode={editMode} onBack={exitToMenu} onToggleEdit={toggleEditMode} />
          <div className="space-y-3">
            <div className="bg-card rounded-2xl divide-y divide-divider">
              {liveAccounts.map((a) => (
                <ManageRow key={a.id} icon={a.icon} color={a.color} label={a.label}
                  editMode={false} selected={false}
                  showHandle={editMode}
                  isDragging={a.id === draggingId}
                  onClick={editMode ? () => openAccount(a) : undefined}
                  onHandlePointerDown={editMode ? (y) => startDrag('accounts', accounts.indexOf(a), y) : undefined}
                />
              ))}
            </div>
            {editMode && (
              <button onClick={() => openAccount()}
                className="w-full py-3 rounded-2xl bg-card text-gold text-sm font-semibold active:bg-card-hover">
                + Aggiungi conto
              </button>
            )}
          </div>
        </>
      )}

      {sub === 'categories' && (
        <>
          <ManageHeader title="Categorie" editMode={editMode} onBack={exitToMenu} onToggleEdit={toggleEditMode} />
          <div className="space-y-4">
            {TYPE_ORDER.filter(k => k !== 'transfer').map(k => {
              const items = liveCats(k);
              const baseItems = catsByKind(k);
              return (
                <div key={k}>
                  <div className="flex items-center mb-2 px-1 gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider flex-1" style={{ color: TYPE_META[k].color }}>
                      {TYPE_META[k].label}
                    </p>
                  </div>
                  {items.length > 0 && (
                    <div className="bg-card rounded-2xl divide-y divide-divider">
                      {items.map((c, idx) => (
                        <ManageRow key={c.id} icon={c.icon} color={c.color} label={c.label}
                          editMode={false} selected={false}
                          showHandle={editMode}
                          isDragging={c.id === draggingId}
                          onClick={editMode ? () => openCategory(c) : undefined}
                          onHandlePointerDown={editMode ? (y) => startDrag(k, baseItems.indexOf(c), y) : undefined}
                        />
                      ))}
                    </div>
                  )}
                  {editMode && (
                    <button onClick={() => openCategory(undefined, k)}
                      className="w-full mt-2 py-3 rounded-2xl bg-card text-gold text-sm font-semibold active:bg-card-hover">
                      + Aggiungi
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <EditDefSheet
        open={!!editing}
        draft={editing?.draft ?? null}
        withKind={editing?.kind === 'category' && (editing?.withKind ?? true)}
        canDelete={!editing?.isNew}
        onSave={save}
        onDelete={remove}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ManageHeader({ title, editMode, onBack, onToggleEdit, deleteCount, onDelete }: {
  title: string; editMode: boolean; onBack: () => void; onToggleEdit: () => void;
  deleteCount?: number; onDelete?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (!editMode || (deleteCount ?? 0) === 0) setConfirming(false); }, [editMode, deleteCount]);

  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} aria-label="Indietro"
        className="w-9 h-9 -ml-2 flex items-center justify-center text-secondary active:text-primary">
        <ChevronLeft />
      </button>
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] flex-1">{title}</h1>
      {editMode && onDelete && (deleteCount ?? 0) > 0 && (
        confirming
          ? <button onClick={() => { onDelete(); setConfirming(false); }}
              className="text-sm font-semibold text-[#E08B8B] px-2.5 py-1 rounded-xl bg-[#E08B8B]/10">
              Conferma ({deleteCount})
            </button>
          : <button onClick={() => setConfirming(true)}
              className="text-sm font-medium text-[#E08B8B] px-2 py-1">
              Elimina ({deleteCount})
            </button>
      )}
      <button onClick={onToggleEdit} className="text-sm font-medium text-gold px-1">
        {editMode ? 'Fine' : 'Modifica'}
      </button>
    </div>
  );
}

function ManageRow({ icon, color, label, editMode, selected, onClick, showHandle, isDragging, onHandlePointerDown }: {
  icon: string; color: string; label: string;
  editMode: boolean; selected: boolean;
  onClick?: () => void;
  showHandle?: boolean;
  isDragging?: boolean;
  onHandlePointerDown?: (clientY: number) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 p-3.5 text-left transition-all first:rounded-t-2xl last:rounded-b-2xl select-none
        ${onClick ? 'cursor-pointer active:bg-card-hover' : 'cursor-default'}
        ${isDragging ? 'opacity-40' : ''}`}
    >
      {showHandle && (
        <span
          className="w-7 h-7 flex items-center justify-center text-secondary/50 flex-shrink-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={e => { e.preventDefault(); onHandlePointerDown?.(e.clientY); }}
        >
          <GripIcon />
        </span>
      )}
      {editMode && (
        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-gold border-gold' : 'border-divider'}`}>
          {selected && <span className="text-bg text-xs font-bold">✓</span>}
        </span>
      )}
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: color + '22' }}>{icon}</span>
      <span className="flex-1 text-[15px] font-medium text-primary">{label}</span>
      {!!onClick && !showHandle && <ChevronRight />}
    </div>
  );
}

function Row({ icon, color, label, onClick }: { icon: string; color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 p-3.5 text-left active:bg-card-hover transition-colors first:rounded-t-2xl last:rounded-b-2xl">
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: color + '22' }}>{icon}</span>
      <span className="flex-1 text-[15px] font-medium text-primary">{label}</span>
      <ChevronRight />
    </button>
  );
}

function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary flex-shrink-0">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
      <circle cx="4" cy="3" r="1.5"/>
      <circle cx="10" cy="3" r="1.5"/>
      <circle cx="4" cy="8" r="1.5"/>
      <circle cx="10" cy="8" r="1.5"/>
      <circle cx="4" cy="13" r="1.5"/>
      <circle cx="10" cy="13" r="1.5"/>
    </svg>
  );
}
