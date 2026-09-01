import { onRequest } from 'firebase-functions/v2/https';
import {
  db, ADMIN_UID, ALLOWED_ORIGINS, GEMINI_TIMEOUT_MS,
  bodyTooLarge, fetchWithTimeout, logError, verifyBearer, verifyAppCheckSoft,
  addPeriod, Freq, RecurrenceRule,
} from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// AI FUNCTIONS (Gemini) — auth + App Check (soft rollout) + body-size guard +
// per-user daily rate limits. Prompts receive AGGREGATED figures only.
// GEMINI_API_KEY must be set via: firebase functions:secrets:set GEMINI_API_KEY
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AI_CALLS_PER_DAY = 20;
// Per-user daily cap for the AI digest (protects the paid Gemini quota).
const MAX_DIGEST_CALLS_PER_DAY = 30;

// ─────────────────────────────────────────────────────────────────────────────
// AI COACH — "Posso permettermi…?"
//
// Checks affordability of a purchase given the user's financial situation.
// Rate-limited to MAX_AI_CALLS_PER_DAY per user per UTC day (no token waste).
// Rate limit state lives in users/{uid}/meta/aiCoach:
//   { dailyCount: number; lastResetDay: string }  (YYYY-MM-DD UTC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Piano calcolato dal client con `sunny/src/features/aiCoach/savingsEngine.ts`.
 *
 * Duplicato qui perché functions e client sono due pacchetti separati e non
 * condividono i tipi. Se cambia di là, va cambiato di qua — il campo è
 * opzionale e validato, quindi una divergenza degrada al calcolo lato server
 * invece di rompere la chiamata.
 */
type PlanNature = 'fixed' | 'periodic' | 'variable' | 'oneOff';

interface CoachPlan {
  sustainableMonthly: number;
  monthsOfHistory: number;
  fixedMonthlyCost: number;
  freeLiquidity: number;
  savingsTarget: number;
  /** Da qui in giù: campi aggiunti dopo. Un client in cache manda ancora il
   *  payload di prima, quindi sono opzionali e vanno letti come tali. */
  monthlyIncome?: number;
  monthlyExpense?: number;
  savingsRate?: number;
  runwayMonths?: number | null;
  paceConfidence?: 'alta' | 'media' | 'bassa';
  worstMonthNet?: number;
  breakdown?: {
    fixedMonthly: number;
    periodicMonthly: number;
    variableMonthly: number;
    reducibleMonthly: number;
  };
  fitsThisMonth: boolean;
  affordableNow: boolean;
  monthsToAfford: number | null;
  readyByISO: string | null;
  requiredMonthly: number | null;
  feasible: boolean | null;
  gapMonthly: number;
  monthsWithCuts: number | null;
  cuts: { label: string; amount: number; currentMonthly: number }[];
  topCategories: { label: string; monthlyAvg: number; nature?: PlanNature; reason?: string }[];
  notes: string[];
}

/** Il piano è utilizzabile? Un payload malformato non deve rompere la
 *  chiamata: si ricade sul calcolo lato server di sempre. */
function usablePlan(p: unknown): p is CoachPlan {
  if (!p || typeof p !== 'object') return false;
  const c = p as Record<string, unknown>;
  return typeof c.sustainableMonthly === 'number' && Number.isFinite(c.sustainableMonthly)
    && typeof c.fitsThisMonth === 'boolean'
    && Array.isArray(c.cuts) && Array.isArray(c.topCategories) && Array.isArray(c.notes)
    && (c.notes as unknown[]).every((n) => typeof n === 'string')
    && (c.notes as unknown[]).length <= 16;
}

export const generateAffordabilityAdvice = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      if (bodyTooLarge(req)) { res.status(413).json({ ok: false, error: 'payload-too-large' }); return; }

      const uid = await verifyBearer(req.headers.authorization);
      if (!uid) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
      if (uid !== ADMIN_UID) { res.status(403).json({ ok: false, error: 'forbidden' }); return; }
      if (!await verifyAppCheckSoft(req, 'generateAffordabilityAdvice')) {
        res.status(401).json({ ok: false, error: 'appcheck-failed' }); return;
      }

      // ── Atomic rate limit: reserve a daily slot in a single transaction so
      //    concurrent calls cannot exceed MAX_AI_CALLS_PER_DAY. ──────────────
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      const rateLimitRef = db.doc(`users/${uid}/meta/aiCoach`);
      const remaining = await db.runTransaction(async (tx) => {
        const snap = await tx.get(rateLimitRef);
        const rl = (snap.data() ?? {}) as { dailyCount?: number; lastResetDay?: string };
        const count = (rl.lastResetDay === today) ? (rl.dailyCount ?? 0) : 0;
        if (count >= MAX_AI_CALLS_PER_DAY) return -1;
        tx.set(rateLimitRef, { dailyCount: count + 1, lastResetDay: today }, { merge: true });
        return MAX_AI_CALLS_PER_DAY - (count + 1);
      });
      if (remaining < 0) {
        res.status(429).json({ ok: false, error: 'rate-limit', remaining: 0 });
        return;
      }

      // Load settings for category labels. NOTE: the AI Coach is intentionally
      // INDEPENDENT of the `aiEnabled` flag (that one only gates the monthly
      // Gemini digest). The Coach is its own opt-in feature, gated client-side
      // by `aiCoachWidgetEnabled` + admin, so we do not block on aiEnabled here.
      const settingsSnap = await db.doc(`users/${uid}/meta/settings`).get();
      const settings = (settingsSnap.data() ?? {}) as { aiEnabled?: boolean; categories?: { id: string; label: string }[] };

      // ── Parse request body ────────────────────────────────────────────────
      const { itemName, cost, targetDate, priority, plan } = (req.body ?? {}) as {
        itemName: string;
        cost: number;
        targetDate?: string;
        priority?: 'low' | 'medium' | 'high';
        plan?: CoachPlan;
      };
      void priority;
      if (!itemName || typeof itemName !== 'string' || itemName.length > 200 ||
          typeof cost !== 'number' || !(cost > 0) || cost > 1000000000) {
        res.status(400).json({ ok: false, error: 'invalid-request' });
        return;
      }

      // Category id → label map (for naming categories in the advice).
      const catDefs = settings.categories ?? [];
      const catLabel = (id: string) => catDefs.find(c => c.id === id)?.label ?? id;

      // ── Read transactions (last 90 days through the future) + budget ──────
      // No upper bound: the query also returns future-dated planned one-offs and
      // recurring templates (their `date` is the next, future occurrence).
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const [txSnap, budgetSnap] = await Promise.all([
        db.collection(`users/${uid}/transactions`).where('date', '>=', cutoffStr).get(),
        db.doc(`users/${uid}/meta/budget`).get(),
      ]);

      type TxDoc = {
        type?: string; amount?: number; shared?: number; category?: string;
        date?: string; seriesId?: string; recurring?: { freq?: Freq; until?: string };
      };
      const txs = txSnap.docs.map(d => d.data() as TxDoc);
      const budget = (budgetSnap.data() ?? {}) as {
        savingsTarget?: number;
        categoryBudgets?: Record<string, number>;
        incomeBudgets?: Record<string, number>;
        investmentBudgets?: Record<string, number>;
      };
      const ownShareOf = (t: TxDoc) => (Number(t.amount) || 0) - (Number(t.shared) || 0);

      const nowDate = new Date();
      const todayISO = nowDate.toISOString().slice(0, 10);
      const monthStart = todayISO.slice(0, 7); // YYYY-MM
      const lastDay = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
      const monthEnd = `${monthStart}-${String(lastDay).padStart(2, '0')}`;

      // Current month, split into REALIZED (date <= today) and UPCOMING (date > today).
      let incomeRealized = 0, expRealized = 0, investRealized = 0;
      let upcomingPlannedExp = 0;       // future-dated one-off expenses this month
      let upcomingPlannedInvest = 0;    // future-dated one-off investments this month
      const catSpend: Record<string, number> = {};   // realized variable spend by category
      for (const t of txs) {
        if (t.date?.slice(0, 7) !== monthStart) continue;
        const isFuture = (t.date ?? '') > todayISO;
        const isRecurringTemplate = !!t.recurring;
        const own = ownShareOf(t);
        if (t.type === 'income') {
          if (!isFuture && !isRecurringTemplate) incomeRealized += Number(t.amount) || 0;
        } else if (t.type === 'expense') {
          if (isRecurringTemplate) continue; // handled via the recurring projection below
          if (isFuture) { upcomingPlannedExp += own; }
          else {
            expRealized += own;
            if (!t.seriesId && t.category) catSpend[t.category] = (catSpend[t.category] ?? 0) + own;
          }
        } else if (t.type === 'investment') {
          if (isRecurringTemplate) continue;
          if (isFuture) upcomingPlannedInvest += Number(t.amount) || 0;
          else investRealized += Number(t.amount) || 0;
        }
      }

      // Upcoming RECURRING occurrences (expense & investment) still due this month.
      let upcomingRecurringExp = 0, upcomingRecurringInvest = 0;
      for (const t of txs) {
        const rule = t.recurring;
        if (!rule?.freq) continue;
        const recurrence: RecurrenceRule = { ...rule, freq: rule.freq };
        if (recurrence.until && recurrence.until < todayISO) continue;
        let d = t.date ?? todayISO;
        let guard = 500;
        while (d <= todayISO && --guard > 0) d = addPeriod(d, recurrence);
        let cap = 40;
        while (d <= monthEnd && (!rule.until || d <= rule.until) && --cap > 0) {
          if (t.type === 'expense') upcomingRecurringExp += ownShareOf(t);
          else if (t.type === 'investment') upcomingRecurringInvest += Number(t.amount) || 0;
          d = addPeriod(d, recurrence);
        }
      }

      // Recent (prior months) averages: variable expense, income, investment.
      const recentVarExp: Record<string, number> = {};
      const recentIncome: Record<string, number> = {};
      const recentInvest: Record<string, number> = {};
      for (const t of txs) {
        const mo = t.date?.slice(0, 7);
        if (!mo || mo === monthStart) continue;
        if ((t.date ?? '') > todayISO) continue; // ignore future when averaging history
        if (t.type === 'expense' && !t.seriesId && !t.recurring) {
          recentVarExp[mo] = (recentVarExp[mo] ?? 0) + ownShareOf(t);
        } else if (t.type === 'income' && !t.recurring) {
          recentIncome[mo] = (recentIncome[mo] ?? 0) + (Number(t.amount) || 0);
        } else if (t.type === 'investment' && !t.recurring) {
          recentInvest[mo] = (recentInvest[mo] ?? 0) + (Number(t.amount) || 0);
        }
      }
      const avg = (o: Record<string, number>) => {
        const v = Object.values(o); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      };
      const avgVarExp = avg(recentVarExp);
      const avgInc = avg(recentIncome);
      const avgInvest = avg(recentInvest);

      const prog = Math.min(1, nowDate.getDate() / lastDay);
      const variableRemaining = Math.max(0, 1 - prog) * (avgVarExp > 0 ? avgVarExp : (prog > 0 ? expRealized / prog : 0));

      const projectedInc = Math.round(Math.max(incomeRealized, avgInc));
      const projectedExp = Math.round(expRealized + variableRemaining + upcomingRecurringExp + upcomingPlannedExp);
      const projectedInvest = Math.round(Math.max(investRealized, avgInvest) + upcomingRecurringInvest + upcomingPlannedInvest);

      // Savings = income − expenses − investments (investments are money set aside,
      // so they reduce free cash; they're also a lever the user can pause).
      const projectedMonthlySaving = projectedInc - projectedExp - projectedInvest;

      // Budget context.
      const savingsTarget = Math.max(0, Number(budget.savingsTarget) || 0);
      const plannedExpBudget = Object.values(budget.categoryBudgets ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
      const upcomingCommitted = Math.round(upcomingRecurringExp + upcomingPlannedExp);

      // ── Affordability over time (no "already saved" input) ────────────────
      // We never ask how much the user already has. We reason purely on the
      // saving pace: how many MONTHS of normal saving it takes to cover the
      // cost, and how that shortens if a slice of variable spending is trimmed.
      const safeSaving = Math.max(0, projectedMonthlySaving);

      // Top variable spending categories — candidates to trim.
      const topCuts = Object.entries(catSpend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, v]) => ({ categoryId: id, label: catLabel(id), amount: Math.round(v) }));

      // Realistic accelerated pace: assume ~30% can be shaved off the top
      // variable categories and redirected to the goal.
      const monthlyCutPotential = Math.round(topCuts.reduce((s, c) => s + c.amount * 0.3, 0));
      const acceleratedSaving = safeSaving + monthlyCutPotential;

      const monthsToAfford = safeSaving > 0 ? Math.ceil(cost / safeSaving) : null;
      const monthsToAffordWithCuts = acceleratedSaving > 0 ? Math.ceil(cost / acceleratedSaving) : null;

      // Small-purchase threshold: if a single month's saving covers the cost,
      // it fits THIS month without pushing the budget into the red. Otherwise
      // `monthOvershoot` is how much buying it all now would overshoot by.
      const fitsThisMonth = safeSaving > 0 && cost <= safeSaving;
      const monthOvershoot = safeSaving > 0 ? Math.max(0, Math.round(cost - safeSaving)) : Math.round(cost);
      const leftoverIfBought = fitsThisMonth ? Math.round(safeSaving - cost) : 0;

      // Project the calendar month you'd reach the goal (Italian month name).
      const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
      const targetMonthName = (months: number | null): string | null => {
        if (months === null) return null;
        const d = new Date(nowDate.getFullYear(), nowDate.getMonth() + months, 1);
        return `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
      };
      const readyByWithCuts = targetMonthName(monthsToAffordWithCuts);
      const readyByPace = targetMonthName(monthsToAfford);

      // Optional deadline: feasibility judged against the accelerated pace.
      let daysLeft: number | null = null;
      let requiredMonthly: number | null = null;
      let targetFeasible: boolean | null = null;
      if (targetDate) {
        const target = new Date(targetDate);
        daysLeft = Math.max(1, Math.ceil((target.getTime() - Date.now()) / 86400000));
        const monthsAvailable = daysLeft / 30.4;
        requiredMonthly = Math.round(cost / monthsAvailable);
        targetFeasible = requiredMonthly <= acceleratedSaving;
      }

      // ── Call Gemini for the Italian narrative ─────────────────────────────
      if (!apiKey) {
        console.error('generateAffordabilityAdvice: GEMINI_API_KEY missing');
        res.status(503).json({ ok: false, error: 'unavailable' });
        return;
      }

      // Build a compact, factual brief that CROSS-REFERENCES the whole picture:
      // income, expenses, investments, budget targets and already-committed
      // (recurring + planned) outflows. Let the model phrase it freely.
      const facts: string[] = [];
      facts.push(`Acquisto richiesto: "${itemName}", costo ${Math.round(cost)}€.`);
      facts.push(`Quadro mensile stimato — entrate ~${projectedInc}€, uscite ~${projectedExp}€, investimenti ~${projectedInvest}€, quindi risparmio netto ~${projectedMonthlySaving}€.`);
      if (projectedInvest > 0) {
        facts.push(`Degli investimenti, ~${projectedInvest}€/mese: sono una leva: l'utente potrebbe ridurli o sospenderli temporaneamente per liberare liquidità verso questo acquisto.`);
      }
      if (upcomingCommitted > 0) {
        facts.push(`Da qui a fine mese ci sono già spese impegnate per ~${upcomingCommitted}€ (ricorrenti ~${Math.round(upcomingRecurringExp)}€ + previste/programmate ~${Math.round(upcomingPlannedExp)}€): tienine conto, riducono il margine residuo del mese.`);
      }
      if (savingsTarget > 0) {
        const vsTarget = projectedMonthlySaving - savingsTarget;
        facts.push(`Obiettivo di risparmio mensile impostato: ${savingsTarget}€. Al ritmo attuale ${vsTarget >= 0 ? `lo supera di ~${vsTarget}€` : `manca di ~${Math.abs(vsTarget)}€`}. Se l'acquisto erode il risparmio sotto l'obiettivo, segnalalo.`);
      }
      if (plannedExpBudget > 0) {
        facts.push(`Budget di spesa pianificato dall'utente: ~${Math.round(plannedExpBudget)}€/mese complessivi sulle categorie.`);
      }
      if (safeSaving <= 0) {
        facts.push(`Attenzione: a ritmo attuale il mese non genera risparmio (~${projectedMonthlySaving}€): senza tagli o senza sospendere gli investimenti non si accumula nulla.`);
      }
      if (fitsThisMonth) {
        facts.push(`SPESA PICCOLA: una mensilità di risparmio la copre. Comprandola subito chiuderesti il mese con ~${leftoverIfBought}€ da parte. Fattibile entro il mese senza andare in rosso.`);
      } else if (safeSaving > 0) {
        facts.push(`SPESA IMPORTANTE: comprandola tutta ora sforeresti di ~${monthOvershoot}€. Meglio diluire su più mesi.`);
        if (monthsToAfford !== null) facts.push(`A ritmo attuale servono ~${monthsToAfford} mesi (pronto verso ${readyByPace}).`);
      }
      if (topCuts.length > 0) {
        const cutsStr = topCuts.map(c => `${c.label} (~${c.amount}€/mese)`).join(', ');
        facts.push(`Categorie variabili più alte del mese (dove tagliare): ${cutsStr}.`);
      }
      if (!fitsThisMonth && monthsToAffordWithCuts !== null && monthsToAffordWithCuts !== monthsToAfford) {
        facts.push(`Tagliando ~30% su quelle categorie (~${monthlyCutPotential}€/mese in più) i mesi scendono a ~${monthsToAffordWithCuts} (pronto verso ${readyByWithCuts}).`);
      }
      if (targetDate && requiredMonthly !== null) {
        facts.push(`Scadenza voluta: entro ${daysLeft} giorni → servirebbero ${requiredMonthly}€/mese, ${targetFeasible ? 'raggiungibile con qualche taglio o pausa investimenti' : 'difficile senza tagli importanti o senza allungare i tempi'}.`);
      }

      // Il client calcola il piano con il motore puro dell'app (savingsEngine):
      // stesse primitive della dashboard, quindi numeri che non possono
      // contraddirla. Quando c'è, è LUI la fonte — al modello resta il
      // racconto, che è la parte che sa fare bene.
      if (usablePlan(plan)) {
        facts.length = 0;
        facts.push(`Ritmo di risparmio su cui contare: ${Math.round(plan.sustainableMonthly)}€/mese (la più bassa delle medie su 3/6/12 mesi, così il piano non salta al primo mese normale).`);
        facts.push(`Storico disponibile: ${plan.monthsOfHistory} mesi chiusi.`);
        if (plan.fixedMonthlyCost > 0) facts.push(`Già impegnati ogni mese in rate, abbonamenti e ricorrenti: ${Math.round(plan.fixedMonthlyCost)}€.`);
        facts.push(`Liquidità libera oggi: ${Math.round(plan.freeLiquidity)}€.`);
        if (plan.savingsTarget > 0) facts.push(`Obiettivo di risparmio mensile impostato: ${Math.round(plan.savingsTarget)}€.`);
        if (plan.monthlyIncome != null && plan.monthlyExpense != null) {
          facts.push(`Entrate misurate: ${Math.round(plan.monthlyIncome)}€/mese, uscite: ${Math.round(plan.monthlyExpense)}€/mese${plan.savingsRate != null ? ` (ne resta il ${Math.round(plan.savingsRate * 100)}%)` : ''}.`);
        }
        if (plan.breakdown) {
          facts.push(`Di quelle uscite: ${Math.round(plan.breakdown.fixedMonthly)}€ fisse, ${Math.round(plan.breakdown.periodicMonthly)}€ da accantonare per spese periodiche, ${Math.round(plan.breakdown.variableMonthly)}€ variabili. Tetto realistico ai tagli: ${Math.round(plan.breakdown.reducibleMonthly)}€/mese IN TUTTO.`);
        }
        if (plan.paceConfidence) {
          facts.push(`Affidabilità del ritmo: ${plan.paceConfidence}${plan.worstMonthNet != null ? `. Mese chiuso peggiore osservato: ${Math.round(plan.worstMonthNet)}€` : ''}.`);
        }
        if (plan.runwayMonths != null) facts.push(`La liquidità libera copre ${plan.runwayMonths} mesi di spese.`);
        facts.push(`Costo: ${Math.round(cost)}€. ${plan.fitsThisMonth ? 'Rientra nel risparmio di un mese.' : 'NON rientra nel risparmio di un mese.'}`);
        if (plan.affordableNow) facts.push('La liquidità libera basterebbe già oggi per pagarlo.');
        if (plan.monthsToAfford !== null) facts.push(`Mesi al traguardo al ritmo attuale: ${plan.monthsToAfford} (pronto verso ${plan.readyByISO ?? '—'}).`);
        if (plan.requiredMonthly !== null) {
          facts.push(`Con la scadenza voluta servono ${Math.round(plan.requiredMonthly)}€/mese: ${plan.feasible ? 'raggiungibile' : 'NON raggiungibile'} al ritmo attuale${plan.gapMonthly > 0 ? `, mancano ${Math.round(plan.gapMonthly)}€/mese` : ''}.`);
        }
        if (plan.cuts.length > 0) {
          facts.push(`Tagli già dimostrati dai dati (l'utente ha speso così almeno una volta): ${plan.cuts.map(c => `${c.label} −${Math.round(c.amount)}€ su ${Math.round(c.currentMonthly)}€`).join(', ')}. Non proporne di più grandi.`);
          if (plan.monthsWithCuts !== null) facts.push(`Con quei tagli i mesi scendono a ${plan.monthsWithCuts}.`);
        }
        if (plan.topCategories.length > 0) {
          const NATURE: Record<string, string> = {
            fixed: 'FISSA, non tagliabile',
            periodic: 'PERIODICA, da accantonare, non tagliabile',
            variable: 'variabile, qui si può agire',
            oneOff: 'una tantum, non è un ritmo',
          };
          facts.push(`Spese per categoria: ${plan.topCategories.map(c => {
            const kind = c.nature ? ` — ${NATURE[c.nature] ?? c.nature}${c.reason ? `: ${c.reason}` : ''}` : '';
            return `${c.label} ${Math.round(c.monthlyAvg)}€${kind}`;
          }).join('; ')}.`);
        }
        for (const n of plan.notes) facts.push(n);
      }

      const prompt =
        (plan ? `I NUMERI QUI SOTTO SONO GIÀ CALCOLATI E VERIFICATI: usali così come sono. ` +
          `Non ricalcolarli, non arrotondarli diversamente, non inventarne altri. ` +
          `Se un dato non c'è, non dedurlo: parla di quello che c'è.\n\n` : '') +
        `Sei il coach finanziario dell'app Sunny: amichevole, schietto e concreto. ` +
        `L'utente vuole sapere se può permettersi un acquisto. NON chiedere mai quanto ha già da parte.\n\n` +
        `Incrocia TUTTO il quadro: entrate, uscite, investimenti, obiettivo di risparmio, budget e ` +
        `spese già impegnate (ricorrenti e previste). Le leve per liberare liquidità sono due: ` +
        `ridurre le spese variabili E/O sospendere temporaneamente gli investimenti — valuta quale ha più senso.\n\n` +
        `Regola sul periodo:\n` +
        `- Se la spesa è PICCOLA (una mensilità di risparmio la copre senza mandarlo in rosso), ` +
        `dillo: si può fare già questo mese, e accenna a quanto gli resterebbe.\n` +
        `- Se la spesa è IMPORTANTE (lo farebbe sforare), NON forzare il rientro nel mese: ragiona su più ` +
        `mesi, di' per quanti mesi accantonare, cosa ridurre (o se vale la pena rallentare gli investimenti), ` +
        `e stima il periodo (es. "verso ottobre") in cui ci arriva.\n\n` +
        `Dati (usali, non elencarli meccanicamente):\n- ${facts.join('\n- ')}\n\n` +
        `Scrivi in italiano, 2-4 frasi, tono colloquiale e vario (cambia ogni volta apertura, ritmo e ` +
        `struttura). Cita per nome 1-2 categorie o leve concrete. Niente markdown, niente elenchi puntati, ` +
        `niente formule fisse. Dai una risposta che suoni umana e su misura.`;

      const gemResp = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // High temperature + topP for genuinely varied, non-templated replies.
            generationConfig: { temperature: 1.15, topP: 0.95, maxOutputTokens: 400 },
          }),
        },
        GEMINI_TIMEOUT_MS,
      );
      if (!gemResp.ok) {
        console.error('Gemini REST non-2xx (affordability):', gemResp.status);
        res.status(502).json({ ok: false, error: 'unavailable' });
        return;
      }
      const gemData = (await gemResp.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      // Validate + cap the model output before returning it.
      const advice = (gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().slice(0, 4000);

      res.json({
        ok: true,
        monthlySaving: Math.round(projectedMonthlySaving),
        monthlyIncome: projectedInc,
        monthlyExpenses: projectedExp,
        monthlyInvestments: projectedInvest,
        upcomingCommitted,
        savingsTarget,
        fitsThisMonth,
        monthOvershoot: fitsThisMonth ? 0 : monthOvershoot,
        leftoverIfBought,
        monthsToAfford,
        monthsToAffordWithCuts,
        readyBy: readyByWithCuts ?? readyByPace,
        requiredMonthly,
        targetFeasible,
        daysLeft,
        topCuts,
        advice,
        remaining,
        // Quando il client ha mandato il piano, sono i SUOI numeri a valere:
        // vengono dallo stesso motore della dashboard. Lo spread sta in fondo
        // perché sovrascriva quelli calcolati qui sopra, non il contrario.
        ...(plan ? {
          monthlySaving: Math.round(plan.sustainableMonthly),
          ...(plan.monthlyIncome != null ? { monthlyIncome: Math.round(plan.monthlyIncome) } : {}),
          ...(plan.monthlyExpense != null ? { monthlyExpenses: Math.round(plan.monthlyExpense) } : {}),
          ...(plan.fixedMonthlyCost != null ? { upcomingCommitted: Math.round(plan.fixedMonthlyCost) } : {}),
          fitsThisMonth: plan.fitsThisMonth,
          monthsToAfford: plan.monthsToAfford,
          monthsToAffordWithCuts: plan.monthsWithCuts,
          requiredMonthly: plan.requiredMonthly,
          targetFeasible: plan.feasible,
          savingsTarget: plan.savingsTarget,
          topCuts: plan.cuts.map((c) => ({ categoryId: c.label, label: c.label, amount: Math.round(c.amount) })),
        } : {}),
      });
    } catch (err) {
      logError('generateAffordabilityAdvice failed', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AI DIGEST
//
// Generates a 2-3 sentence Italian financial summary using Google Gemini.
// ─────────────────────────────────────────────────────────────────────────────

export const generateDigest = onRequest(
  // onRequest (plain HTTP) instead of onCall: the callable protocol was
  // returning "internal" before our handler ran (project-level IAM/App Check
  // issue). A plain HTTP endpoint avoids that layer entirely.
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
      if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
      if (bodyTooLarge(req)) { res.status(413).json({ error: 'payload-too-large' }); return; }

      // Require a valid signed-in user: prevents anonymous abuse of the endpoint
      // (and of the paid Gemini quota).
      const uid = await verifyBearer(req.headers.authorization);
      if (!uid) { res.status(401).json({ error: 'unauthorized' }); return; }
      if (!await verifyAppCheckSoft(req, 'generateDigest')) {
        res.status(401).json({ error: 'appcheck-failed' }); return;
      }

      // Atomic per-user daily cap. Reuses meta/aiCoach with dedicated fields so
      // it doesn't collide with the affordability limiter (dailyCount/lastResetDay).
      const digestDay = new Date().toISOString().slice(0, 10);
      const digestRef = db.doc(`users/${uid}/meta/aiCoach`);
      const digestAllowed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(digestRef);
        const rl = (snap.data() ?? {}) as { digestCount?: number; digestResetDay?: string };
        const count = (rl.digestResetDay === digestDay) ? (rl.digestCount ?? 0) : 0;
        if (count >= MAX_DIGEST_CALLS_PER_DAY) return false;
        tx.set(digestRef, { digestCount: count + 1, digestResetDay: digestDay }, { merge: true });
        return true;
      });
      if (!digestAllowed) { res.status(429).json({ error: 'rate-limit' }); return; }

      const { income, expenses, investments, saved, topInsights } = (req.body ?? {}) as {
        income: number; expenses: number; investments: number; saved: number; topInsights: string[];
      };

      if (!apiKey) { console.error('generateDigest: GEMINI_API_KEY missing'); res.status(503).json({ error: 'unavailable' }); return; }

      const prompt =
       `Sei l'assistente finanziario dell'app Sunny. ` +
      `Scrivi esattamente 2-3 frasi in italiano sintetico e diretto che riassumono la situazione finanziaria del mese. ` +
      `Il mese potrebbe essere ancora in corso: non dire che l'utente è "in perdita", "in negativo" o "sotto" solo perché alcune entrate previste non sono ancora arrivate. ` +
      `Interpreta entrate, uscite e risparmio come dati parziali se il mese non è finito. ` +
      `Se le uscite sono alte rispetto alle entrate registrate, usa un tono prudente e parla di ritmo di spesa da monitorare, non di perdita definitiva. ` +
      `Dati attuali: entrate registrate ${income}€, uscite registrate ${expenses}€, investito ${investments}€, saldo/risparmio registrato ${saved}€. ` +
      `Insight principali: ${(topInsights ?? []).slice(0, 5).join('; ')}. ` +
      `Non usare markdown. Solo testo piano, frasi brevi, tono positivo e concreto.`;

      const gemResp = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
        GEMINI_TIMEOUT_MS,
      );

      if (!gemResp.ok) {
        console.error('Gemini REST non-2xx (digest):', gemResp.status);
        res.status(502).json({ error: 'unavailable' });
        return;
      }

      const data = (await gemResp.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
      if (!text) { console.error('generateDigest: empty Gemini response'); res.status(502).json({ error: 'unavailable' }); return; }

      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
      res.json({ sentences });
    } catch (err) {
      logError('generateDigest failed', err);
      res.status(500).json({ error: 'unavailable' });
    }
  }
);
