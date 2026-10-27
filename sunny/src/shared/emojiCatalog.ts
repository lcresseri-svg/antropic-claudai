import { EMOJI_CHOICES } from '../defaults';

/** Presentation selectors do not make a different catalog entry. Skin tones do. */
export function emojiKey(value: string): string {
  return value.normalize('NFC').replace(/\uFE0F/g, '');
}

// One pictograph (optionally with a supported skin tone), a ZWJ sequence,
// a pair of regional indicators, a keycap, or a complete subdivision flag.
// Unlike the broad Emoji property, this never accepts bare digits or modifiers.
const pictograph = '(?:\\p{Emoji_Modifier_Base}\\uFE0F?\\p{Emoji_Modifier}|(?=\\p{Emoji})\\p{Extended_Pictographic}\\uFE0F?)';
const nativeEmoji = new RegExp(`^(?:${pictograph}(?:\\u200D${pictograph})*|\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\u{1F3F4}[\\u{E0061}-\\u{E007A}]+\\u{E007F})$`, 'u');
const textPresentationPictograph = /(?=\p{Emoji})(?!\p{Emoji_Presentation})\p{Extended_Pictographic}/u;
const skinTone = /^\p{Emoji_Modifier}$/u;
const recognizedEmoji = (() => {
  // A constructor (rather than a regex literal) keeps older browsers loadable.
  try { return new RegExp('^\\p{RGI_Emoji}$', 'v'); }
  catch { return null; }
})();
const knownZwj = new Set(EMOJI_CHOICES.filter(emoji => emoji.includes('\u200D')).map(emojiKey));

function validateZwj(emoji: string): void {
  if (!emoji.includes('\u200D')) return;
  if (!recognizedEmoji) {
    if (knownZwj.has(emojiKey(emoji))) return;
    throw new Error('Impossibile verificare questa sequenza emoji. Aggiorna il browser per aggiungerla.');
  }
  // RGI requires fully-qualified presentation. Restore selectors only for the
  // recognition check, retaining both skin tones and the submitted stored form.
  const points = Array.from(emojiKey(emoji));
  const fullyQualified = points.map((point, index) => point + (
    textPresentationPictograph.test(point) && !skinTone.test(points[index + 1] ?? '') ? '\uFE0F' : ''
  )).join('');
  if (!recognizedEmoji.test(fullyQualified))
    throw new Error('Inserisci una sola emoji riconosciuta, senza combinare simboli separati.');
}

function validateChoice(value: string, existing: readonly string[], requireZwjRecognition: boolean): string {
  const emoji = value.trim().normalize('NFC');
  if (!emoji) throw new Error('Inserisci una emoji.');
  if (Array.from(emoji).length > 64 || !nativeEmoji.test(emoji))
    throw new Error('Inserisci una sola emoji valida, senza testo o altri simboli.');
  if (requireZwjRecognition) validateZwj(emoji);
  const key = emojiKey(emoji);
  if (existing.some(item => emojiKey(item) === key))
    throw new Error('Questa emoji è già presente nel catalogo.');
  return emoji;
}

/** New additions always require recognition, including on older browsers. */
export function validateEmojiInput(value: string, existing: readonly string[]): string {
  return validateChoice(value, existing, true);
}

/** Preserve the legacy palette verbatim; only new entries are validated/deduplicated. */
export function mergeEmojiChoices(extras: string[]): string[] {
  const choices = [...EMOJI_CHOICES];
  for (const extra of extras) {
    // Remote additions were approved by an admin. Without RGI support, retain
    // their native syntax instead of hiding catalog entries on older browsers.
    try { choices.push(validateChoice(extra, choices, recognizedEmoji !== null)); }
    catch { /* Invalid or duplicate remote entries never affect existing choices. */ }
  }
  return choices;
}
