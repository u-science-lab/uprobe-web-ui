import type { ProbeConfig, ProbesConfig } from '../types';
import type { TargetLayout } from './targetLayout';
import { layoutNames, validateTargetLayout } from './targetLayout';
import { TargetLength, parseTargetLength, samplingStep } from './sampling';
import { attributeType, exportAttribute } from './probeConfig';
import { buildAttributeFilter } from './attributeFilters';

export interface TargetConfig {
  source: string;
  length: TargetLength;
  step?: number;
  layout?: TargetLayout;
  attributes?: Record<string, any>;
  [key: string]: any;
}
export interface BarcodeConfig {
  count: number;
  default_length?: number;
  barcodes: Record<string, { length?: number; [key: string]: any }>;
}
export type TemplateSegment = { name: string; literal?: never } | { literal: string; name?: never };
export type SegmentKind = 'target' | 'barcode' | 'fixed' | 'probe' | 'composite' | 'custom';
export interface SegmentForm {
  kind: SegmentKind;
  name: string;
  region: string;
  barcode: string;
  reference: string;
  sequence: string;
  reverse: boolean;
  start: string;
  length: string;
}
export const identifier = /^[A-Za-z_]\w*$/;
const clone = <T,>(value: T): T => structuredClone(value);
const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// The template, including literals and repeated placeholders, controls order.
export function parseTemplate(template: string): TemplateSegment[] {
  const tokens: TemplateSegment[] = [];
  let literal = '';
  const flush = () => { if (literal) { tokens.push({ literal }); literal = ''; } };
  for (let i = 0; i < template.length;) {
    if (template.startsWith('{{', i) || template.startsWith('}}', i)) { literal += template[i]; i += 2; continue; }
    if (template[i] === '{') {
      const match = template.slice(i).match(/^\{([A-Za-z_]\w*)\}/);
      if (!match) throw new Error('This structure uses an unsupported segment placeholder. The saved structure is unchanged.');
      flush(); tokens.push({ name: match[1] }); i += match[0].length;
    } else {
      if (template[i] === '}') throw new Error('Unmatched segment placeholder.');
      literal += template[i++];
    }
  }
  flush(); return tokens;
}
export const buildTemplate = (segments: TemplateSegment[]) => segments.map(s => s.name !== undefined ? `{${s.name}}` : s.literal.replace(/\{/g, '{{').replace(/\}/g, '}}')).join('');
export const createProbe = (): ProbeConfig => ({ template: '', parts: {} });
export function walkProbes(probes: ProbesConfig, visit: (node: ProbeConfig, path: string) => void, prefix = '') {
  for (const [name, node] of Object.entries(probes)) {
    const path = prefix ? `${prefix}.${name}` : name;
    visit(node, path); if (node.parts) walkProbes(node.parts, visit, path);
  }
}
export function getNode(probes: ProbesConfig, path: string[]): ProbeConfig {
  let node = probes[path[0]];
  for (const key of path.slice(1)) node = node?.parts?.[key] as ProbeConfig;
  if (!node) throw new Error('The selected segment no longer exists.');
  return node;
}
export function updateNode(probes: ProbesConfig, path: string[], update: (node: ProbeConfig) => ProbeConfig): ProbesConfig {
  const next = clone(probes);
  if (path.length === 1) next[path[0]] = update(next[path[0]]);
  else { const parent = getNode(next, path.slice(0, -1)); parent.parts![path[path.length - 1]] = update(getNode(next, path)); }
  return next;
}
export function uniqueName(nodes: Record<string, unknown>, prefix: string) {
  let i = 1; while (nodes[`${prefix}${i}`]) i++; return `${prefix}${i}`;
}
export function createPart(parent: ProbeConfig, name: string, node: ProbeConfig): ProbeConfig {
  if (!identifier.test(name) || parent.parts?.[name]) throw new Error('Use a unique name starting with a letter.');
  if (parent.template === undefined) throw new Error('Add segments inside a composite.');
  return { ...parent, parts: { ...parent.parts, [name]: node }, template: parent.template + `{${name}}` };
}
export function reorderPart(parent: ProbeConfig, index: number, offset: number): ProbeConfig {
  const tokens = parseTemplate(parent.template || '');
  const to = index + offset;
  if (to < 0 || to >= tokens.length) return parent;
  [tokens[index], tokens[to]] = [tokens[to], tokens[index]];
  return { ...parent, template: buildTemplate(tokens) };
}

// Only identifier tokens outside quoted strings are dependency references.
export function expressionReferences(expr: string): string[] {
  return [...expr.matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g)].flatMap(m => m[1] ? [m[1]] : []);
}
function rewriteExpression(expr: string, before: string, after: string) {
  return expr.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g, (all, ref: string | undefined) =>
    ref === before ? after : ref?.startsWith(before + '.') ? after + ref.slice(before.length) : all);
}
export function rewriteReferences(probes: ProbesConfig, before: string, after: string): ProbesConfig {
  const next = clone(probes);
  walkProbes(next, node => { if (node.expr !== undefined) node.expr = rewriteExpression(node.expr, before, after); });
  return next;
}
export function renameProbe(probes: ProbesConfig, path: string[], name: string): ProbesConfig {
  const old = path[path.length - 1];
  const siblings = path.length === 1 ? probes : getNode(probes, path.slice(0, -1)).parts!;
  if (!identifier.test(name) || (old !== name && siblings[name])) throw new Error('Use a unique name starting with a letter.');
  const next = clone(probes);
  const parent = path.length > 1 ? getNode(next, path.slice(0, -1)) : undefined;
  const entries = Object.entries(parent?.parts || next).map(([key, node]) => [key === old ? name : key, node]);
  if (parent) {
    parent.parts = Object.fromEntries(entries);
    parent.template = buildTemplate(parseTemplate(parent.template || '').map(s => s.name === old ? { name } : s));
  }
  const renamed = parent ? next : Object.fromEntries(entries);
  return rewriteReferences(renamed, path.join('.'), [...path.slice(0, -1), name].join('.'));
}
export function removeProbe(probes: ProbesConfig, path: string[]): ProbesConfig {
  const full = path.join('.');
  walkProbes(probes, (node, location) => {
    if (location === full || location.startsWith(full + '.')) return;
    if (expressionReferences(node.expr || '').some(ref => ref === full || ref.startsWith(full + '.'))) throw new Error('This sequence is referenced by another segment. Update that reference first.');
  });
  const next = clone(probes);
  if (path.length === 1) delete next[path[0]];
  else {
    const parent = getNode(next, path.slice(0, -1));
    delete parent.parts![path[path.length - 1]];
    parent.template = buildTemplate(parseTemplate(parent.template || '').filter(s => s.name !== path[path.length - 1]));
  }
  return next;
}
export function removePart(probes: ProbesConfig, parentPath: string[], index: number): ProbesConfig {
  const parent = getNode(probes, parentPath), tokens = parseTemplate(parent.template || ''), token = tokens[index];
  if (token.name && tokens.filter(s => s.name === token.name).length === 1) return removeProbe(probes, [...parentPath, token.name]);
  tokens.splice(index, 1);
  return updateNode(probes, parentPath, node => ({ ...node, template: buildTemplate(tokens) }));
}
export const wrapReverseComplement = (expr: string, reverse: boolean) => reverse ? `rc(${expr})` : expr;
function slice(start = '', length = '') {
  if (!start && !length) return '';
  const from = start ? Number(start) - 1 : 0;
  if (!Number.isSafeInteger(from) || from < 0 || (length && (!Number.isSafeInteger(Number(length)) || Number(length) <= 0))) throw new Error('Start and length must be positive integers.');
  return `[${from}:${length ? from + Number(length) : ''}]`;
}
export const buildTargetPartExpression = (region: string, start = '', length = '', reverse = false) => wrapReverseComplement(`target_parts[${quote(region)}]${slice(start, length)}`, reverse);
export const buildTargetExpression = (region = '', start = '', length = '', reverse = false) => region ? buildTargetPartExpression(region, start, length, reverse) : wrapReverseComplement(`target_region${slice(start, length)}`, reverse);
export const buildBarcodeExpression = (name: string, reverse = false) => wrapReverseComplement(`encoding[target][${quote(name)}]`, reverse);
export const buildFixedSequence = (sequence: string): ProbeConfig => {
  const value = sequence.replace(/\s/g, '').toUpperCase();
  if (!/^[ACGTRYSWKMBDHVN]+$/.test(value)) throw new Error('Enter a nucleotide sequence.');
  return { expr: quote(value), length: value.length };
};
export const buildProbeReferenceExpression = (reference: string, start = '', length = '', reverse = false) => {
  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(reference)) throw new Error('Choose a probe or segment.');
  return wrapReverseComplement(reference + slice(start, length), reverse);
};
export function buildSegment(form: SegmentForm, original?: ProbeConfig): ProbeConfig {
  let result: ProbeConfig;
  if (form.kind === 'fixed') result = buildFixedSequence(form.sequence);
  else if (form.kind === 'composite') result = original?.template !== undefined ? original : createProbe();
  else if (form.kind === 'custom') { if (!original) throw new Error('Choose a segment type.'); return original; }
  else {
    if (form.kind === 'barcode' && !form.barcode) throw new Error('Choose a barcode.');
    result = { expr: form.kind === 'target' ? buildTargetExpression(form.region, form.start, form.length, form.reverse) : form.kind === 'barcode' ? buildBarcodeExpression(form.barcode, form.reverse) : buildProbeReferenceExpression(form.reference, form.start, form.length, form.reverse) };
  }
  // Preserve extension fields and attributes; remove only fields belonging to the old variant.
  const { expr: _expr, template: _template, parts: _parts, length: _length, ...metadata } = original || {};
  return { ...metadata, ...result };
}
export function segmentForm(node: ProbeConfig, name = ''): SegmentForm {
  const form: SegmentForm = { kind: 'custom', name, region: '', barcode: '', reference: '', sequence: '', reverse: false, start: '', length: '' };
  if (node.template !== undefined) return { ...form, kind: 'composite' };
  let expr = node.expr || '';
  if (expr.startsWith('rc(') && expr.endsWith(')')) { form.reverse = true; expr = expr.slice(3, -1); }
  const sliced = expr.match(/\[(\d*):(\d*)\]$/);
  if (sliced) { const from = Number(sliced[1] || 0); form.start = String(from + 1); form.length = sliced[2] ? String(Number(sliced[2]) - from) : ''; expr = expr.slice(0, -sliced[0].length); }
  let match: RegExpMatchArray | null;
  if (expr === 'target_region') form.kind = 'target';
  else if ((match = expr.match(/^target_parts\[['"]([A-Za-z_]\w*)['"]\]$/))) { form.kind = 'target'; form.region = match[1]; }
  else if (!sliced && (match = expr.match(/^encoding\[target\]\[['"]([^'"]+)['"]\]$/))) { form.kind = 'barcode'; form.barcode = match[1]; }
  else if (!sliced && !form.reverse && (match = expr.match(/^['"]([ACGTRYSWKMBDHVNacgtryswkmbdhvn]*)['"]$/))) { form.kind = 'fixed'; form.sequence = match[1]; }
  else if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(expr) && !['encoding','target'].includes(expr)) { form.kind = 'probe'; form.reference = expr; }
  return form;
}
export const segmentLabel = (node: ProbeConfig) => ({ target: 'Target binding', barcode: 'Barcode / Readout', fixed: 'Fixed sequence', probe: 'Probe reference', composite: 'Composite', custom: 'Saved segment' })[segmentForm(node).kind];

export function inferLength(node: ProbeConfig, probes: ProbesConfig, target: TargetConfig, barcodes: BarcodeConfig, seen = new Set<ProbeConfig>()): TargetLength | undefined {
  if (seen.has(node)) return undefined;
  const next = new Set(seen); next.add(node);
  if (node.template !== undefined) {
    let low = 0, high = 0;
    for (const token of parseTemplate(node.template)) {
      const length = token.name !== undefined ? node.parts?.[token.name] && inferLength(node.parts[token.name], probes, target, barcodes, next) : token.literal.length;
      if (length === undefined) return undefined;
      low += Array.isArray(length) ? length[0] : length; high += Array.isArray(length) ? length[1] : length;
    }
    return low === high ? low : [low, high];
  }
  const form = segmentForm(node);
  let length: TargetLength | undefined;
  if (form.kind === 'fixed') length = form.sequence.length;
  if (form.kind === 'target') length = form.region ? target.layout?.parts[form.region]?.length : target.length;
  if (form.kind === 'barcode') length = barcodes.barcodes[form.barcode]?.length ?? barcodes.default_length;
  if (form.kind === 'probe') { try { length = inferLength(getNode(probes, form.reference.split('.')), probes, target, barcodes, next); } catch { return undefined; } }
  if (length !== undefined && form.start) {
    const offset = Number(form.start) - 1;
    const reduce = (n: number) => Math.max(0, Math.min(n - offset, form.length ? Number(form.length) : Infinity));
    length = Array.isArray(length) ? [reduce(length[0]), reduce(length[1])] : reduce(length);
  }
  return length ?? node.length;
}

export function validateProbes(probes: ProbesConfig, target: TargetConfig, barcodes: BarcodeConfig, allowIncomplete = false) {
  if (!Object.keys(probes).length) throw new Error('Add at least one probe.');
  for (const node of Object.values(probes)) if (node.template === undefined) throw new Error('Each probe must contain segments. Place sequence references inside a probe.');
  parseTargetLength(target.length); samplingStep(target);
  const layoutError = validateTargetLayout(target.layout, target.length); if (layoutError) throw new Error(layoutError);
  for (const [name, entry] of Object.entries(barcodes.barcodes)) {
    const length = entry.length ?? barcodes.default_length;
    if (length !== undefined && (!Number.isSafeInteger(length) || length <= 0)) throw new Error(`${name}: barcode length must be a positive integer.`);
  }
  const nodes = new Map<string, ProbeConfig>(); walkProbes(probes, (node, path) => nodes.set(path, node));
  const graph = new Map<string, string[]>();
  for (const [path, node] of nodes) {
    if (!path.split('.').every(name => identifier.test(name))) throw new Error('Sequence names must start with a letter and contain letters, digits or underscores.');
    const edges: string[] = [];
    if (node.template !== undefined) {
      if (node.expr !== undefined) throw new Error(`${path}: choose one sequence structure.`);
      if (!node.template && !allowIncomplete) throw new Error(`${path}: add at least one segment.`);
      if (!node.parts) throw new Error(`${path}: segment definitions are missing.`);
      for (const token of parseTemplate(node.template)) if (token.name && !node.parts?.[token.name]) throw new Error(`${path}: a segment is missing.`);
      for (const name of Object.keys(node.parts || {})) edges.push(`${path}.${name}`);
    } else {
      if (!node.expr?.trim()) throw new Error(`${path}: choose a sequence source.`);
      for (const ref of expressionReferences(node.expr)) {
        if (nodes.has(ref)) edges.push(ref);
        else if (probes[ref.split('.')[0]]) throw new Error(`${path}: the referenced segment does not exist.`);
      }
      const form = segmentForm(node);
      if (form.kind === 'target' && form.region && !target.layout?.parts[form.region]) throw new Error(`${path}: the target region no longer exists.`);
      if (form.kind === 'barcode' && !barcodes.barcodes[form.barcode]) throw new Error(`${path}: define the selected barcode.`);
      if (form.kind === 'probe' && !nodes.has(form.reference)) throw new Error(`${path}: choose an existing probe or segment.`);
      if ((form.kind === 'target' || form.kind === 'probe') && form.start) {
        const base = form.kind === 'target' ? (form.region ? target.layout?.parts[form.region]?.length : target.length) : inferLength(nodes.get(form.reference)!, probes, target, barcodes);
        const max = Array.isArray(base) ? base[1] : base;
        if (max !== undefined && Number(form.start) - 1 + Number(form.length || 1) > max) throw new Error(`${path}: binding or reference exceeds the available length.`);
      }
    }
    graph.set(path, edges);
  }
  const active = new Set<string>(), done = new Set<string>();
  const visit = (name: string) => {
    if (active.has(name)) throw new Error('Probe references must not form a cycle.');
    if (done.has(name)) return;
    active.add(name); graph.get(name)?.forEach(visit); active.delete(name); done.add(name);
  };
  graph.forEach((_, name) => visit(name));
}

// Migration boundary. Canonical protocol always wins over the historical UI array.
export function normalizeProbes(group: any, protocol: any): ProbesConfig {
  if (protocol?.probes && !Array.isArray(protocol.probes)) return clone(protocol.probes);
  if (group.probes && !Array.isArray(group.probes)) return clone(group.probes);
  const legacy: any[] = group.probes || [];
  const names = new Map(legacy.map((p, i) => [p.id, p.name || `probe_${i + 1}`]));
  return Object.fromEntries(legacy.map(probe => {
    const parts: ProbesConfig = {};
    (probe.parts || []).forEach((part: any, i: number) => {
      const reverse = !!part.isReverseComplement;
      let expr: string;
      const from = String(part.source === 'probe' ? part.sourceStartPos || '' : part.startPos || '');
      const end = part.source === 'probe' ? part.sourceEndPos : part.endPos;
      const length = end ? String(Number(end) - Number(from || 1) + 1) : '';
      if (part.source === 'target') expr = buildTargetExpression('', from, length, reverse);
      else if (part.source === 'target_part') expr = wrapReverseComplement(`target_parts[${quote(part.targetPartName)}]${part.targetPartSlice ? `[${part.targetPartSlice}]` : ''}`, reverse);
      else if (part.source === 'barcode') expr = buildBarcodeExpression(part.label.split(': ')[1], reverse);
      else if (part.source === 'probe') expr = buildProbeReferenceExpression(names.get(part.sourceProbeId) || '', from, length, reverse);
      else if (part.source === 'fixed') expr = quote(part.sequence);
      else throw new Error('This legacy segment has no saved sequence rule. Load its original method instead.');
      parts[`part${i + 1}`] = { expr, ...(part.attributes ? { attributes: clone(part.attributes) } : {}) };
    });
    return [names.get(probe.id)!, { template: buildTemplate(Object.keys(parts).map(name => ({ name }))), parts, ...(probe.attributes ? { attributes: clone(probe.attributes) } : {}) }];
  }));
}

export function rebalanceLayout(layout: TargetLayout, length: TargetLength): TargetLayout {
  const names = layoutNames(layout), parts = clone(layout.parts);
  const [lower, upper] = Array.isArray(length) ? length : [length, length];
  let low = 0, high = 0;
  for (const name of names.slice(0, -1)) {
    const bounds = Array.isArray(parts[name].length) ? parts[name].length : [parts[name].length, parts[name].length];
    const a = Math.min(bounds[0], Math.max(0, lower - low));
    const b = Math.max(a, Math.min(bounds[1], Math.max(0, upper - high)));
    parts[name].length = a === b ? a : [a, b]; low += a; high += b;
  }
  const a = Math.max(0, lower - low), b = Math.max(a, upper - high);
  parts[names[names.length - 1]].length = a === b ? a : [a, b];
  return { ...layout, parts };
}
export function renameTargetRegion(probes: ProbesConfig, before: string, after: string) {
  const next = clone(probes);
  walkProbes(next, node => { if (node.expr) node.expr = node.expr.replace(/target_parts\s*\[\s*(['"])([^'"]+)\1\s*\]/g, (all, _q, name) => name === before ? `target_parts[${quote(after)}]` : all); });
  return next;
}

export function collectAttributes(probes: ProbesConfig, target: TargetConfig) {
  const attributes: Record<string, any> = {}, filters: Record<string, any> = {};
  const collect = (attrs: Record<string, any> | undefined, path: string) => {
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value.enabled === false) continue;
      for (const bound of ['min', 'max']) if (value[bound] !== undefined && !Number.isFinite(Number(value[bound]))) throw new Error(`${path}: invalid attribute limit.`);
      if (value.min !== undefined && value.max !== undefined && Number(value.min) > Number(value.max)) throw new Error(`${path}: minimum attribute limit exceeds maximum.`);
      const key = value.originalName || `${path === 'target_region' ? 'target' : path.replace(/\./g, '_')}_${attributeType(name)}`;
      attributes[key] = exportAttribute(value, name, path);
      const condition = buildAttributeFilter(value, key, attributeType(name) === 'gc_content');
      if (condition) filters[key] = { condition };
    }
  };
  collect(target.attributes, 'target_region'); walkProbes(probes, (node, path) => collect(node.attributes, path));
  return { attributes, filters };
}
export function compileProtocol(seed: any, probes: ProbesConfig, target: TargetConfig, barcodes: BarcodeConfig, metadata: { name: string; description?: string }) {
  validateProbes(probes, target, barcodes);
  const protocol = clone(seed || {});
  delete protocol.target_sequence;
  const region = { ...target }; delete region.sequence; delete region.overlap;
  region.step = samplingStep(target);
  protocol.metadata = { ...protocol.metadata, ...metadata };
  protocol.extracts = { ...protocol.extracts, target_region: region };
  protocol.probes = clone(probes);
  protocol.barcodes = clone(barcodes);
  const collected = collectAttributes(probes, target);
  // Inline scopes are authoritative for editable attributes. Retain other extraction scopes.
  const retained = Object.fromEntries(Object.entries(protocol.attributes || {}).filter(([, attr]) => {
    const path = String((attr as any).target).replace(/:/g, '.');
    if (path.startsWith('target_parts.')) return !!target.layout?.parts[path.slice('target_parts.'.length)];
    return path !== 'target_region' && !!protocol.extracts?.[path];
  }));
  const previousNames = new Set(Object.keys(protocol.attributes || {}).filter(name => !retained[name]));
  protocol.attributes = { ...retained, ...collected.attributes };
  protocol.post_process = { ...protocol.post_process, filters: { ...Object.fromEntries(Object.entries(protocol.post_process?.filters || {}).filter(([name]) => !previousNames.has(name))), ...collected.filters } };
  return protocol;
}
