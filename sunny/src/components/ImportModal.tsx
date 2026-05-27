import { useState, useRef } from 'react';
import { Transaction, TransactionType, TYPE_META } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { useSettings } from '../settings';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (txs: Omit<Transaction, 'id'>[]) => void;
}

type Step = 'upload' | 'preview' | 'done';

function parseDate(val: unknown): string {
  if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function parseAmount(val: unknown): number {
  return Math.abs(parseFloat(String(val ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.')));
}

function parseType(val: unknown): { type: TransactionType; recognized: boolean } {
  const s = String(val ?? '').toLowerCase().trim();
  if (!s) return { type: 'expense', recognized: true };
  if (/entrat|income|ricav|accredit|stipend|salari|rimborso/.test(s)) return { type: 'income', recognized: true };
  if (/invest|etf|azion|fond/.test(s)) return { type: 'investment', recognized: true };
  if (/trasfer|moviment|transfer|bonifico|girocont/.test(s)) return { type: 'transfer', recognized: true };
  if (/uscit|spesa|pagament|expense|cost|acquist|prelievo/.test(s)) return { type: 'expense', recognized: true };
  return { type: 'expense', recognized: false };
}

const norm = (k: string) => k.toLowerCase().trim().replace(/\s+/g, '_');
function col(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    const k = Object.keys(row).find(x => norm(x) === n);
    if (k !== undefined) return row[k];
  }
  return undefined;
}

export function ImportModal({ open, onClose, onImport }: Props) {
  const { categories, accounts } = useSettings();
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<Omit<Transaction, 'id'>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const matchCategory = (val: unknown, type: TransactionType): string => {
    const s = String(val ?? '').toLowerCase().trim();
    const byId = categories.find(c => c.id === s);
    if (byId) return byId.id;
    const byLabel = categories.find(c => c.label.toLowerCase() === s);
    if (byLabel) return byLabel.id;
    const partial = categories.find(c => s && (c.label.toLowerCase().includes(s) || s.includes(c.id)));
    if (partial) return partial.id;
    const fallback = categories.find(c => c.kind === type);
    return fallback?.id ?? 'altro';
  };

  const matchAccount = (val: unknown): string => {
    const s = String(val ?? '').toLowerCase().trim();
    if (!s) return accounts[0]?.id ?? 'conto_corrente';
    const byId = accounts.find(a => a.id === s);
    if (byId) return byId.id;
    const byLabel = accounts.find(a => a.label.toLowerCase() === s || a.label.toLowerCase().includes(s) || s.includes(a.id));
    return byLabel?.id ?? accounts[0]?.id ?? 'conto_corrente';
  };

  const reset = () => { setStep('upload'); setParsed([]); setErrors([]); setWarnings([]); };
  const close = () => { reset(); onClose(); };

  const process = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const txs: Omit<Transaction, 'id'>[] = [];
    const errs: string[] = [];
    const warns: string[] = [];
    rows.forEach((row, i) => {
      const dateV = col(row, 'data', 'date');
      const descV = col(row, 'descrizione', 'description', 'causale', 'memo');
      const amtV = col(row, 'importo', 'amount', 'valore', 'value');
      if (!dateV || !descV || amtV === '' || amtV === undefined) {
        errs.push(`Riga ${i + 2}: campi mancanti`); return;
      }
      const amount = parseAmount(amtV);
      if (!amount || isNaN(amount)) { errs.push(`Riga ${i + 2}: importo non valido`); return; }
      const rawType = col(row, 'tipo', 'type');
      const { type, recognized } = parseType(rawType);
      if (!recognized) warns.push(`Riga ${i + 2}: tipo "${rawType}" non riconosciuto → importato come Uscita`);
      txs.push({
        date: parseDate(dateV), description: String(descV).trim(), amount, type,
        category: type === 'transfer' ? 'trasferimento' : matchCategory(col(row, 'categoria', 'category'), type),
        account: matchAccount(col(row, 'conto', 'account', 'banca')),
        toAccount: type === 'transfer' ? matchAccount(col(row, 'conto_destinazione', 'destinazione', 'to_account')) : undefined,
        notes: col(row, 'note', 'notes') ? String(col(row, 'note', 'notes')).trim() : undefined,
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
          <button onClick={close} className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center text-secondary">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
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

              <button onClick={template} className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 text-left active:bg-white/[0.08] transition-colors">
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
              {errors.length > 0 && (
                <div className="bg-[#C0605A]/10 rounded-2xl p-3 max-h-24 overflow-y-auto space-y-1">
                  {errors.map((e, i) => <p key={i} className="text-xs text-[#C0605A]">{e}</p>)}
                </div>
              )}
              {warnings.length > 0 && (
                <div className="bg-[#E6B95C]/10 rounded-2xl p-3 max-h-24 overflow-y-auto space-y-1">
                  <p className="text-xs font-medium text-gold mb-1">Tipi non riconosciuti — importati come Uscita:</p>
                  {warnings.map((w, i) => <p key={i} className="text-xs text-[#E6B95C]/80">{w}</p>)}
                </div>
              )}
              {parsed.length > 0 && (
                <div className="glass-card rounded-2xl divide-y divide-white/[0.06] max-h-72 overflow-y-auto scrollbar-hide">
                  {parsed.slice(0, 60).map((tx, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 text-sm">
                      <span className="text-secondary text-xs w-12 flex-shrink-0">{formatDate(tx.date)}</span>
                      <span className="flex-1 truncate text-primary">{tx.description}</span>
                      <span className="label-caps px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: TYPE_META[tx.type].color + '22', color: TYPE_META[tx.type].color }}>
                        {TYPE_META[tx.type].label}
                      </span>
                      <span className="font-medium balance-num text-xs">{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
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
          {step === 'upload' && <button onClick={close} className="flex-1 py-3.5 rounded-2xl bg-white/[0.05] text-secondary font-medium">Annulla</button>}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="px-5 py-3.5 rounded-2xl bg-white/[0.05] text-secondary font-medium">Indietro</button>
              <button onClick={() => { onImport(parsed); setStep('done'); }} disabled={parsed.length === 0}
                className="flex-1 py-3.5 rounded-2xl bg-gold text-bg font-semibold disabled:opacity-40">
                Importa {parsed.length}
              </button>
            </>
          )}
          {step === 'done' && <button onClick={close} className="flex-1 py-3.5 rounded-2xl bg-gold text-bg font-semibold">Chiudi</button>}
        </div>
      </div>
    </div>
  );
}
