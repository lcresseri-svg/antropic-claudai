import { useState } from 'react';
import { User } from 'firebase/auth';
import { CategoryDef, AccountDef, TransactionType, TYPE_META, TYPE_ORDER } from '../types';
import { useSettings } from '../settings';
import { EditDefSheet, DefDraft } from './EditDefSheet';

interface Props {
  user: User;
  onLogOut: () => void;
}

const newId = () => `x_${Date.now().toString(36)}`;

export function SettingsScreen({ user, onLogOut }: Props) {
  const { categories, accounts, saveCategories, saveAccounts } = useSettings();
  const [editing, setEditing] = useState<{ kind: 'category' | 'account'; draft: DefDraft; isNew: boolean } | null>(null);

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

  const catsByKind = (k: TransactionType) => categories.filter(c => c.kind === k);

  return (
    <div className="space-y-6 pb-28 animate-fade-in">
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

      {/* Accounts */}
      <Section title="Conti" onAdd={() => openAccount()}>
        <div className="bg-card rounded-2xl divide-y divide-divider">
          {accounts.map(a => (
            <Row key={a.id} icon={a.icon} color={a.color} label={a.label} onClick={() => openAccount(a)} />
          ))}
        </div>
      </Section>

      {/* Categories grouped by kind */}
      <Section title="Categorie" onAdd={() => openCategory()}>
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
                    <Row key={c.id} icon={c.icon} color={c.color} label={c.label} onClick={() => openCategory(c)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <p className="text-center text-xs text-secondary/60 pt-2">Sunny · finanza personale</p>

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

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <button onClick={onAdd} className="text-xs font-medium text-gold">+ Aggiungi</button>
      </div>
      {children}
    </section>
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
