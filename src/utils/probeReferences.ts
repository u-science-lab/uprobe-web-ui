import type { ProbesConfig } from '../types';
import { walkProbes } from './probeBuilder';

interface Token { raw: string; value?: string; start: number; end: number }
function tokens(expression: string): Token[] {
  return [...expression.matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_]\w*|[^\s]/g)].map(match => {
    const raw = match[0];
    return {
      raw, start: match.index!, end: match.index! + raw.length,
      ...(/^['"]/.test(raw) ? { value: raw.slice(1, -1).replace(/\\([\\'"])/g, '$1') } : {}),
    };
  });
}

// Match actual lookups, never text inside fixed-sequence or other quoted strings.
export function barcodeReferences(expression: string): { names: string[]; dynamic: boolean } {
  const items = tokens(expression), names: string[] = [];
  let dynamic = false;
  for (let index = 0; index < items.length; index++) {
    if (items[index].raw !== 'encoding' || items[index - 1]?.raw === '.') continue;
    if (items[index + 1]?.raw !== '[') continue;
    let end = index + 2, depth = 1;
    for (; end < items.length && depth; end++) {
      if (items[end].raw === '[') depth++;
      if (items[end].raw === ']') depth--;
    }
    if (depth || items[end]?.raw !== '[') continue;
    const key = items[end + 1];
    if (key?.value !== undefined && items[end + 2]?.raw === ']') names.push(key.value);
    else dynamic = true;
  }
  return { names: [...new Set(names)], dynamic };
}
export function usesBarcode(probes: ProbesConfig, name: string): boolean {
  let used = false;
  walkProbes(probes, node => {
    const references = barcodeReferences(node.expr || '');
    if (references.dynamic || references.names.includes(name)) used = true;
  });
  return used;
}

interface RegionLookup { name: string; start: number; end: number; bracket: boolean }
function regionLookups(expression: string): RegionLookup[] {
  const items = tokens(expression), result: RegionLookup[] = [];
  for (let index = 0; index < items.length; index++) {
    if (items[index].raw !== 'target_parts' || items[index - 1]?.raw === '.') continue;
    if (items[index + 1]?.raw === '[' && items[index + 2]?.value !== undefined && items[index + 3]?.raw === ']') {
      result.push({ name: items[index + 2].value!, start: items[index].start, end: items[index + 3].end, bracket: true });
    } else if (items[index + 1]?.raw === '[') {
      // A dynamic lookup may use any region, so deletion needs explicit resolution.
      result.push({ name: '', start: items[index].start, end: items[index].end, bracket: true });
    } else if (['.', ':'].includes(items[index + 1]?.raw) && /^[A-Za-z_]\w*$/.test(items[index + 2]?.raw || '')) {
      result.push({ name: items[index + 2].raw, start: items[index].start, end: items[index + 2].end, bracket: false });
    }
  }
  return result;
}
const referenceFields = new Set(['expr', 'condition', 'target', 'target_regions']);
function transformReferences(value: any, transform: (text: string, path: string) => string, path = '', field = ''): any {
  if (typeof value === 'string') return referenceFields.has(field) ? transform(value, path) : value;
  if (Array.isArray(value)) return value.map((item, index) => transformReferences(item, transform, `${path}[${index}]`, field));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    // Some post-processing settings use sequence paths as mapping keys.
    const nextKey = key.startsWith('target_parts.') || key.startsWith('target_parts:') || key.startsWith('target_parts[') ? transform(key, childPath) : key;
    return [nextKey, transformReferences(child, transform, childPath, key)];
  }));
}

/** Include saved attributes and other protocol scopes, not only visible probe forms. */
export function targetRegionReferences(protocol: any, names: string[]): string[] {
  const wanted = new Set(names), found = new Set<string>();
  transformReferences(protocol, (text, path) => {
    if (wanted.size && regionLookups(text).some(reference => !reference.name || wanted.has(reference.name))) found.add(path);
    return text;
  });
  return [...found];
}
export function renameTargetReferences<T>(protocol: T, before: string, after: string): T {
  return transformReferences(protocol, text => {
    let result = text;
    for (const reference of regionLookups(text).reverse()) {
      if (reference.name !== before) continue;
      const replacement = reference.bracket ? `target_parts['${after}']` : text.slice(reference.start, reference.end - before.length) + after;
      result = result.slice(0, reference.start) + replacement + result.slice(reference.end);
    }
    return result;
  });
}
