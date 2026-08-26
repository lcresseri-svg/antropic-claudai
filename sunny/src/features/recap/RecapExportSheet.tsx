// Come portare fuori un riepilogo.
//
// "Esporta" era `window.print()` e basta. Su desktop stampa (o salva in PDF);
// da telefono spesso non fa niente — in PWA installata la stampa non c'è, e
// l'utente resta con un bottone che non risponde. Qui le vie sono tre, e le
// due che funzionano sempre dal telefono vengono prima.

import { useState } from 'react';
import { SheetShell } from '../investments/SheetShell';
import { MonthlyRecap } from './monthlyRecap';
import { recapToText } from './recapExport';

interface Props {
  open: boolean;
  recap: MonthlyRecap;
  onClose: () => void;
}

/**
 * Copia negli appunti con ripiego.
 *
 * `navigator.clipboard` esiste solo in contesti sicuri e su qualche browser
 * datato non c'è: il ripiego con la textarea nascosta è brutto ma è l'unico
 * modo perché "Copia" non sia un altro bottone che non risponde.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* si prova il ripiego */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function RecapExportSheet({ open, recap, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const text = recapToText(recap);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = async () => {
    setFailed(null);
    try {
      await navigator.share({ title: `Riepilogo ${recap.label}`, text });
      onClose();
    } catch (e) {
      // Annullare la condivisione non è un errore: l'utente ha cambiato idea.
      if ((e as Error)?.name !== 'AbortError') setFailed('Condivisione non riuscita. Prova a copiare il testo.');
    }
  };

  const copy = async () => {
    setFailed(null);
    const ok = await copyText(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
    else setFailed('Copia non riuscita. Seleziona il testo qui sotto e copialo a mano.');
  };

  return (
    <SheetShell open={open} title="Esporta il riepilogo" subtitle={recap.label} onClose={onClose}>
      {canShare && (
        <Action icon="📤" label="Condividi" hint="Mail, messaggi, note: il riepilogo come testo."
          onClick={share} primary />
      )}
      <Action icon="📋" label={copied ? 'Copiato' : 'Copia il testo'}
        hint="Negli appunti, pronto da incollare dove vuoi." onClick={copy} />
      <Action icon="🖨️" label="Stampa o salva in PDF"
        hint="Su computer stampa la pagina intera, tabella dei movimenti compresa. Da telefono può non essere disponibile."
        onClick={() => { onClose(); setTimeout(() => window.print(), 120); }} />

      {failed && <p className="text-[12px] text-red px-1">{failed}</p>}

      {/* L'anteprima è selezionabile: se tutto il resto fallisce, il testo è
          comunque lì e si copia a mano. */}
      <div>
        <p className="label-caps text-secondary mb-1.5">Anteprima</p>
        <pre className="text-[11.5px] text-secondary whitespace-pre-wrap leading-[1.6] bg-card rounded-[16px] p-3.5 max-h-[220px] overflow-y-auto select-text">
          {text}
        </pre>
      </div>
    </SheetShell>
  );
}

function Action({ icon, label, hint, onClick, primary }: {
  icon: string; label: string; hint: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full flex items-start gap-3 text-left rounded-[18px] p-3.5 transition-colors ${
        primary ? 'accent-card' : 'glass-card'}`}>
      <span className="text-[18px] leading-none flex-none mt-0.5" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-primary">{label}</span>
        <span className="block text-[11.5px] text-secondary mt-0.5 leading-snug">{hint}</span>
      </span>
    </button>
  );
}
