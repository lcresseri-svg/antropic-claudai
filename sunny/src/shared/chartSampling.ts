/** Reduce drawing cost while keeping actual endpoints and each bucket's extrema.
 * Source values and the accessible table remain exact, unsampled data.
 */
export function sampleLineIndexes(values: number[], buckets = 120): number[] {
  if (values.length <= buckets * 2) return values.map((_, index) => index);
  const indexes = new Set([0, values.length - 1]);
  const size = Math.ceil(values.length / buckets);
  for (let start = 0; start < values.length; start += size) {
    let min = start, max = start;
    for (let i = start + 1; i < Math.min(start + size, values.length); i++) {
      if (values[i] < values[min]) min = i;
      if (values[i] > values[max]) max = i;
    }
    indexes.add(min); indexes.add(max);
  }
  return [...indexes].sort((a, b) => a - b);
}
