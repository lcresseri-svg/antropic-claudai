/**
 * Cloud Functions entrypoint — thin re-export layer.
 *
 * The implementation lives in domain modules; the EXPORTED NAMES here are the
 * deployed function names and must never change without a deliberate
 * rename+migration (regions and schedules live next to each function).
 *
 *   shared.ts        Admin SDK init, db, auth/CORS/push helpers
 *   recurring.ts     processRecurringTransactions
 *   notifications.ts sendTestPush + scheduled reminders + encouraging insight
 *   ai.ts            generateDigest, generateAffordabilityAdvice (Gemini)
 *   shortcuts.ts     iOS expense-shortcut token API
 *   metrics.ts       rollupMetrics, testMetricsRollup
 *   deletion.ts      onUserDeleted
 *   feedback.ts      onFeedbackCreated
 */

export { processRecurringTransactions } from './recurring';
export {
  sendTestPush,
  remindLogExpenses,
  sendMonthlySummary,
  remindUpcomingPayments,
  remindInactivity,
  remindMonthEnd,
  sendEncouragingInsight,
} from './notifications';
export { generateAffordabilityAdvice, generateDigest } from './ai';
export {
  issueExpenseToken,
  listExpenseTokens,
  revokeExpenseToken,
  getExpenseOptions,
  addExpense,
} from './shortcuts';
export { rollupMetrics, testMetricsRollup } from './metrics';
export { onUserDeleted } from './deletion';
export { onFeedbackCreated } from './feedback';
