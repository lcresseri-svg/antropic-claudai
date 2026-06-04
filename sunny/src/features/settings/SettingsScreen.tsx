import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from 'firebase/auth';
import { CategoryDef, AccountDef, Transaction, TransactionType, TYPE_META, TYPE_ORDER, typeColor } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { usePush } from '../../shared/hooks/usePush';
import { EditDefSheet, DefDraft } from './EditDefSheet';
import { buildExportPayload, downloadJson, downloadCsv } from './dataExport';
import { APP_VERSION, APP_CHANNEL, VERSIONS } from '../../appInfo';

interface Props {
  user: User;
  transactions: Transaction[];
  onLogOut: () => void;
  onDeleteAll: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

const newId = () => `x_${Date.now().toString(36)}`;
type Sub = 'menu' | 'generali' | 'gestione' | 'dati' | 'accounts' | 'categories' | 'info' | 'versioni';

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

export function SettingsScreen({ user, transactions, onLogOut, onDeleteAll, onDeleteAccount }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { categories, accounts, theme, includeInvestments, enableInvestments, enableBudget, insightDepth, aiEnabled, aiCoachWidgetEnabled, detailedInvestments, saveCategories, saveAccounts, saveTheme, saveIncludeInvestments, saveEnableInvestments, saveEnableBudget, saveInsightDepth, saveAiEnabled, saveAiCoachWidgetEnabled } = useSettings();
  const [sub, setSub] = useState<Sub>('menu');
  const [editing, setEditing] = useState<{ kind: 'category' | 'account'; draft: DefDraft; isNew: boolean; withKind?: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const push = usePush(user);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Deep-link support: e.g. /settings?section=generali jumps straight to a
  // sub-section (used by the "Attiva budget" shortcut on the disabled screen).
  useEffect(() => {
    const s = new URLSearchParams(location.search).get('section');
    const valid: Sub[] = ['generali', 'gestione', 'dati', 'accounts', 'categories', 'info', 'versioni'];
    if (s && (valid as string[]).includes(s)) setSub(s as Sub);
  }, [location.search]);

  const exportJson = () => downloadJson(buildExportPayload(user, categories, accounts, transactions));
  const exportCsv = () => downloadCsv(transactions);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await onDeleteAccount();
      // On success onAuthStateChanged fires null and the app returns to login.
    } catch {
      setDeleteError('Eliminazione non riuscita. Potrebbe servire un nuovo accesso: riprova.');
      setDeletingAccount(false);
      setConfirmDeleteAccount(false);
    }
  };

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
      const kind = d.kind ?? 'expense';
      const def: CategoryDef = { id: d.id, label: d.label, icon: d.icon, color: d.color, kind,
        ...(kind === 'investment' && d.initialBalance !== undefined ? { initialBalance: d.initialBalance } : {}),
        ...(kind === 'investment' && d.fundType ? { fundType: d.fundType } : {}),
        ...(kind === 'investment' && d.fundType === 'pension' && d.tfrAmount !== undefined ? { tfrAmount: d.tfrAmount } : {}) };
      saveCategories(editing.isNew ? [...categories, def] : categories.map(c => c.id === d.id ? def : c));
    } else {
      const def: AccountDef = { id: d.id, label: d.label, icon: d.icon, color: d.color,
        ...(d.initialBalance !== undefined ? { initialBalance: d.initialBalance } : {}),
        ...(d.isInvestment ? { isInvestment: true } : {}) };
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
  const exitToGestione = () => { setSub('gestione'); setEditMode(false); };
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

          {/* Main entries */}
          <div className="bg-card rounded-2xl divide-y divide-divider md:bg-transparent md:divide-y-0 md:grid md:grid-cols-2 md:gap-3">
            <Row icon="⚙️" color="#8B8B8B" label="Generali" sub="Tema, patrimonio" onClick={() => enterSub('generali')} />
            <Row icon="🗂️" color="#6FA8DC" label="Gestione" sub="Conti e categorie" onClick={() => enterSub('gestione')} />
            <Row icon="💾" color="#8A9270" label="Dati" sub="Esporta, elimina" onClick={() => enterSub('dati')} />
            <Row icon="ℹ️" color="#88B0C0" label="Come funziona" sub="Calcoli e formule" onClick={() => enterSub('info')} />
          </div>

          <div className="text-center pt-2 space-y-1.5">
            <p className="text-xs text-secondary/60 flex items-center justify-center gap-1.5">
              Sunny · finanza personale · v{APP_VERSION}
              {APP_CHANNEL === 'beta' && (
                <span className="px-1.5 py-0.5 rounded-md bg-gold/15 text-gold text-[10px] font-semibold tracking-wide uppercase">beta</span>
              )}
            </p>
            <button onClick={() => enterSub('versioni')} className="text-xs font-medium text-gold">Registro versioni</button>
          </div>
        </>
      )}

      {sub === 'generali' && (
        <>
          <ManageHeader title="Generali" editMode={false} onBack={exitToMenu} onToggleEdit={() => {}} hideEdit />
          <div className="space-y-5 md:max-w-xl">

            <SettingsGroup title="Aspetto">
              <ToggleRow
                icon="🌙" label="Tema scuro"
                sub={theme === 'dark' ? 'Attivo' : 'Non attivo'}
                on={theme === 'dark'}
                onToggle={() => saveTheme(theme === 'dark' ? 'light' : 'dark')}
              />
            </SettingsGroup>

            <SettingsGroup title="Funzionalità">
              <ToggleRow
                icon="📊" label="Gestione investimenti"
                sub={enableInvestments ? 'Investi e tieni traccia del tuo portafoglio' : 'Investimenti nascosti da tutta l\'app'}
                on={enableInvestments}
                onToggle={() => saveEnableInvestments(!enableInvestments)}
              />
              {enableInvestments && (
                <ToggleRow
                  icon="📈" label="Includi investito nel patrimonio"
                  sub={includeInvestments ? 'Il patrimonio comprende il capitale investito' : 'Il patrimonio mostra solo la liquidità'}
                  on={includeInvestments}
                  onToggle={() => saveIncludeInvestments(!includeInvestments)}
                />
              )}
              <ToggleRow
                icon="🎯" label="Gestione budget"
                sub={enableBudget ? 'Obiettivi, limiti di spesa e previsioni' : 'Budget nascosto — la scheda resta per riattivarlo'}
                on={enableBudget}
                onToggle={() => saveEnableBudget(!enableBudget)}
              />
            </SettingsGroup>

            <SettingsGroup title="Analisi e AI">
              <ToggleRow
                icon="✨" label="Suggerimenti AI"
                sub={aiEnabled ? 'Riepilogo mensile generato da Gemini' : 'Disattivato — nessuna chiamata all\'API'}
                on={aiEnabled}
                onToggle={() => saveAiEnabled(!aiEnabled)}
              />
              {detailedInvestments && (
                <ToggleRow
                  icon="🤖" label="AI Coach (bottone chat)"
                  sub={aiCoachWidgetEnabled ? 'Bottone flottante visibile in tutte le schermate' : 'Bottone nascosto'}
                  on={aiCoachWidgetEnabled}
                  onToggle={() => saveAiCoachWidgetEnabled(!aiCoachWidgetEnabled)}
                />
              )}
              <div className="p-4">
                <div className="flex items-start gap-3.5 mb-3">
                  <span className="text-2xl mt-0.5">🔍</span>
                  <div>
                    <p className="text-sm font-medium text-primary">Livello di analisi</p>
                    <p className="text-xs text-secondary mt-0.5">
                      {insightDepth === 'minimal'
                        ? 'Solo scadenze ricorrenti'
                        : insightDepth === 'medium'
                        ? 'Previsioni e confronti principali'
                        : 'Analisi completa con trend e statistiche'}
                    </p>
                  </div>
                </div>
                <div className="flex rounded-xl bg-elevated p-0.5 gap-0.5">
                  {(['minimal', 'medium', 'advanced'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => saveInsightDepth(d)}
                      className={`flex-1 py-2 rounded-[10px] text-[13px] font-medium transition-colors ${
                        insightDepth === d ? 'bg-gold text-bg' : 'text-secondary active:text-primary'
                      }`}
                    >
                      {d === 'minimal' ? 'Minimal' : d === 'medium' ? 'Media' : 'Smanettone'}
                    </button>
                  ))}
                </div>
              </div>
            </SettingsGroup>

            {push.supported && (
              <SettingsGroup title="Notifiche">
                <ToggleRow
                  icon="🔔" label="Notifiche push"
                  sub={
                    !push.supported ? 'Non supportate su questo dispositivo'
                    : push.enabled ? 'Attive su questo dispositivo'
                    : 'Promemoria spese, ricorrenti e riepilogo mensile'
                  }
                  on={push.enabled}
                  onToggle={async () => {
                    if (push.busy) return;
                    setPushMsg(null);
                    if (push.enabled) { await push.disable(); return; }
                    const res = await push.enable();
                    if (!res.ok) setPushMsg(pushReason(res.reason));
                  }}
                />
                {pushMsg && <p className="text-xs text-[#E08B8B] px-4 -mt-1 pb-3">{pushMsg}</p>}
                {push.enabled && (
                  <>
                    <ToggleRow
                      icon="📝" label="Promemoria spese"
                      sub="A metà giornata e la sera, se non hai ancora registrato nulla"
                      on={push.reminders.logExpenses}
                      onToggle={() => push.setReminder('logExpenses', !push.reminders.logExpenses)}
                    />
                    <ToggleRow
                      icon="🔁" label="Voci ricorrenti"
                      sub="Quando una ricorrenza viene registrata automaticamente"
                      on={push.reminders.recurring}
                      onToggle={() => push.setReminder('recurring', !push.reminders.recurring)}
                    />
                    <ToggleRow
                      icon="📊" label="Riepilogo mensile"
                      sub="A inizio mese, il resoconto del mese precedente"
                      on={push.reminders.monthly}
                      onToggle={() => push.setReminder('monthly', !push.reminders.monthly)}
                    />
                    <div className="p-4 space-y-2">
                      <button
                        onClick={async () => {
                          if (testing) return;
                          setTesting(true); setTestMsg(null);
                          const res = await push.test();
                          setTesting(false);
                          setTestMsg(res.ok ? '✅ Notifica inviata' : testReason(res.reason));
                        }}
                        className="w-full py-3 rounded-xl bg-elevated text-gold text-sm font-semibold active:scale-[0.98] transition-transform">
                        {testing ? 'Invio…' : 'Invia notifica di prova'}
                      </button>
                      {testMsg && <p className="text-xs text-secondary px-1">{testMsg}</p>}
                    </div>
                  </>
                )}
              </SettingsGroup>
            )}
          </div>
        </>
      )}

      {sub === 'gestione' && (
        <>
          <ManageHeader title="Gestione" editMode={false} onBack={exitToMenu} onToggleEdit={() => {}} hideEdit />
          <div className="bg-card rounded-2xl divide-y divide-divider md:bg-transparent md:divide-y-0 md:grid md:grid-cols-2 md:gap-3">
            <Row icon="🏦" color="#6FA8DC" label="Gestisci conti" sub="Saldi iniziali, ordine" onClick={() => enterSub('accounts')} />
            <Row icon="🏷️" color="#8A9270" label="Gestisci categorie" sub="Icone, colori, tipo" onClick={() => enterSub('categories')} />
          </div>
        </>
      )}

      {sub === 'dati' && (
        <>
          <ManageHeader title="Dati" editMode={false} onBack={exitToMenu} onToggleEdit={() => {}} hideEdit />
          <div className="space-y-4 md:max-w-xl">
            <div className="bg-card rounded-2xl divide-y divide-divider">
              <button onClick={exportJson}
                className="w-full flex items-center gap-3.5 p-4 text-left active:bg-card-hover first:rounded-t-2xl">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: '#6FA8DC22' }}>📦</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Esporta JSON</p>
                  <p className="text-xs text-secondary">Transazioni, categorie e conti</p>
                </div>
                <span className="text-secondary text-sm">↓</span>
              </button>
              <button onClick={exportCsv}
                className="w-full flex items-center gap-3.5 p-4 text-left active:bg-card-hover last:rounded-b-2xl">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: '#8A927022' }}>📄</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Esporta CSV</p>
                  <p className="text-xs text-secondary">Apribile in Excel o Fogli Google</p>
                </div>
                <span className="text-secondary text-sm">↓</span>
              </button>
            </div>

            <div className="bg-card rounded-2xl divide-y divide-divider">
              {confirmReset ? (
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium text-primary">Eliminare tutte le transazioni?</p>
                  <p className="text-xs text-secondary">Categorie e conti restano. Questa azione è irreversibile.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmReset(false)}
                      className="flex-1 py-2.5 rounded-xl bg-elevated text-secondary text-sm font-medium">Annulla</button>
                    <button onClick={async () => { await onDeleteAll(); setConfirmReset(false); }}
                      className="flex-1 py-2.5 rounded-xl bg-red/15 text-red text-sm font-semibold">Elimina tutto</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)}
                  className="w-full flex items-center gap-3.5 p-4 text-left active:bg-card-hover first:rounded-t-2xl">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 bg-red/10">🗑</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red">Elimina transazioni</p>
                    <p className="text-xs text-secondary">Categorie e conti restano</p>
                  </div>
                </button>
              )}

              {confirmDeleteAccount ? (
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium text-primary">Eliminare definitivamente l'account?</p>
                  <p className="text-xs text-secondary">
                    Verranno cancellati tutti i tuoi dati e il tuo accesso. Irreversibile.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDeleteAccount(false)} disabled={deletingAccount}
                      className="flex-1 py-2.5 rounded-xl bg-elevated text-secondary text-sm font-medium disabled:opacity-40">Annulla</button>
                    <button onClick={handleDeleteAccount} disabled={deletingAccount}
                      className="flex-1 py-2.5 rounded-xl bg-red/15 text-red text-sm font-semibold disabled:opacity-50">
                      {deletingAccount ? 'Eliminazione…' : 'Elimina account'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setConfirmDeleteAccount(true); setDeleteError(null); }}
                  className="w-full flex items-center gap-3.5 p-4 text-left active:bg-card-hover last:rounded-b-2xl">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 bg-red/10">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red">Elimina account</p>
                    <p className="text-xs text-secondary">Tutti i dati verranno rimossi</p>
                  </div>
                </button>
              )}
            </div>
            {deleteError && <p className="text-xs text-red px-1">{deleteError}</p>}
          </div>
        </>
      )}

      {sub === 'accounts' && (
        <>
          <ManageHeader title="Conti" editMode={editMode} onBack={exitToGestione} onToggleEdit={toggleEditMode} />
          <div className="space-y-3 md:max-w-xl">
            <div className="bg-card rounded-2xl divide-y divide-divider">
              {liveAccounts.map((a) => (
                <ManageRow key={a.id} icon={a.icon} color={a.color} label={a.label}
                  editMode={false} selected={false}
                  showHandle={editMode}
                  isDragging={a.id === draggingId}
                  onClick={editMode ? undefined : () => openAccount(a)}
                  onHandlePointerDown={editMode ? (y) => startDrag('accounts', accounts.indexOf(a), y) : undefined}
                />
              ))}
            </div>
            {!editMode && (
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
          <ManageHeader title="Categorie" editMode={editMode} onBack={exitToGestione} onToggleEdit={toggleEditMode} />
          <div className="space-y-4 md:max-w-xl">
            {TYPE_ORDER.filter(k => k !== 'transfer').map(k => {
              const items = liveCats(k);
              const baseItems = catsByKind(k);
              return (
                <div key={k}>
                  <div className="flex items-center mb-2 px-1 gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider flex-1" style={{ color: typeColor(k, theme) }}>
                      {TYPE_META[k].label}
                    </p>
                  </div>
                  {items.length > 0 && (
                    <div className="bg-card rounded-2xl divide-y divide-divider">
                      {items.map((c) => (
                        <ManageRow key={c.id} icon={c.icon} color={c.color} label={c.label}
                          editMode={false} selected={false}
                          showHandle={editMode}
                          isDragging={c.id === draggingId}
                          onClick={editMode ? undefined : () => openCategory(c)}
                          onHandlePointerDown={editMode ? (y) => startDrag(k, baseItems.indexOf(c), y) : undefined}
                        />
                      ))}
                    </div>
                  )}
                  {!editMode && (
                    <button onClick={() => openCategory(undefined, k)}
                      className="w-full mt-2 py-3 rounded-2xl bg-card text-gold text-sm font-semibold active:bg-card-hover">
                      + Aggiungi {TYPE_META[k].label.toLowerCase()}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {sub === 'info' && (
        <>
          <ManageHeader title="Come funziona" editMode={false} onBack={exitToMenu} onToggleEdit={() => {}} hideEdit />
          <div className="space-y-3 md:max-w-2xl">
            <p className="text-[13px] text-secondary px-1 leading-relaxed">
              Sunny non indovina nulla: ogni numero nasce dai tuoi movimenti. Ecco, in parole semplici, come vengono calcolate le cose principali.
            </p>
            <InfoBlock icon="💰" title="Patrimonio netto">
              È la somma dei saldi di tutti i conti (liquidità) più, se hai attivato l'opzione in Generali, il capitale investito. In formula: <b>liquidità + investito</b>.
            </InfoBlock>
            <InfoBlock icon="🏦" title="Saldo di un conto">
              Parte dal <b>saldo iniziale</b> che imposti e poi applica tutta la storia: <b>+ entrate − uscite − investimenti partiti da quel conto ± trasferimenti</b>. La liquidità totale è la somma dei saldi di tutti i conti.
            </InfoBlock>
            <InfoBlock icon="📈" title="Capitale investito">
              È la somma di tutte le transazioni di tipo "investimento", più l'eventuale <b>capitale già investito</b> impostato nelle categorie di investimento (quello che avevi prima di usare Sunny).
            </InfoBlock>
            <InfoBlock icon="✨" title="Risparmio del periodo">
              <b>Entrate − Uscite − Investimenti</b>. Attenzione: anche gli investimenti vengono sottratti, quindi il risparmio può essere negativo pur avendo entrate maggiori delle uscite (i soldi non sono spariti, sono investiti). In quel caso compare un "!".
            </InfoBlock>
            <InfoBlock icon="🔮" title="Previsione di fine mese">
              Le <b>uscite previste</b> separano due cose: le <b>spese variabili</b> e quelle <b>ricorrenti</b>. Per le variabili stimiamo i giorni che restano combinando la tua <b>media di spesa variabile</b> (mesi recenti, più la media di questo stesso mese negli anni scorsi quando ci sono abbastanza dati) con il <b>ritmo effettivo di questo mese</b>: a inizio mese conta soprattutto la media, col passare dei giorni conta sempre più quanto stai spendendo davvero. Alle variabili aggiungiamo poi <b>esplicitamente le spese ricorrenti ancora in arrivo</b> entro fine mese (così un addebito fisso non ancora pagato, come l'affitto, è sempre incluso). Il totale non scende mai sotto quanto hai già speso. Se non c'è storico, si riproietta semplicemente il ritmo attuale. Le <b>entrate previste</b> sono la cifra più alta tra quanto hai già incassato e quanto incassi di solito (lo stipendio spesso arriva tutto insieme). Il risparmio stimato è <b>entrate previste − uscite previste − investimenti previsti</b>. La stessa formula è usata sia negli Insight sia nei Consigli del Budget, così non si contraddicono. Una <b>spesa eccezionale</b> (un acquisto grosso e occasionale) viene smussata, così un singolo mese fuori scala non gonfia la media. La stessa stima è calcolata anche <b>per ogni categoria di spesa</b>: nel Budget vedi "Stima fine mese ~€…" sotto ogni voce, con un avviso se supererà il limite.
            </InfoBlock>
            <InfoBlock icon="📊" title="Media storica e proiezioni">
              Quando parliamo di "media" intendiamo la media mensile sugli <b>ultimi mesi con dati</b> (di solito gli ultimi 3): i mesi vuoti non abbassano la media. La proiezione annuale è semplicemente la media mensile × 12.
            </InfoBlock>
            <InfoBlock icon="📈" title="Tendenze">
              Confrontiamo i valori mese per mese e guardiamo se, nel complesso, salgono o scendono in modo costante. Per restare attuali consideriamo solo gli <b>ultimi ~18 mesi</b>: abitudini molto vecchie non sono rappresentative di oggi.
            </InfoBlock>
            <InfoBlock icon="🗓️" title="Stagionalità e anno-su-anno">
              Confrontiamo lo stesso mese in anni diversi (entro 18 mesi) per cogliere i periodi in cui una categoria sale di solito (es. regali a dicembre). Se la spesa media in quel mese supera di almeno il 40% la tua media mensile per quella categoria, te lo segnaliamo — e ne teniamo conto nel budget suggerito.
            </InfoBlock>
            <InfoBlock icon="🎯" title="Budget suggerito">
              Parte dalla media mensile degli ultimi ~3 mesi per categoria, arrotondata. Se il mese corrente è storicamente più pesante per una categoria, il suggerimento viene <b>alzato al livello stagionale</b>.
            </InfoBlock>
          </div>
        </>
      )}

      {sub === 'versioni' && (
        <>
          <ManageHeader title="Registro versioni" editMode={false} onBack={exitToMenu} onToggleEdit={() => {}} hideEdit />
          <div className="space-y-3 md:max-w-2xl">
            {APP_CHANNEL === 'beta' && (
              <div className="glass-card rounded-2xl px-4 py-3 flex items-start gap-2.5 border border-gold/15">
                <span className="text-gold">🧪</span>
                <p className="text-[13px] text-secondary leading-snug">
                  Versione <b className="text-primary">beta</b>: l'app è ancora in sviluppo e queste versioni non sono ancora ufficiali.
                </p>
              </div>
            )}
            {VERSIONS.map(v => (
              <div key={v.version} className="bg-card rounded-2xl p-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-bold text-primary">v{v.version}</span>
                  <span className="text-[13px] text-primary flex-1">{v.title}</span>
                  <span className="text-[11px] text-secondary balance-num">{v.date}</span>
                </div>
                <ul className="space-y-1.5">
                  {v.changes.map((c, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-secondary leading-snug">
                      <span className="text-gold flex-shrink-0">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <EditDefSheet
        open={!!editing}
        draft={editing?.draft ?? null}
        withKind={editing?.kind === 'category' && (editing?.withKind ?? true)}
        canDelete={!editing?.isNew}
        showFundType={detailedInvestments}
        onSave={save}
        onDelete={remove}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ManageHeader({ title, editMode, onBack, onToggleEdit, hideEdit, deleteCount, onDelete }: {
  title: string; editMode: boolean; onBack: () => void; onToggleEdit: () => void;
  hideEdit?: boolean; deleteCount?: number; onDelete?: () => void;
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
      {!hideEdit && editMode && onDelete && (deleteCount ?? 0) > 0 && (
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
      {!hideEdit && (
        <button onClick={onToggleEdit} className="text-sm font-medium text-gold px-1">
          {editMode ? 'Fine' : 'Riordina'}
        </button>
      )}
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

function InfoBlock({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl p-4 flex gap-3.5">
      <span className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: 'rgba(136,176,192,0.14)' }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary mb-1">{title}</p>
        <p className="text-[13px] text-secondary leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-caps text-secondary mb-2 px-1">{title}</p>
      <div className="bg-card rounded-2xl divide-y divide-divider overflow-hidden">{children}</div>
    </div>
  );
}

function Row({ icon, color, label, sub, onClick }: { icon: string; color: string; label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3.5 p-3.5 text-left transition-colors active:bg-card-hover first:rounded-t-2xl last:rounded-b-2xl
        md:flex-col md:items-start md:gap-3 md:p-5 md:rounded-2xl md:bg-card md:border md:border-divider md:hover:bg-card-hover md:h-full">
      <span className="w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center text-base md:text-xl flex-shrink-0" style={{ backgroundColor: color + '22' }}>{icon}</span>
      <span className="flex-1 md:flex-none">
        <span className="block text-[15px] font-medium text-primary">{label}</span>
        {sub && <span className="hidden md:block text-xs text-secondary mt-0.5">{sub}</span>}
      </span>
      <span className="md:hidden"><ChevronRight /></span>
    </button>
  );
}

function ToggleRow({ icon, label, sub, on, onToggle }: {
  icon: string; label: string; sub: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 p-4">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary">{label}</p>
        <p className="text-xs text-secondary">{sub}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative flex-shrink-0 w-[46px] h-[26px] rounded-full transition-colors duration-200 ${on ? 'bg-gold' : 'bg-secondary/25'}`}
        aria-label={label}
      >
        <span className={`absolute left-0 top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-[23px]' : 'translate-x-[3px]'}`} />
      </button>
    </div>
  );
}

function testReason(reason?: string): string {
  switch (reason) {
    case 'not-deployed': return 'Il server non è ancora pronto (deploy delle funzioni in corso). Riprova più tardi.';
    case 'no-tokens':    return 'Nessun dispositivo registrato. Riattiva le notifiche e riprova.';
    case 'network':      return 'Niente rete. Controlla la connessione e riprova.';
    default:             return 'Invio non riuscito. Riprova tra poco.';
  }
}

function pushReason(reason: string): string {
  switch (reason) {
    case 'denied':      return 'Permesso negato. Abilita le notifiche dalle impostazioni del browser.';
    case 'unsupported': return 'Notifiche non supportate qui. Su iPhone installa prima l\'app sulla schermata Home.';
    case 'no-vapid':    return 'Configurazione push non ancora pronta. Riprova più tardi.';
    case 'no-token':    return 'Non è stato possibile registrare il dispositivo. Riprova.';
    default:            return 'Attivazione non riuscita. Riprova.';
  }
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
