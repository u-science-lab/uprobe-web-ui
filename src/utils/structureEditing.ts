import { ProbeConfig } from '../types';

export function validPartName(name: string): boolean { return /^[A-Za-z_]\w*$/.test(name); }
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Update sequence references while preserving unrelated attribute names and fixed bases.
export function rewritePartReferences<T>(value: T, owner: string, before: string, after: string): T {
  const pattern = new RegExp(`\\b${escape(owner)}\\.${escape(before)}\\b`, 'g');
  const bracket = new RegExp(`\\b${escape(owner)}\\[(['"])${escape(before)}\\1\\]`, 'g');
  const walk = (item: any): any => {
    if (Array.isArray(item)) return item.map(walk);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
      typeof child === 'string' && (key === 'expr' || key === 'target')
        ? child.replace(pattern, `${owner}.${after}`).replace(bracket, `${owner}['${after}']`)
        : walk(child)]));
  };
  return walk(value);
}

export function editProbePart(probes: Record<string, ProbeConfig>, owner: string, before: string | undefined, name: string, expr: string): Record<string, ProbeConfig> {
  if (!validPartName(name)) throw new Error('Part names must start with a letter or underscore and contain only letters, digits and underscores.');
  if (!expr.trim()) throw new Error('A sequence expression is required.');
  const probe = probes[owner];
  if (!probe || probe.template === undefined) throw new Error('Add parts inside a composite probe.');
  if (name !== before && probe.parts?.[name]) throw new Error('Part name already exists.');
  const next = before && before !== name ? rewritePartReferences(probes, owner, before, name) : structuredClone(probes);
  const parts = Object.fromEntries(Object.entries(next[owner].parts || {}).map(([key, part]) => [key === before ? name : key, key === before ? { ...part, expr } : part]));
  if (!before) parts[name] = { expr };
  next[owner] = { ...next[owner], parts, template: before ? next[owner].template!.split(`{${before}}`).join(`{${name}}`) : next[owner].template + `{${name}}` };
  return next;
}
