// Preview-only token boundary: no authentication, remote reads or token mutations.
export {shortcutErrorMsg,SUNNY_EXPENSE_SHORTCUT_URL} from '../src/features/settings/expenseShortcut';
export type {ExpenseTokenMeta} from '../src/features/settings/expenseShortcut';
export const listExpenseTokens=async()=>({ok:true as const,tokens:[]});
export const issueExpenseToken=async()=>({ok:false as const,error:'preview'});
export const revokeExpenseToken=async()=>({ok:false as const,error:'preview'});
