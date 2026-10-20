const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
export function matchesSettingsQuery(label: string, description: string | undefined, group: string, query: string): boolean {
  const haystack = normalize(`${group} ${label} ${description ?? ''}`);
  return normalize(query).trim().split(/\s+/).every(word => haystack.includes(word));
}
