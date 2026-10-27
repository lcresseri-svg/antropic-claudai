import { describe, expect, it, vi } from 'vitest';
import { EMOJI_CHOICES } from '../defaults';
import { emojiKey, mergeEmojiChoices, validateEmojiInput } from './emojiCatalog';

describe('global emoji catalog validation', () => {
  it('normalizes canonical Unicode and ignores only emoji presentation selectors for identity', () => {
    expect(emojiKey('e\u0301❤️')).toBe('é❤');
    expect(emojiKey('👩🏽‍⚕️')).toBe('👩🏽‍⚕');
    expect(emojiKey('👩🏽')).not.toBe(emojiKey('👩'));
  });

  it.each(['🦦', '👩🏽‍🚀', '👨‍👩‍👧‍👦', '🇮🇹', '1️⃣', '#⃣', '☀', '☀️',
    '👩🏽‍⚕', '💇‍♀', '🕵🏽‍♂', '❤‍🔥', '👁‍🗨', '🫱🏻‍🫲🏿', '🐦‍🔥',
    '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'])('accepts a single native emoji: %s', value => {
    expect(validateEmojiInput(`  ${value}\n`, [])).toBe(value);
  });

  it.each(['', '   ', 'ciao', 'a', '/', '🦦/🦭', '🦦🦭', '🦦 ciao', '1', '🇮', '🏽',
    '🦦‍', '🦦🏽', '🦦\u0301', '\uFE0F', '•', '₿', '🏴\u{E0067}', '🖧', '\u{1FC00}',
    '😀‍😀', '🦦‍🦭'])('rejects invalid input: %s', value => {
    expect(() => validateEmojiInput(value, [])).toThrow(/emoji/i);
  });

  it('rejects duplicates including presentation variants', () => {
    expect(() => validateEmojiInput('❤', ['❤️'])).toThrow(/già presente/i);
    expect(() => validateEmojiInput('🦦', ['🦦'])).toThrow(/già presente/i);
    expect(validateEmojiInput('👩🏽', ['👩'])).toBe('👩🏽');
  });

  it('keeps every original choice in order, including symbols and preexisting presentation variants', () => {
    const merged = mergeEmojiChoices(['🦦', '🦦️', '🦭', 'ciao', '🦦🦭', '🛍', ' • ', '₿']);
    expect(merged.slice(0, EMOJI_CHOICES.length)).toEqual(EMOJI_CHOICES);
    expect(merged.slice(EMOJI_CHOICES.length)).toEqual(['🦦', '🦭']);
    expect(merged).toContain('•');
    expect(merged).toContain('₿');
    expect(merged).toContain('🛍️');
    expect(merged).toContain('🛍');
  });

  it('keeps skin tones and the submitted presentation form when checking a recognized ZWJ sequence', () => {
    expect(validateEmojiInput(' 👩🏽‍⚕ ', [])).toBe('👩🏽‍⚕');
    expect(validateEmojiInput('🫱🏻‍🫲🏿', ['🫱🏽‍🫲🏿'])).toBe('🫱🏻‍🫲🏿');
    expect(() => validateEmojiInput('👩🏽‍⚕', ['👩🏽‍⚕️'])).toThrow(/già presente/i);
    expect(mergeEmojiChoices(['😀‍😀', '🦦‍🦭', '🐦‍🔥']).slice(EMOJI_CHOICES.length)).toEqual(['🐦‍🔥']);
  });

  it('falls back safely without Unicode string properties and asks for a browser update for new ZWJ sequences', async () => {
    vi.resetModules();
    vi.stubGlobal('RegExp', new Proxy(RegExp, {
      construct(target, args) {
        if (args[1] === 'v') throw new SyntaxError('Unicode string properties unavailable');
        return Reflect.construct(target, args);
      },
    }));
    let fallback: typeof import('./emojiCatalog');
    try { fallback = await import('./emojiCatalog'); }
    finally { vi.unstubAllGlobals(); }
    expect(fallback.validateEmojiInput('💇‍♀', [])).toBe('💇‍♀');
    expect(fallback.validateEmojiInput('👩‍⚕', [])).toBe('👩‍⚕');
    expect(fallback.validateEmojiInput('🦦', [])).toBe('🦦');
    expect(fallback.validateEmojiInput('#⃣', [])).toBe('#⃣');
    expect(() => fallback.validateEmojiInput('🐦‍🔥', [])).toThrow(/aggiorna.*browser/i);
    expect(() => fallback.validateEmojiInput('😀‍😀', [])).toThrow(/emoji/i);
    expect(fallback.mergeEmojiChoices(['🐦‍🔥']).slice(EMOJI_CHOICES.length)).toEqual(['🐦‍🔥']);
    expect(() => fallback.validateEmojiInput('👩🏽‍🚀', [])).toThrow(/aggiorna.*browser/i);
    const remote = fallback.mergeEmojiChoices(['👩🏽‍🚀', '👩🏽‍🚀️', '👩🏽‍⚕', '👩🏽‍⚕️', '🦦🦭', 'ciao', '🛍']);
    expect(remote.slice(0, EMOJI_CHOICES.length)).toEqual(EMOJI_CHOICES);
    expect(remote.slice(EMOJI_CHOICES.length)).toEqual(['👩🏽‍🚀', '👩🏽‍⚕']);
  });
});
