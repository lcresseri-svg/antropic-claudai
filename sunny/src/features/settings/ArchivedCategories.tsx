import { useRef, useState } from 'react';
import { CategoryDef, TYPE_META } from '../../types';

interface Props {
  categories: CategoryDef[];
  onRestore: (id: string) => Promise<void>;
}

export function ArchivedCategories({ categories, onRestore }: Props) {
  const archived = categories.filter(c => c.archived);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);
  const summary = useRef<HTMLElement>(null);

  const restore = async (category: CategoryDef) => {
    if (busy.current) return;
    busy.current = true;
    setPendingId(category.id);
    setError('');
    setMessage('');
    try {
      await onRestore(category.id);
      setMessage(`“${category.label}” riattivata. Puoi selezionarla nei nuovi movimenti.`);
      // The restored row disappears: keep keyboard focus in the archive.
      summary.current?.focus();
    } catch {
      setError(`Riattivazione di “${category.label}” non riuscita. Controlla la connessione e riprova.`);
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  };

  return (
    <details className="bg-card rounded-2xl border border-divider">
      <summary ref={summary} className="min-h-11 px-4 py-3 cursor-pointer text-sm font-semibold text-primary rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
        Categorie archiviate ({archived.length})
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs text-secondary leading-relaxed mb-3">
          Riattiva una categoria per usarla di nuovo. I movimenti già registrati restano collegati alla stessa categoria.
        </p>
        {archived.length === 0 ? (
          <p className="text-sm text-secondary">Nessuna categoria archiviata.</p>
        ) : (
          <ul className="divide-y divide-divider" aria-label="Categorie archiviate">
            {archived.map(category => (
              <li key={category.id} className="flex items-center gap-3 py-3">
                <span aria-hidden="true" className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: category.color + '26' }}>{category.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary break-words">{category.label}</p>
                  <p className="text-xs text-secondary">{TYPE_META[category.kind].label}</p>
                </div>
                <button type="button" onClick={() => void restore(category)} disabled={pendingId !== null}
                  aria-label={`Riattiva ${category.label} (${TYPE_META[category.kind].label.toLowerCase()})`}
                  aria-busy={pendingId === category.id}
                  className="min-h-11 px-3 shrink-0 rounded-xl text-sm font-semibold text-gold bg-gold/10 hover:bg-gold/15 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                  {pendingId === category.id ? 'Riattivo…' : 'Riattiva'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p role="status" className="text-xs text-green mt-2">{message}</p>
        {error && <p role="alert" className="text-xs text-red mt-2">{error}</p>}
      </div>
    </details>
  );
}
