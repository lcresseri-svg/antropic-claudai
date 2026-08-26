/**
 * Riepilogo mensile in testo semplice — modulo puro.
 *
 * Serve perché "Esporta" funzioni anche da telefono: lì `window.print()` è
 * inaffidabile (in PWA installata spesso non fa niente), mentre condividere o
 * copiare un testo funziona ovunque. Lo stesso testo alimenta il foglio di
 * condivisione e la copia negli appunti.
 *
 * I numeri NON vengono ricalcolati: arrivano da `MonthlyRecap`, che a sua volta
 * li prende da `insightsEngine`. Il testo condiviso e la pagina stampata
 * dicono per forza la stessa cosa.
 */
import { formatCurrency } from '../../utils';
import { MonthlyRecap, KpiKey } from './monthlyRecap';

const KPI_LABEL: Record<KpiKey, string> = {
  income: 'Entrate', expense: 'Uscite', invest: 'Investito', saved: 'Risparmio',
};

/** "26/08/2026" — data leggibile in fondo al testo condiviso. */
function itDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Il riepilogo come testo condivisibile.
 *
 * Niente markdown: finisce in WhatsApp, nelle note o in una mail, dove gli
 * asterischi resterebbero asterischi.
 */
export function recapToText(recap: MonthlyRecap): string {
  const out: string[] = [];

  out.push(`Riepilogo mensile · ${recap.label}`);
  out.push(`${recap.isPartial ? 'Mese in corso, dati parziali' : 'Mese chiuso'} · ${recap.movements.length} movimenti`);
  out.push('');
  out.push(recap.verdict);
  out.push('');

  for (const k of recap.kpis) {
    // Lo scostamento si aggiunge solo se c'è: "(+0,00 €)" non dice niente.
    const d = k.vsUsual?.outOfUsual ? k.vsUsual : (k.vsPrev ?? k.vsUsual);
    const ref = k.vsUsual?.outOfUsual ? 'vs solito' : 'vs mese scorso';
    const delta = d && d.abs !== 0 ? ` (${formatCurrency(d.abs, { sign: true })} ${ref})` : '';
    out.push(`${KPI_LABEL[k.key]}: ${formatCurrency(k.value)}${delta}`);
  }

  if (recap.drivers.length > 0) {
    out.push('');
    out.push('Dove sono andati i soldi');
    for (const d of recap.drivers) {
      const delta = d.delta !== 0 ? ` (${formatCurrency(d.delta, { sign: true })} sul solito)` : '';
      out.push(`- ${d.label}: ${formatCurrency(d.amount)}${delta}`);
    }
  }

  if (recap.narrative.length > 0) {
    out.push('');
    for (const line of recap.narrative) out.push(line);
  }

  out.push('');
  out.push(`Generato da Sunny il ${itDate(recap.generatedAt)}`);
  return out.join('\n');
}

/** Nome file per la condivisione: `riepilogo-2026-04.txt`. */
export function recapFileName(recap: MonthlyRecap): string {
  return `riepilogo-${recap.month}.txt`;
}
