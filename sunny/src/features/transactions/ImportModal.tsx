import { useState, useRef } from 'react';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { Transaction, TransactionType, TYPE_META, typeColor } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { parseDate, parseAmount, parseType, col, MAX_IMPORT_ROWS } from './importParsing';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (txs: Omit<Transaction, 'id'>[]) => void | Promise<void>;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export function ImportModal({ open, onClose, onImport }: Props) {
  // Imports must never resolve to an archived (soft-deleted) definition.
  const { visibleCategories, visibleAccounts, theme } = useSettings();
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<Omit<Transaction, 'id'>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const matchCategory = (val: unknown, type: TransactionType): string => {
    const s = String(val ?? '').toLowerCase().trim();
    const byId = visibleCategories.find(c => c.id === s);
    if (byId) return byId.id;
    const byLabel = visibleCategories.find(c => c.label.toLowerCase() === s);
    if (byLabel) return byLabel.id;
    const partial = visibleCategories.find(c => s && (c.label.toLowerCase().includes(s) || s.includes(c.id)));
    if (partial) return partial.id;
    const fallback = visibleCategories.find(c => c.kind === type);
    return fallback?.id ?? 'altro';
  };

  const matchAccount = (val: unknown): string => {
    const s = String(val ?? '').toLowerCase().trim();
    if (!s) return visibleAccounts[0]?.id ?? 'conto_corrente';
    const byId = visibleAccounts.find(a => a.id === s);
    if (byId) return byId.id;
    const byLabel = visibleAccounts.find(a => a.label.toLowerCase() === s || a.label.toLowerCase().includes(s) || s.includes(a.id));
    return byLabel?.id ?? visibleAccounts[0]?.id ?? 'conto_corrente';
  };

  const reset = () => { setStep('upload'); setParsed([]); setErrors([]); setWarnings([]); setImportError(null); };
  const close = () => { reset(); onClose(); };

  const runImport = async () => {
    setImportError(null);
    setStep('importing');
    try {
      await onImport(parsed);
      setStep('done');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Errore durante l\'importazione');
      setStep('preview');
    }
  };

  const process = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const txs: Omit<Transaction, 'id'>[] = [];
    const errs: string[] = [];
    const warns: string[] = [];
    if (rows.length > MAX_IMPORT_ROWS) {
      setParsed([]);
      setErrors([`Il file contiene ${rows.length} righe: il massimo per importazione è ${MAX_IMPORT_ROWS}. Suddividi il file e riprova.`]);
      setWarnings([]);
      setStep('preview');
      return;
    }
    rows.forEach((row, i) => {
      const dateV = col(row, 'data', 'date');
      const descV = col(row, 'descrizione', 'description', 'causale', 'memo');
      const amtV = col(row, 'importo', 'amount', 'valore', 'value');
      if (!dateV || !descV || amtV === '' || amtV === undefined) {
        errs.push(`Riga ${i + 2}: campi mancanti`); return;
      }
      const date = parseDate(dateV);
      if (!date) { errs.push(`Riga ${i + 2}: data "${String(dateV)}" non valida`); return; }
      const amount = parseAmount(amtV);
      if (!amount || isNaN(amount)) { errs.push(`Riga ${i + 2}: importo non valido`); return; }
      const rawType = col(row, 'tipo', 'type');
      const { type, recognized } = parseType(rawType);
      if (!recognized) warns.push(`Riga ${i + 2}: tipo "${rawType}" non riconosciuto → importato come Uscita`);
      // Optional direction column (written by Sunny's own CSV export): keeps a
      // re-imported withdrawal a withdrawal. Absent → deposit ('in') as always.
      const rawDir = String(col(row, 'direction', 'direzione') ?? '').trim().toLowerCase();
      txs.push({
        date, description: String(descV).trim(), amount, type,
        category: type === 'transfer' ? 'trasferimento' : matchCategory(col(row, 'categoria', 'category'), type),
        account: matchAccount(col(row, 'conto', 'account', 'banca')),
        toAccount: type === 'transfer' ? matchAccount(col(row, 'conto_destinazione', 'destinazione', 'to_account')) : undefined,
        notes: col(row, 'note', 'notes') ? String(col(row, 'note', 'notes')).trim() : undefined,
        ...(type === 'investment' && rawDir === 'out' ? { direction: 'out' as const } : {}),
      });
    });
    setParsed(txs); setErrors(errs); setWarnings(warns); setStep('preview');
  };

  const template = async () => {
    const XLSX = await import('xlsx');
    const headers = ['Data', 'Descrizione', 'Importo', 'Tipo', 'Categoria', 'Conto', 'Conto Destinazione', 'Note'];
    const rows = [
      ['2026-05-01', 'Stipendio', 2400, 'entrata', 'stipendio', 'conto_corrente', '', ''],
      ['2026-05-02', 'Affitto', 750, 'uscita', 'casa', 'conto_corrente', '', ''],
      ['2026-05-04', 'ETF', 500, 'investimento', 'azioni_etf', 'conto_corrente', '', 'PAC'],
      ['2026-05-10', 'Risparmio', 300, 'trasferimento', '', 'conto_corrente', 'conto_risparmio', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 22 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transazioni');
    XLSX.writeFile(wb, 'sunny-template.xlsx');
  };

  useEscapeKey(close, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      <div className="relative w-full max-w-xl glass-elevated rounded-3xl shadow-float max-h-[90vh] flex flex-col animate-sheet-up">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-primary">Importa</h2>
            <p className="text-xs text-secondary mt-0.5">Excel o CSV · .xlsx .xls .csv</p>
          </div>
          <button onClick={close} className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide px-6">
          {step === 'upload' && (
            <div className="space-y-3">
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) process(f); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragging ? 'border-gold bg-gold/5' : 'border-white/[0.10] hover:border-white/[0.20]'}`}>
                <p className="text-3xl mb-3">📂</p>
                <p className="text-sm font-medium text-primary">Trascina il file qui</p>
                <p className="text-xs text-secondary mt-1">oppure tocca per selezionare</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) process(f); }} />
              </div>

              <button onClick={template} className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 text-left active:bg-card-hover transition-colors">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Scarica il template</p>
                  <p className="text-xs text-secondary">Compila e reimporta</p>
                </div>
                <span className="text-gold text-xs font-semibold">Scarica</span>
              </button>

              <div className="glass-card rounded-2xl p-4 text-xs text-secondary leading-relaxed">
                Colonne riconosciute: <b className="text-primary">Data, Descrizione, Importo, Tipo, Categoria, Conto, Conto Destinazione, Note</b>.
                Tipo: entrata / uscita / investimento / trasferimento.
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-primary">
                {parsed.length} transazioni pronte
                {errors.length > 0 && `, ${errors.length} ignorate`}
                {warnings.length > 0 && `, ${warnings.length} con tipo stimato`}
              </p>
              {importError && (
                <div className="bg-[#C0605A]/10 rounded-2xl p-3">
                  <p className="text-xs text-[#C0605A]">Importazione non riuscita: {importError}. Riprova.</p>
                </div>
              )}
              {errors.length > 0 && (
                <div className="bg-[#C0605A]/10 rounded-2xl p-3 max-h-24 overflow-y-auto overscroll-contain space-y-1">
                  {errors.map((e, i) => <p key={i} className="text-xs text-[#C0605A]">{e}</p>)}
                </div>
              )}
              {warnings.length > 0 && (
                <div className="bg-[#E6B95C]/10 rounded-2xl p-3 max-h-24 overflow-y-auto overscroll-contain space-y-1">
                  <p className="text-xs font-medium text-gold mb-1">Tipi non riconosciuti — importati come Uscita:</p>
                  {warnings.map((w, i) => <p key={i} className="text-xs text-[#E6B95C]/80">{w}</p>)}
                </div>
              )}
              {parsed.length > 0 && (
                <div className="glass-card rounded-2xl divide-y divide-white/[0.06] max-h-72 overflow-y-auto overscroll-contain scrollbar-hide">
                  {parsed.slice(0, 60).map((tx, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 text-sm">
                      <span className="text-secondary text-xs w-12 flex-shrink-0">{formatDate(tx.date)}</span>
                      <span className="flex-1 truncate text-primary">{tx.description}</span>
                      <span className="label-caps px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: typeColor(tx.type, theme) + '22', color: typeColor(tx.type, theme) }}>
                        {TYPE_META[tx.type].label}
                      </span>
                      <span className="font-medium balance-num text-xs">{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-10">
              <div className="inline-block animate-spin mb-4" style={{ animationDuration: '1s' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--c-gold))" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5"/>
                </svg>
              </div>
              <p className="text-lg font-semibold text-primary">Importazione in corso…</p>
              <p className="text-sm text-secondary mt-1">Salvataggio di {parsed.length} transazioni</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-lg font-semibold text-primary">Importazione completata</p>
              <p className="text-sm text-secondary mt-1">{parsed.length} transazioni aggiunte</p>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 flex gap-2">
          {step === 'upload' && <button onClick={close} className="flex-1 py-3.5 rounded-2xl bg-elevated text-secondary font-medium">Annulla</button>}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="px-5 py-3.5 rounded-2xl bg-elevated text-secondary font-medium">Indietro</button>
              <button onClick={runImport} disabled={parsed.length === 0}
                className="flex-1 py-3.5 rounded-2xl bg-gold text-bg font-semibold disabled:opacity-40">
                Importa {parsed.length}
              </button>
            </>
          )}
          {step === 'importing' && (
            <button disabled className="flex-1 py-3.5 rounded-2xl bg-gold text-bg font-semibold opacity-60">
              Importazione…
            </button>
          )}
          {step === 'done' && <button onClick={close} className="flex-1 py-3.5 rounded-2xl bg-gold text-bg font-semibold">Chiudi</button>}
        </div>
      </div>
    </div>
  );
}
