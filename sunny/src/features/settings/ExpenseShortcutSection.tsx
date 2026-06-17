// Admin-only UI for the iOS "Expense Shortcut": generate a token (copied to the
// clipboard + opens the Shortcut import link) and manage existing tokens
// (list + revoke). Rendered inside the Settings "shortcut" sub-screen, which is
// itself gated to the admin. Dark-premium styling consistent with Settings.

import { useState, useEffect, useCallback } from 'react';
import {
  issueExpenseToken, listExpenseTokens, revokeExpenseToken,
  shortcutErrorMsg, SUNNY_EXPENSE_SHORTCUT_URL, ExpenseTokenMeta,
} from './expenseShortcut';

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ExpenseShortcutSection() {
  const [tokens, setTokens] = useState<ExpenseTokenMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setListError(null);
    const res = await listExpenseTokens();
    if (res.ok) setTokens(res.tokens); else setListError(shortcutErrorMsg(res.error));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard may be unavailable — the token is shown for manual copy */ }
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true); setGenError(null); setNewToken(null); setCopied(false);
    const res = await issueExpenseToken(label.trim());
    setGenerating(false);
    if (!res.ok) { setGenError(shortcutErrorMsg(res.error)); return; }
    setNewToken(res.token);
    await copy(res.token);
    setLabel('');
    // Open the published Shortcut so it can be imported; the token is on the
    // clipboard, ready to paste into the import question.
    try { window.open(SUNNY_EXPENSE_SHORTCUT_URL, '_blank', 'noopener'); } catch { /* ignore */ }
    refresh();
  };

  const doRevoke = async (id: string) => {
    setRevoking(id);
    const res = await revokeExpenseToken(id);
    setRevoking(null); setConfirmId(null);
    if (res.ok) refresh();
  };

  return (
    <div className="space-y-4 md:max-w-xl">
      <p className="text-[13px] text-secondary px-1 leading-relaxed">
        Aggiungi una spesa al volo da iOS con una Shortcut, senza aprire l'app. Genera un token,
        importa la Shortcut e incolla il token quando richiesto. Il token vale solo per aggiungere
        spese e può essere revocato in qualsiasi momento.
      </p>

      {/* Generate */}
      <div className="bg-card rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-xs text-secondary block mb-1.5 px-0.5">Etichetta (opzionale)</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Es. iPhone di Luca"
            maxLength={60}
            className="w-full bg-elevated rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-tertiary outline-none focus:ring-1 focus:ring-gold/40"
          />
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="w-full py-3 rounded-xl bg-gold text-bg text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {generating ? 'Generazione…' : 'Genera token e apri la Shortcut'}
        </button>
        {genError && <p className="text-xs text-red px-0.5">{genError}</p>}
      </div>

      {/* Freshly-minted token — shown ONCE */}
      {newToken && (
        <div className="bg-card rounded-2xl p-4 space-y-3 border border-gold/20">
          <div className="flex items-center gap-2">
            <span className="text-gold">🔑</span>
            <p className="text-sm font-semibold text-primary">Token generato</p>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            Copialo ora: per sicurezza non sarà più mostrato. {copied ? 'È già negli appunti.' : ''}
          </p>
          <code className="block bg-elevated rounded-xl px-3 py-2.5 text-[12px] text-primary break-all select-all">
            {newToken}
          </code>
          <button
            onClick={() => copy(newToken)}
            className="w-full py-2.5 rounded-xl bg-elevated text-gold text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            {copied ? '✓ Copiato' : 'Copia token'}
          </button>
          <ol className="text-xs text-secondary space-y-1.5 list-decimal list-inside leading-relaxed pt-1">
            <li>Si apre il link della Shortcut: tocca «Aggiungi Shortcut».</li>
            <li>Quando l'import chiede il token, incollalo (è negli appunti).</li>
            <li>Lancia la Shortcut per aggiungere una spesa.</li>
          </ol>
        </div>
      )}

      {/* Existing tokens */}
      <div>
        <p className="label-caps text-secondary mb-2 px-1">Token attivi</p>
        {loading ? (
          <div className="bg-card rounded-2xl px-5 py-8 text-center text-secondary text-[13px]">Caricamento…</div>
        ) : listError ? (
          <div className="bg-card rounded-2xl px-5 py-6 text-center space-y-3">
            <p className="text-[13px] text-secondary">{listError}</p>
            <button onClick={refresh} className="text-sm font-semibold text-gold">Riprova</button>
          </div>
        ) : tokens.length === 0 ? (
          <div className="bg-card rounded-2xl px-5 py-8 text-center text-secondary text-[13px]">
            Nessun token ancora. Generane uno qui sopra.
          </div>
        ) : (
          <div className="bg-card rounded-2xl divide-y divide-divider">
            {tokens.map(t => (
              <div key={t.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${t.revoked ? 'text-tertiary line-through' : 'text-primary'}`}>
                      {t.label || 'Token'}
                    </p>
                    <p className="text-[11px] text-secondary mt-0.5">
                      Creato {fmtDate(t.createdAt)} · Ultimo uso {fmtDate(t.lastUsedAt)}
                    </p>
                  </div>
                  {t.revoked ? (
                    <span className="text-[11px] text-tertiary flex-shrink-0">Revocato</span>
                  ) : confirmId === t.id ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => setConfirmId(null)} disabled={revoking === t.id}
                        className="text-[12px] font-medium text-secondary px-2 py-1 rounded-lg bg-elevated disabled:opacity-40">
                        Annulla
                      </button>
                      <button onClick={() => doRevoke(t.id)} disabled={revoking === t.id}
                        className="text-[12px] font-semibold text-red px-2 py-1 rounded-lg bg-red/10 disabled:opacity-50">
                        {revoking === t.id ? '…' : 'Conferma'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(t.id)}
                      className="text-[12px] font-medium text-red px-2 py-1 flex-shrink-0">
                      Revoca
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
