/**
 * FASE 2 — Harness di misura su DATI REALI per Forecast Engine V3.
 *
 * Carica un export reale prodotto dall'app Sunny e riesegue il backtest V3
 * canonico in locale, così ogni giro di miglioramento può essere misurato e
 * verificato anti-regressione rispetto alla baseline del giro precedente.
 *
 * Input accettati:
 *   1. sunny-dati-YYYY-MM-DD.json           (Impostazioni → Dati → Esporta, schemaVersion 1)
 *      — PREFERITO: storico completo, include createdAt → filtro as-of efficace.
 *   2. sunny-forecast-diagnostics-*.json    (Forecast V3 → Esporta diagnostica, admin)
 *      — fallback: mesi limitati, niente createdAt → filtro as-of inerte.
 *
 * POLICY (vincolante):
 *   - MAI alimentare questo harness con dati sintetici/fixture per misurare o
 *     ottimizzare l'accuratezza. Solo dati reali.
 *   - Il backtest storico non usa mai il budget corrente (BudgetState vuoto).
 *   - Per la diagnosi degli errori su categorie fixed_monthly / periodic_fixed,
 *     ESCLUDERE PRIMA l'artefatto M9 (locked-shortfall): un importo atteso
 *     ("locked") incluso in `projected` che non transita né da scheduledFuture
 *     né da predictedVariableRemaining inquina la scomposizione det/var mentre
 *     l'errore TOTALE resta corretto. Questi casi sono un limite strutturale
 *     del backtest, NON un errore del modello da correggere.
 *     Il ranking cause-radice qui sotto usa quindi l'errore TOTALE per
 *     categoria (projected − actualFinal), immune all'artefatto, e le categorie
 *     deterministiche sono annotate con un flag `m9Artifact`.
 *
 * Uso:
 *   npx tsx scripts/forecastRealDataHarnessV3.ts <export.json> [--months 12]
 *       [--now YYYY-MM-DD] [--out report.json]
 *       [--baseline old-baseline.json] [--save-baseline new-baseline.json]
 *
 * Regola anti-regressione (X = 10%): un mese REGREDISCE quando il suo errore
 * assoluto medio aumenta oltre max(10%, €5) rispetto alla baseline.
 * Miglioramenti sotto ~2-3% sono riportati come "entro il rumore".
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { Transaction, CategoryDef, AccountDef, BudgetState } from '../src/types';
import { runBacktestV3 } from '../src/features/forecast/forecastBacktestV3';
import { BacktestResultV3, CategoryBehavior } from '../src/features/forecast/forecastTypesV3';
import {
  buildForecastDiagnosticsExport,
  ForecastDiagnosticsExport,
} from '../src/features/forecast/forecastDiagnostics';

const HARNESS_VERSION = 1;

/** Behavior deterministici soggetti al possibile artefatto M9 (locked-shortfall). */
const DET_BEHAVIORS: ReadonlySet<CategoryBehavior> = new Set<CategoryBehavior>([
  'recurring', 'recurring_bundle', 'fixed_monthly', 'periodic_fixed',
]);

// ── CLI ────────────────────────────────────────────────────────────────────────

interface CliArgs {
  inputPath: string;
  months: number;
  nowOverride?: string;
  outPath?: string;
  baselinePath?: string;
  saveBaselinePath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const args: Partial<CliArgs> = { months: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--months') args.months = Number(argv[++i]);
    else if (a === '--now') args.nowOverride = argv[++i];
    else if (a === '--out') args.outPath = argv[++i];
    else if (a === '--baseline') args.baselinePath = argv[++i];
    else if (a === '--save-baseline') args.saveBaselinePath = argv[++i];
    else positional.push(a);
  }
  if (positional.length !== 1) {
    console.error('Uso: npx tsx scripts/forecastRealDataHarnessV3.ts <export.json> [--months N] [--now YYYY-MM-DD] [--out report.json] [--baseline file.json] [--save-baseline file.json]');
    process.exit(64);
  }
  if (!args.months || !Number.isFinite(args.months) || args.months < 1) {
    console.error('--months deve essere un intero ≥ 1');
    process.exit(64);
  }
  return { ...(args as CliArgs), inputPath: positional[0] };
}

// ── Input loading ─────────────────────────────────────────────────────────────

interface LoadedDataset {
  source: 'sunny-dati' | 'sunny-forecast-diagnostics';
  transactions: Transaction[];
  categories: CategoryDef[];
  accounts: AccountDef[];
  exportedAt?: string;
  hasCreatedAt: boolean;
  warnings: string[];
}

function loadDataset(path: string): LoadedDataset {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const warnings: string[] = [];

  // Formato 1: export dati completo (GDPR)
  if (raw?.app === 'Sunny' && raw?.schemaVersion === 1 && Array.isArray(raw.transactions)) {
    const transactions = raw.transactions as Transaction[];
    const hasCreatedAt = transactions.some(t => typeof t.createdAt === 'number');
    if (!hasCreatedAt) {
      warnings.push('Nessuna transazione ha createdAt: il filtro causale as-of è inerte (fallback conservativo: tutto incluso).');
    }
    return {
      source: 'sunny-dati',
      transactions,
      categories: (raw.categories ?? []) as CategoryDef[],
      accounts: (raw.accounts ?? []) as AccountDef[],
      exportedAt: raw.exportedAt,
      hasCreatedAt,
      warnings,
    };
  }

  // Formato 2: export diagnostica forecast (admin)
  if (typeof raw?.metadata?.exportVersion === 'string' &&
      raw.metadata.exportVersion.startsWith('sunny-forecast-diagnostics')) {
    if (!Array.isArray(raw.transactions) || raw.transactions.length === 0) {
      console.error('Export diagnostica senza transazioni (includeTransactions=false?): impossibile rieseguire il backtest. Riesporta con le transazioni incluse, oppure usa l\'export dati completo.');
      process.exit(65);
    }
    warnings.push('Input = export diagnostica: storico limitato ai mesi richiesti + 1, importi già arrotondati, niente createdAt né quota condivisa. Preferire l\'export dati completo (sunny-dati-*.json).');
    interface DiagTx {
      id: string; date: string; amount: number; type: Transaction['type'];
      categoryId: string; accountId?: string; description?: string;
      normalizedMerchant?: string; seriesId?: string; recurringFreq?: string;
    }
    const transactions: Transaction[] = (raw.transactions as DiagTx[]).map(t => ({
      id: t.id,
      date: t.date,
      // Con privacy pseudonimizzata la descrizione è il merchant key stabile:
      // la rilevazione auto-recurring per merchant resta funzionante.
      description: t.description ?? t.normalizedMerchant ?? '',
      amount: t.amount,
      type: t.type,
      category: t.categoryId,
      account: t.accountId ?? 'conto',
      seriesId: t.seriesId,
      recurring: t.recurringFreq
        ? { freq: t.recurringFreq as NonNullable<Transaction['recurring']>['freq'] }
        : undefined,
    }));
    interface DiagCat { id: string; label: string; icon?: string; type: 'income' | 'expense' | 'investment' }
    const categories: CategoryDef[] = ((raw.categories ?? []) as DiagCat[]).map(c => ({
      id: c.id, label: c.label, icon: c.icon ?? '·', color: '#888', kind: c.type,
    }));
    interface DiagAcc { id: string; label: string; icon?: string; isInvestment?: boolean }
    const accounts: AccountDef[] = ((raw.accounts ?? []) as DiagAcc[]).map(a => ({
      id: a.id, label: a.label, icon: a.icon ?? '·', isInvestment: a.isInvestment,
    }));
    return {
      source: 'sunny-forecast-diagnostics',
      transactions,
      categories,
      accounts,
      exportedAt: raw.metadata.generatedAt,
      hasCreatedAt: false,
      warnings,
    };
  }

  console.error('Formato non riconosciuto: atteso sunny-dati (schemaVersion 1) o sunny-forecast-diagnostics-v1.');
  process.exit(65);
}

// ── Per-month metrics + baseline ──────────────────────────────────────────────

interface MonthMetrics {
  actual: number;
  meanAbsErr: number;
  meanErr: number;
  relMeanAbsPct: number;
  samples: number;
  perDay: Record<string, number>; // snapshotDay -> signed error
}

interface Baseline {
  harnessVersion: number;
  generatedAt: string;
  nowUsed: string;
  months: number;
  topline: { mae: number; medAE: number; wape: number; bias: number; r2: number; biasFactor: number };
  perMonth: Record<string, MonthMetrics>;
}

function perMonthMetrics(backtest: BacktestResultV3): Record<string, MonthMetrics> {
  const byMonth = new Map<string, { abs: number[]; signed: number[]; actual: number; perDay: Record<string, number> }>();
  for (const s of backtest.snapshots) {
    const m = byMonth.get(s.monthKey) ?? { abs: [], signed: [], actual: s.actual, perDay: {} };
    m.abs.push(s.absError);
    m.signed.push(s.error);
    m.actual = s.actual;
    m.perDay[String(s.snapshotDay)] = s.error;
    byMonth.set(s.monthKey, m);
  }
  const out: Record<string, MonthMetrics> = {};
  for (const [key, m] of [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const meanAbsErr = Math.round(m.abs.reduce((a, b) => a + b, 0) / m.abs.length);
    const meanErr = Math.round(m.signed.reduce((a, b) => a + b, 0) / m.signed.length);
    out[key] = {
      actual: m.actual,
      meanAbsErr,
      meanErr,
      relMeanAbsPct: m.actual > 0 ? Math.round((meanAbsErr / m.actual) * 1000) / 10 : 0,
      samples: m.abs.length,
      perDay: m.perDay,
    };
  }
  return out;
}

// ── M9 locked-shortfall analysis ──────────────────────────────────────────────

interface M9CategoryAnalysis {
  categoryId: string;
  categoryLabel?: string;
  behavior: CategoryBehavior;
  /** Campioni (mese × giorno snapshot) con locked-shortfall > €2. */
  samplesWithGap: number;
  totalSamples: number;
  meanLockedExtra: number;
  meanAbsTrueError: number;
  meanActualFinal: number;
  /** true → la distorsione è SOLO nella scomposizione det/var (errore totale piccolo):
   *  limite strutturale M9, NON correggere il modello. */
  m9ArtifactOnly: boolean;
}

function analyzeM9(diag: ForecastDiagnosticsExport): M9CategoryAnalysis[] {
  const agg = new Map<string, {
    label?: string; behavior: CategoryBehavior;
    lockedExtras: number[]; absTrueErrs: number[]; actuals: number[]; total: number;
  }>();

  for (const sample of diag.backtest.samples) {
    for (const cf of sample.categoryForecasts ?? []) {
      if (!DET_BEHAVIORS.has(cf.behavior)) continue;
      const a = agg.get(cf.categoryId) ?? {
        label: cf.categoryLabel, behavior: cf.behavior,
        lockedExtras: [], absTrueErrs: [], actuals: [], total: 0,
      };
      a.total += 1;
      // Quota di `projected` non spiegata dai componenti tracciati: è l'importo
      // "locked" che non transita da scheduledFuture/plannedFuture/variabile.
      // (campi arrotondati indipendentemente → tolleranza €2)
      const lockedExtra = cf.forecastTotal - cf.actualSoFar - cf.scheduledFuture
        - cf.plannedFuture - cf.variableComponent;
      if (lockedExtra > 2) {
        a.lockedExtras.push(lockedExtra);
        a.absTrueErrs.push(Math.abs(cf.error));
        a.actuals.push(cf.actualFinal);
      }
      agg.set(cf.categoryId, a);
    }
  }

  const out: M9CategoryAnalysis[] = [];
  for (const [categoryId, a] of agg) {
    if (a.lockedExtras.length === 0) continue;
    const mean = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
    const meanAbsTrueError = mean(a.absTrueErrs);
    const meanActualFinal = mean(a.actuals);
    out.push({
      categoryId,
      categoryLabel: a.label,
      behavior: a.behavior,
      samplesWithGap: a.lockedExtras.length,
      totalSamples: a.total,
      meanLockedExtra: mean(a.lockedExtras),
      meanAbsTrueError,
      meanActualFinal,
      // L'errore totale è piccolo (≤ max(€5, 10% dell'actual)) mentre il gap
      // locked esiste → solo la scomposizione è inquinata: artefatto M9 puro.
      m9ArtifactOnly: meanAbsTrueError <= Math.max(5, meanActualFinal * 0.10),
    });
  }
  return out.sort((a, b) => b.meanLockedExtra - a.meanLockedExtra);
}

// ── Anti-regression check ─────────────────────────────────────────────────────

interface RegressionRow {
  month: string;
  oldMae: number;
  newMae: number;
  delta: number;
  deltaPct: number;
  verdict: 'REGRESSIONE' | 'miglioramento' | 'entro il rumore' | 'invariato';
}

function compareBaselines(oldB: Baseline, current: Record<string, MonthMetrics>): { rows: RegressionRow[]; regressed: boolean } {
  const rows: RegressionRow[] = [];
  let regressed = false;
  for (const [month, oldM] of Object.entries(oldB.perMonth)) {
    const newM = current[month];
    if (!newM) continue; // mese non più nel periodo → non confrontabile
    const delta = newM.meanAbsErr - oldM.meanAbsErr;
    const deltaPct = oldM.meanAbsErr > 0 ? Math.round((delta / oldM.meanAbsErr) * 1000) / 10 : 0;
    let verdict: RegressionRow['verdict'];
    if (delta > Math.max(0.10 * oldM.meanAbsErr, 5)) { verdict = 'REGRESSIONE'; regressed = true; }
    else if (delta < -Math.max(0.025 * oldM.meanAbsErr, 2)) verdict = 'miglioramento';
    else if (delta === 0) verdict = 'invariato';
    else verdict = 'entro il rumore';
    rows.push({ month, oldMae: oldM.meanAbsErr, newMae: newM.meanAbsErr, delta, deltaPct, verdict });
  }
  return { rows: rows.sort((a, b) => a.month.localeCompare(b.month)), regressed };
}

// ── Pretty printing ───────────────────────────────────────────────────────────

const eur = (n: number) => `€${n}`;
const pct = (n: number) => `${n}%`;

function printTable(headers: string[], rows: (string | number)[][]): void {
  const all = [headers, ...rows.map(r => r.map(String))];
  const widths = headers.map((_, i) => Math.max(...all.map(r => String(r[i]).length)));
  const fmt = (r: (string | number)[]) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(fmt(headers));
  console.log(widths.map(w => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(r));
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  const ds = loadDataset(cli.inputPath);

  const now = cli.nowOverride
    ? new Date(`${cli.nowOverride}T12:00:00`)
    : ds.exportedAt ? new Date(ds.exportedAt) : new Date();

  const expenseCategories = ds.categories.filter(c => c.kind === 'expense');

  console.log('═══ FORECAST V3 — HARNESS DATI REALI ═══');
  console.log(`Input: ${cli.inputPath} (${ds.source})`);
  console.log(`Riferimento "now": ${now.toISOString()} · mesi backtest: ${cli.months}`);
  console.log(`Transazioni: ${ds.transactions.length} · categorie spesa: ${expenseCategories.length} · createdAt presente: ${ds.hasCreatedAt ? 'sì' : 'no'}`);
  for (const w of ds.warnings) console.log(`⚠ ${w}`);
  console.log('');

  // ── Backtest canonico (con filtro as-of) ───────────────────────────────────
  const backtest = runBacktestV3(ds.transactions, expenseCategories, now, cli.months);
  if (backtest.snapshots.length === 0) {
    console.error('Nessuno snapshot di backtest: il periodo richiesto non contiene mesi con spese.');
    process.exit(65);
  }

  const totalExcludedLate = backtest.snapshots.reduce((s, x) => s + x.excludedLateTx, 0);
  console.log('── Metriche top-line (runBacktestV3, filtro as-of attivo) ──');
  printTable(
    ['MAE', 'MedAE', 'WAPE', 'Bias', 'R²', 'biasFactor', 'missedDet medio', 'tx escluse as-of'],
    [[eur(backtest.mae), eur(backtest.medAE), pct(backtest.wape), eur(backtest.bias),
      String(backtest.r2), String(backtest.biasFactor), eur(backtest.missedDeterministicMean), totalExcludedLate]],
  );
  console.log('');
  console.log('Componenti (dopo-snapshot — ciò che il modello doveva prevedere):');
  printTable(
    ['componente', 'MAE', 'MedAE', 'Bias', 'WAPE', 'affidabile', 'campioni'],
    [
      ['variabile', eur(backtest.variableTail.mae), eur(backtest.variableTail.medAE),
        eur(backtest.variableTail.bias), pct(backtest.variableTail.wape),
        backtest.variableTail.wapeReliable ? 'sì' : 'no', backtest.variableTail.sampleCount],
      ['deterministico', eur(backtest.deterministic.mae), eur(backtest.deterministic.medAE),
        eur(backtest.deterministic.bias), pct(backtest.deterministic.wape),
        backtest.deterministic.wapeReliable ? 'sì' : 'no', backtest.deterministic.sampleCount],
    ],
  );
  console.log('');

  console.log('── Per giorno di snapshot ──');
  printTable(
    ['giorno', 'MAE', 'Bias', 'MAE var', 'Bias var', 'campioni'],
    backtest.byDay.map(d => [d.day, eur(d.mae), eur(d.bias), eur(d.variableMae), eur(d.variableBias), d.count]),
  );
  console.log('');

  // ── Per mese (unità anti-regressione) ──────────────────────────────────────
  const months = perMonthMetrics(backtest);
  console.log('── Per mese (errore medio sui 5 giorni di snapshot) ──');
  printTable(
    ['mese', 'actual', 'errAbs medio', 'err medio (segno)', 'errAbs %', 'd5', 'd10', 'd15', 'd20', 'd25'],
    Object.entries(months).map(([key, m]) => [
      key, eur(m.actual), eur(m.meanAbsErr), eur(m.meanErr), pct(m.relMeanAbsPct),
      m.perDay['5'] ?? '·', m.perDay['10'] ?? '·', m.perDay['15'] ?? '·', m.perDay['20'] ?? '·', m.perDay['25'] ?? '·',
    ]),
  );
  console.log('');

  // ── Drill-down per categoria (diagnostica, budget storico vuoto) ───────────
  const emptyBudget: BudgetState = {
    savingsTarget: 0, categoryBudgets: {}, incomeBudgets: {}, investmentBudgets: {},
    suggestionAccepted: false,
  };
  const diag = buildForecastDiagnosticsExport({
    transactions: ds.transactions,
    categories: ds.categories,
    accounts: ds.accounts,
    budget: emptyBudget, // vincolo: il backtest storico non usa il budget corrente
    settings: { includeInvestments: false, enableBudget: false, enableInvestments: false },
    monthsRequested: cli.months,
    privacyMode: 'pseudonymized',
    includeTransactions: false,
    includeCategoryForecasts: true,
    now,
  });

  if (totalExcludedLate > 0) {
    console.log(`⚠ ${totalExcludedLate} transazioni escluse dal filtro as-of nel backtest canonico: l'attribuzione per categoria (sezione diagnostica, senza filtro as-of) può includerle.`);
    console.log('');
  }

  // ── Analisi artefatto M9 (PRIMA del ranking, come da vincolo) ──────────────
  const m9 = analyzeM9(diag);
  console.log('── Artefatto M9 (locked-shortfall) su categorie deterministiche ──');
  if (m9.length === 0) {
    console.log('Nessun locked-shortfall rilevato (> €2) nei campioni.');
  } else {
    printTable(
      ['categoria', 'behavior', 'campioni con gap', 'locked medio', '|err totale| medio', 'actual medio', 'verdetto'],
      m9.map(x => [
        x.categoryLabel ?? x.categoryId, x.behavior, `${x.samplesWithGap}/${x.totalSamples}`,
        eur(x.meanLockedExtra), eur(x.meanAbsTrueError), eur(x.meanActualFinal),
        x.m9ArtifactOnly ? 'ARTEFATTO M9 — non correggere' : 'errore reale (gap M9 presente ma errore totale vero)',
      ]),
    );
  }
  console.log('');

  const m9ArtifactCats = new Set(m9.filter(x => x.m9ArtifactOnly).map(x => x.categoryId));

  // ── Ranking cause-radice: errore TOTALE per categoria (immune a M9) ────────
  console.log('── Ranking contributori d\'errore (errore totale per categoria) ──');
  const catRows = Object.values(diag.backtest.byCategory)
    .sort((a, b) => b.errorContribution - a.errorContribution)
    .slice(0, 12);
  printTable(
    ['categoria', 'behavior', 'MAE', 'Bias', 'WAPE', 'contributo %', 'flag', 'issue ricorrenti'],
    catRows.map(c => [
      c.categoryLabel ?? c.categoryId, c.behavior ?? '?', eur(c.mae), eur(c.bias), pct(c.wape),
      pct(c.errorContribution),
      m9ArtifactCats.has(c.categoryId) ? 'M9' : '',
      (c.commonIssues ?? []).join(', ') || '·',
    ]),
  );
  console.log('');

  console.log('── Per behavior ──');
  printTable(
    ['behavior', 'campioni', 'MAE', 'Bias', 'WAPE', 'actual tot', 'forecast tot'],
    Object.values(diag.backtest.byBehavior)
      .sort((a, b) => b.mae - a.mae)
      .map(b => [b.behavior, b.sampleCount, eur(b.mae), eur(b.bias), pct(b.wape), eur(b.actualTotal), eur(b.forecastTotal)]),
  );
  console.log('');

  // ── Baseline / anti-regressione ─────────────────────────────────────────────
  const baseline: Baseline = {
    harnessVersion: HARNESS_VERSION,
    generatedAt: new Date().toISOString(),
    nowUsed: now.toISOString(),
    months: cli.months,
    topline: {
      mae: backtest.mae, medAE: backtest.medAE, wape: backtest.wape,
      bias: backtest.bias, r2: backtest.r2, biasFactor: backtest.biasFactor,
    },
    perMonth: months,
  };

  let exitCode = 0;
  if (cli.baselinePath) {
    const oldB = JSON.parse(readFileSync(resolve(cli.baselinePath), 'utf8')) as Baseline;
    const { rows, regressed } = compareBaselines(oldB, months);
    console.log(`── Anti-regressione vs ${cli.baselinePath} (soglia X = 10%) ──`);
    printTable(
      ['mese', 'MAE prima', 'MAE ora', 'Δ', 'Δ%', 'verdetto'],
      rows.map(r => [r.month, eur(r.oldMae), eur(r.newMae), eur(r.delta), pct(r.deltaPct), r.verdict]),
    );
    if (regressed) {
      console.log('\n✗ STOP-TRIGGER: almeno un mese reale peggiora oltre la soglia del 10%.');
      exitCode = 2;
    } else {
      console.log('\n✓ Nessuna regressione oltre soglia.');
    }
    console.log('');
  }

  if (cli.saveBaselinePath) {
    const p = resolve(cli.saveBaselinePath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(baseline, null, 2));
    console.log(`Baseline salvata: ${p}`);
  }

  if (cli.outPath) {
    const p = resolve(cli.outPath);
    mkdirSync(dirname(p), { recursive: true });
    // Report aggregato (nessuna transazione raw inclusa)
    writeFileSync(p, JSON.stringify({
      harnessVersion: HARNESS_VERSION,
      input: { path: cli.inputPath, source: ds.source, txCount: ds.transactions.length, hasCreatedAt: ds.hasCreatedAt },
      nowUsed: now.toISOString(),
      months: cli.months,
      topline: baseline.topline,
      excludedLateTx: totalExcludedLate,
      byDay: backtest.byDay,
      components: { variable: backtest.variableTail, deterministic: backtest.deterministic },
      perMonth: months,
      m9Analysis: m9,
      byCategory: diag.backtest.byCategory,
      byBehavior: diag.backtest.byBehavior,
      notes: diag.backtest.summary.notes,
    }, null, 2));
    console.log(`Report salvato: ${p}`);
  }

  process.exit(exitCode);
}

main();
