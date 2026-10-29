export interface EncodingField { name: string; length?: number; description?: string }
export function encodingFields(config: any): Record<string, EncodingField> {
  const declared = config?.barcodes?.barcodes || {};
  const keys: string[] = Object.keys(declared);
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.expr === 'string') {
      const pattern = /encoding\s*\[\s*target\s*\]\s*\[\s*['"]([^'"]+)['"]\s*\]/g;
      for (const match of value.expr.matchAll(pattern)) if (!keys.includes(match[1])) keys.push(match[1]);
    }
    Object.values(value.parts || {}).forEach(visit);
  };
  Object.values(config?.probes || {}).forEach(visit);
  const result: Record<string, EncodingField> = {};
  // Keep BC fields in numeric order while using contiguous UI slots.
  const ordered = [...keys.filter(key => /^BC[1-9]\d*$/.test(key)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))), ...keys.filter(key => !/^BC[1-9]\d*$/.test(key))];
  ordered.forEach((key, index) => { result[`barcode${index + 1}`] = { ...declared[key], name: key }; });
  return result;
}
export function encodingCsvValue(row: Record<string, string>, slot: string, field?: EncodingField): string {
  const name = field?.name;
  if (name && name !== slot && row[name] !== undefined && row[slot] !== undefined && row[name] !== row[slot]) throw new Error(`Conflicting CSV columns ${name} and ${slot}`);
  return (name && row[name] !== undefined ? row[name] : row[slot]) || '';
}

export function clearEncodingValues<T extends Record<string, any>>(targets: T[]): T[] {
  return targets.map(target => Object.fromEntries(Object.entries(target).filter(([key]) => !/^barcode[1-9]\d*$/.test(key))) as T);
}
