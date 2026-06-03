const CAN_VIBRATE = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function vibrate(pattern: number | number[] = 10): void {
  if (CAN_VIBRATE) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

export const haptic = {
  light:  () => vibrate(10),
  medium: () => vibrate(20),
  heavy:  () => vibrate([30, 50, 30]),
  select: () => vibrate(8),
};
