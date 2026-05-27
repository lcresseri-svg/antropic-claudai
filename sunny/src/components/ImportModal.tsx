import { useState, useRef } from 'react';
import {
  Transaction, TransactionType, Category, Account, PaymentMethod,
  CATEGORIES_BY_TYPE,
} from '../types';
import { formatCurrency, formatDate } from '../utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (txs: Omit<Transaction, 'id'>[]) => void;
}

type Step = 'upload' | 'preview' | 'done';

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parseDate(val: unknown): string {
  if (typeof val === 'number') {
    // Excel serial date (days since 1900-01-00)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // dd/mm/yyyy or dd.mm.yyyy
  const m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // ISO or any parseable
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function parseAmount(val: unknown): number {
  const s = String(val ?? '').replace(/[^\d,.\-]/g, '').replace(',', '.');
  return Math.abs(parseFloat(s));
}

function parseType(val: unknown): TransactionType {
  const s = String(val ?? '').toLowerCase().trim();
  if (/entrat|income|ricav|\+/.test(s)) return 'income';
  if (/invest/.test(s)) return 'investment';
  if (/trasfer|moviment|transfer/.test(s)) return 'transfer';
  return 'expense';
}

function parseCategory(val: unknown, type: TransactionType): Category {
  const s = String(val ?? '').toLowerCase().trim();
  const map: Record<string, Category> = {
    'spesa': 'spesa', 'supermercato': 'spesa', 'alimentari': 'spesa', 'grocery': 'spesa',
    'casa': 'casa', 'affitto': 'casa', 'bollette': 'casa', 'rent': 'casa',
    'ristorante': 'ristoranti', 'ristoranti': 'ristoranti', 'food': 'ristoranti', 'bar': 'ristoranti',
    'trasporti': 'trasporti', 'trasporto': 'trasporti', 'auto': 'trasporti', 'transport': 'trasporti',
    'shopping': 'shopping', 'abbigliamento': 'shopping', 'clothing': 'shopping',
    'salute': 'salute', 'farmacia': 'salute', 'medico': 'salute', 'health': 'salute',
    'abbonamenti': 'abbonamenti', 'subscription': 'abbonamenti',
    'stipendio': 'stipendio', 'salario': 'stipendio', 'salary': 'stipendio',
    'freelance': 'freelance',
    'dividendi': 'dividendi', 'dividendo': 'dividendi', 'dividend': 'dividendi',
    'rimborso': 'rimborso', 'refund': 'rimborso',
    'etf': 'azioni_etf', 'azioni': 'azioni_etf', 'borsa': 'azioni_etf', 'stock': 'azioni_etf',
    'crypto': 'crypto', 'bitcoin': 'crypto', 'ethereum': 'crypto',
    'obbligazioni': 'obbligazioni', 'bond': 'obbligazioni',
    'fondi': 'fondi', 'fondo': 'fondi', 'fund': 'fondi',
    'trasferimento': 'trasferimento', 'transfer': 'trasferimento',
  };
  if (map[s]) return map[s];
  return CATEGORIES_BY_TYPE[type][0];
}

function parseAccount(val: unknown): Account | undefined {
  const s = String(val ?? '').toLowerCase().trim();
  if (!s) return undefined;
  if (/corrent|checking/.test(s)) return 'conto_corrente';
  if (/risparm|saving/.test(s)) return 'conto_risparmio';
  if (/credit/.test(s)) return 'carta_credito';
  if (/contant|cash/.test(s)) return 'contanti';
  if (/invest|broker/.test(s)) return 'conto_investimenti';
  return undefined;
}

function parsePayment(val: unknown): PaymentMethod | undefined {
  const s = String(val ?? '').toLowerCase().trim();
  if (!s) return undefined;
  if (/debito|debit/.test(s)) return 'carta_debito';
  if (/credito|credit/.test(s)) return 'carta_credito';
  if (/contant|cash/.test(s)) return 'contanti';
  if (/bonifico|transfer|wire/.test(s)) return 'bonifico';
  if (/app|paypal|satispay|revolut/.test(s)) return 'app_pagamento';
  if (/rate|installment/.test(s)) return 'rate';
  return undefined;
}

function normalizeKey(k: string) {
  return k.toLowerCase().trim().replace(/\s+/g, '_');
}

function findCol(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = Object.keys(row).find(k => normalizeKey(k) === name);
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function mapRows(rows: Record<string, unknown>[]): {
  transactions: Omit<Transaction, 'id'>[];
  errors: string[];
} {
  const transactions: Omit<Transaction, 'id'>[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    try {
      const dateVal  = findCol(row, 'data', 'date', 'data_transazione', 'datum');
      const descVal  = findCol(row, 'descrizione', 'description', 'desc', 'causale', 'memo');
      const amtVal   = findCol(row, 'importo', 'amount', 'valore', 'value', 'dare_avere', 'importo_eur');
      const typeVal  = findCol(row, 'tipo', 'type', 'tipologia');
      const catVal   = findCol(row, 'categoria', 'category', 'cat');
      const accVal   = findCol(row, 'conto', 'account', 'banca', 'bank');
      const payVal   = findCol(row, 'metodo_pagamento', 'metodo', 'pagamento', 'payment', 'payment_method');
      const toAccVal = findCol(row, 'conto_destinazione', 'to_account', 'destinazione');
      const notesVal = findCol(row, 'note', 'notes', 'commento');

      if (!dateVal || !descVal || amtVal === undefined || amtVal === '') {
        errors.push(`Riga ${i + 2}: campi obbligatori mancanti (data, descrizione, importo)`);
        return;
      }

      const amount = parseAmount(amtVal);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Riga ${i + 2}: importo non valido "${amtVal}"`);
        return;
      }

      const type = parseType(typeVal);
      transactions.push({
        date: parseDate(dateVal),
        description: String(descVal).trim(),
        amount,
        type,
        category: parseCategory(catVal, type),
        account: parseAccount(accVal),
        toAccount: parseAccount(toAccVal),
        paymentMethod: parsePayment(payVal),
        notes: notesVal ? String(notesVal).trim() : undefined,
      });
    } catch {
      errors.push(`Riga ${i + 2}: errore di parsing`);
    }
  });

  return { transactions, errors };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportModal({ open, onClose, onImport }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<Omit<Transaction, 'id'>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep('upload'); setParsed([]); setErrors([]); };

  const handleClose = () => { reset(); onClose(); };

  const processFile = async (file: File) => {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const { transactions, errors } = mapRows(rows);
    setParsed(transactions);
    setErrors(errors);
    setStep('preview');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  const handleConfirm = () => {
    onImport(parsed);
    setStep('done');
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = ['Data', 'Descrizione', 'Importo', 'Tipo', 'Categoria', 'Conto', 'Metodo Pagamento', 'Conto Destinazione', 'Note'];
    const examples = [
      ['2026-05-01', 'Stipendio maggio',  2400,   'entrata',      'stipendio',  'conto_corrente',     'bonifico',     '',               ''],
      ['2026-05-02', 'Affitto',           750,    'uscita',        'casa',       'conto_corrente',     'bonifico',     '',               ''],
      ['2026-05-03', 'Esselunga',         87.50,  'uscita',        'spesa',      'conto_corrente',     'carta_debito', '',               ''],
      ['2026-05-04', 'ETF S&P500',        500,    'investimento',  'etf',        'conto_investimenti', 'bonifico',     '',               'PAC mensile'],
      ['2026-05-10', 'A conto risparmio', 300,    'trasferimento', '',           'conto_corrente',     '',             'conto_risparmio', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 1 ? 25 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transazioni');
    XLSX.writeFile(wb, 'sunny-template.xlsx');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative w-full max-w-xl bg-cream rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-black/5">
          <div>
            <h2 className="text-lg font-semibold text-dark">Importa transazioni</h2>
            <p className="text-xs text-dark/40 mt-0.5">Supporta .xlsx, .xls, .csv</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-dark/50"
          >✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragging ? 'border-gold bg-gold/5' : 'border-black/10 hover:border-black/25 hover:bg-black/2'
                }`}
              >
                <p className="text-3xl mb-3">📂</p>
                <p className="text-sm font-medium text-dark">Trascina il file qui</p>
                <p className="text-xs text-dark/40 mt-1">oppure clicca per selezionare</p>
                <input
                  ref={fileRef} type="file"
                  accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* Template download */}
              <div className="bg-white rounded-xl p-4 flex items-center gap-3 border border-black/5">
                <span className="text-2xl">📋</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark">Scarica il template</p>
                  <p className="text-xs text-dark/40">Compila con i tuoi dati e reimporta</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="px-4 py-2 bg-dark text-cream rounded-xl text-xs font-semibold hover:bg-dark/80 transition-colors flex-shrink-0"
                >
                  Scarica
                </button>
              </div>

              {/* Format hint */}
              <div className="bg-sage/10 rounded-xl p-4 text-xs text-dark/60 space-y-1 border border-sage/20">
                <p className="font-semibold text-dark/80 mb-2">Colonne riconosciute automaticamente:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span><b>Data</b> — Data / Date</span>
                  <span><b>Descrizione</b> — Descrizione / Description / Causale</span>
                  <span><b>Importo</b> — Importo / Amount / Valore</span>
                  <span><b>Tipo</b> — entrata / uscita / investimento / trasferimento</span>
                  <span><b>Categoria</b> — Categoria / Category</span>
                  <span><b>Conto</b> — Conto / Account / Banca</span>
                  <span><b>Metodo</b> — Metodo Pagamento / Payment</span>
                  <span><b>Destinazione</b> — Conto Destinazione (per movimenti)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${parsed.length > 0 ? 'bg-sage' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-dark">
                  {parsed.length} transazion{parsed.length === 1 ? 'e' : 'i'} pronte
                  {errors.length > 0 && `, ${errors.length} error${errors.length === 1 ? 'e' : 'i'}`}
                </span>
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
                  {errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              {/* Preview table */}
              {parsed.length > 0 && (
                <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead className="bg-black/3 sticky top-0">
                        <tr>
                          {['Data','Descrizione','Importo','Tipo','Categoria','Conto'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-dark/50">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {parsed.slice(0, 50).map((tx, i) => (
                          <tr key={i} className="hover:bg-black/2">
                            <td className="px-3 py-2 text-dark/60 whitespace-nowrap">{formatDate(tx.date)}</td>
                            <td className="px-3 py-2 text-dark max-w-[160px] truncate">{tx.description}</td>
                            <td className="px-3 py-2 font-medium text-dark tabular-nums whitespace-nowrap">{formatCurrency(tx.amount)}</td>
                            <td className="px-3 py-2 text-dark/60">{tx.type}</td>
                            <td className="px-3 py-2 text-dark/60">{tx.category}</td>
                            <td className="px-3 py-2 text-dark/60">{tx.account ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.length > 50 && (
                      <p className="text-xs text-dark/40 text-center py-2">
                        ... e altre {parsed.length - 50} transazioni
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <div className="text-center py-8">
              <p className="text-4xl mb-4">✅</p>
              <p className="text-lg font-semibold text-dark">Importazione completata</p>
              <p className="text-sm text-dark/50 mt-1">
                {parsed.length} transazion{parsed.length === 1 ? 'e importata' : 'i importate'} con successo
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-black/5 flex gap-3">
          {step === 'upload' && (
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-black/5 text-dark/60 text-sm font-medium hover:bg-black/10 transition-colors">
              Annulla
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="py-3 px-5 rounded-xl bg-black/5 text-dark/60 text-sm font-medium hover:bg-black/10 transition-colors">
                ← Indietro
              </button>
              <button
                onClick={handleConfirm}
                disabled={parsed.length === 0}
                className="flex-1 py-3 rounded-xl bg-dark text-cream text-sm font-semibold hover:bg-dark/80 transition-colors disabled:opacity-40"
              >
                Importa {parsed.length} transazion{parsed.length === 1 ? 'e' : 'i'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-dark text-cream text-sm font-semibold hover:bg-dark/80 transition-colors">
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
