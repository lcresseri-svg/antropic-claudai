import { CategoryDef, TransactionType } from './types';

export async function classifyCategory(
  description: string,
  type: TransactionType,
  categories: CategoryDef[],
  apiKey: string,
): Promise<string | null> {
  if (!apiKey || !description.trim() || type === 'transfer') return null;
  const candidates = categories.filter(c => c.kind === type);
  if (candidates.length === 0) return null;

  try {
    const list = candidates.map(c => `${c.id}: ${c.label}`).join('\n');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        system: `Sei un classificatore di transazioni finanziarie italiane.
Rispondi SOLO con l'ID categoria esatto dall'elenco fornito, senza altro testo.
Se nessuna categoria è adatta, rispondi "null".`,
        messages: [{
          role: 'user',
          content: `Descrizione (tipo: ${type}): "${description}"\n\nCategorie:\n${list}\n\nID categoria:`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { content: { text: string }[] };
    const result = data.content?.[0]?.text?.trim() ?? '';
    return candidates.some(c => c.id === result) ? result : null;
  } catch {
    return null;
  }
}
