import { useState } from 'react';
import { User } from 'firebase/auth';
import { CategoryDef, AccountDef, TransactionType, TYPE_META, TYPE_ORDER } from '../types';
import { useSettings } from '../settings';
import { EditDefSheet, DefDraft } from './EditDefSheet';

interface Props {
  user: User;
  onLogOut: () => void;
  onDeleteAll: () => Promise<void>;
}

const newId = () => `x_${Date.now().toString(36)}`;
type Sub = 'menu' | 'accounts' | 'categories';

export function SettingsScreen({ user, onLogOut, onDeleteAll }: Props) {
  const { categories, accounts, saveCategories, saveAccounts } = useSettings();
  const [sub, setSub] = useState<Sub>('menu');
  const [editing, setEditing] = useState<{ kind: 'category' | 'account'; draft: DefDraft; isNew: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const openCategory = (c?: CategoryDef) => setEditing({
    kind: 'category', isNew: !c,
    draft: c ? { ...c } : { id: newId(), label: '', icon: '•', color: '#8A9270', kind: 'expense' },
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

  const enterSub = (s: Sub) => { setSub(s); setEditMode(false); setSelected(new Set()); };
  const exitToMenu = () => { setSub('menu'); setEditMode(false); setSelected(new Set()); };
  const toggleEditMode = () => { setEditMode(m => !m); setSelected(new Set()); };
  const toggleSel = (id: string) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const bulkDeleteAccounts = () => { saveAccounts(accounts.filter(a => !selected.has(a.id))); setSelected(new Set()); };
  const bulkDeleteCategories = () => { saveCategories(categories.filter(c => !selected.has(c.id))); setSelected(new Set()); };

  const catsByKind = (k: TransactionType) => categories.filter(c => c.kind === k);

  return (
    <div className="space-y-6 pb-28 animate-fade-in">
      {sub === 'menu' && (
        <>
          <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Impostazioni</h1>

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
              {accounts.map(a => (
                <ManageRow key={a.id} icon={a.icon} color={a.color} label={a.label}
                  editMode={editMode} selected={selected.has(a.id)}
                  onClick={() => editMode ? toggleSel(a.id) : openAccount(a)} />
              ))}
            </div>
            {editMode && (
              <EditActions count={selected.size} onAdd={() => openAccount()} onDelete={bulkDeleteAccounts} />
            )}
          </div>
        </>
      )}

      {sub === 'categories' && (
        <>
          <ManageHeader title="Categorie" editMode={editMode} onBack={exitToMenu} onToggleEdit={toggleEditMode} />
          <div className="space-y-4">
            {TYPE_ORDER.filter(k => k !== 'transfer').map(k => {
              const items = catsByKind(k);
              if (items.length === 0) return null;
              return (
                <div key={k}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: TYPE_META[k].color }}>
                    {TYPE_META[k].label}
                  </p>
                  <div className="bg-card rounded-2xl divide-y divide-divider">
                    {items.map(c => (
                      <ManageRow key={c.id} icon={c.icon} color={c.color} label={c.label}
                        editMode={editMode} selected={selected.has(c.id)}
                        onClick={() => editMode ? toggleSel(c.id) : openCategory(c)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {editMode && (
              <EditActions count={selected.size} onAdd={() => openCategory()} onDelete={bulkDeleteCategories} />
            )}
          </div>
        </>
      )}

      <EditDefSheet
        open={!!editing}
        draft={editing?.draft ?? null}
        withKind={editing?.kind === 'category'}
        canDelete={!editing?.isNew}
        onSave={save}
        onDelete={remove}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ManageHeader({ title, editMode, onBack, onToggleEdit }: {
  title: string; editMode: boolean; onBack: () => void; onToggleEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} aria-label="Indietro"
        className="w-9 h-9 -ml-2 flex items-center justify-center text-secondary active:text-primary">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] flex-1">{title}</h1>
      <button onClick={onToggleEdit} className="text-sm font-medium text-gold px-1">
        {editMode ? 'Fine' : 'Modifica'}
      </button>
    </div>
  );
}

function EditActions({ count, onAdd, onDelete }: { count: number; onAdd: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onAdd} className="flex-1 py-3 rounded-2xl bg-card text-gold text-sm font-semibold active:bg-card-hover">
        + Aggiungi
      </button>
      <button onClick={onDelete} disabled={count === 0}
        className="flex-1 py-3 rounded-2xl bg-[#E08B8B]/15 text-[#E08B8B] text-sm font-semibold disabled:opacity-40">
        Elimina{count > 0 ? ` (${count})` : ''}
      </button>
    </div>
  );
}

function ManageRow({ icon, color, label, editMode, selected, onClick }: {
  icon: string; color: string; label: string; editMode: boolean; selected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3.5 p-3.5 text-left active:bg-card-hover transition-colors first:rounded-t-2xl last:rounded-b-2xl">
      {editMode && (
        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-gold border-gold' : 'border-divider'}`}>
          {selected && <span className="text-bg text-xs font-bold">✓</span>}
        </span>
      )}
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: color + '22' }}>{icon}</span>
      <span className="flex-1 text-[15px] font-medium text-primary">{label}</span>
      {!editMode && <span className="text-secondary text-sm">›</span>}
    </button>
  );
}

function Row({ icon, color, label, onClick }: { icon: string; color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 p-3.5 text-left active:bg-card-hover transition-colors first:rounded-t-2xl last:rounded-b-2xl">
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: color + '22' }}>{icon}</span>
      <span className="flex-1 text-[15px] font-medium text-primary">{label}</span>
      <span className="text-secondary text-sm">›</span>
    </button>
  );
}
