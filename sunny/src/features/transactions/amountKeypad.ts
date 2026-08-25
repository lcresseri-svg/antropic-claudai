/**
 * Tastierino numerico della modale — normalizzazione pura.
 *
 * Sul telefono i numeri della modale non si scrivono con la tastiera di
 * sistema: quella copre metà schermo e fa sparire proprio il campo che si sta
 * compilando. Li scrive il tastierino in fondo alla modale, che però è UNO
 * solo e deve poter servire più campi — importo, quote di una spesa condivisa,
 * totale e numero delle rate, commissione, TFR, mesi di distribuzione.
 *
 * Qui vive la sola cosa che quei campi hanno in comune: cosa succede alla
 * stringa quando si preme un tasto. Tenerla fuori dal componente serve a due
 * cose — un campo nuovo eredita le stesse regole senza riscriverle, e le
 * regole si possono verificare senza montare la modale.
 *
 * Le regole sono quelle dell'importo, che valevano già prima:
 *   - lo zero iniziale viene SOSTITUITO dalla prima cifra vera (si digita "5",
 *     non "05");
 *   - una sola virgola, e mai come primo carattere ("," diventa "0,");
 *   - al massimo due decimali, come l'importo salvato;
 *   - un campo INTERO (numero di rate, mesi) la virgola non la accetta
 *     affatto: una rata e mezza non esiste.
 */

export interface KeypadOpts {
  /** Campo senza decimali: la virgola non entra. */
  integer?: boolean;
  /** Quanti decimali ammettere. Default 2, come l'importo salvato. */
  decimals?: number;
}

/** Il valore del campo dopo aver premuto `key` (una cifra, ',' o 'back'). */
export function applyKeypadKey(prev: string, key: string, opts: KeypadOpts = {}): string {
  if (key === 'back') return prev.slice(0, -1);

  if (key === ',') {
    if (opts.integer) return prev;
    return /[.,]/.test(prev) ? prev : `${prev || '0'},`;
  }

  // Difensivo: dal tastierino arrivano solo cifre, ',' e 'back'. Qualunque
  // altra cosa non deve poter finire nel campo.
  if (!/^\d$/.test(key)) return prev;

  const sep = prev.search(/[.,]/);
  if (sep >= 0 && prev.length - sep > (opts.decimals ?? 2)) return prev;
  return prev === '0' ? key : prev + key;
}

/** Ripulisce un valore digitato con la tastiera di sistema (da `sm` in su). */
export function sanitizeNumericInput(raw: string, opts: KeypadOpts = {}): string {
  return opts.integer ? raw.replace(/\D/g, '') : raw.replace(/[^\d.,]/g, '');
}
