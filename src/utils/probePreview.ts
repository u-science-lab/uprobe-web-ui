import type { ProbeConfig, ProbesConfig } from '../types';
import { BarcodeConfig, TargetConfig, getNode, parseTemplate, segmentForm } from './probeBuilder';
import { layoutNames } from './targetLayout';

// Illustrative bases are transient view state, never part of a saved protocol.
export function exampleTarget(length: number, seed: number): string {
  let state = (seed + 1) >>> 0;
  return Array.from({ length: Math.min(length, 3000) }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 'ACGT'[state >>> 30];
  }).join('');
}
export function previewSequence(node: ProbeConfig, probes: ProbesConfig, target: TargetConfig, barcodes: BarcodeConfig, bases: string, seen = new Set<ProbeConfig>()): string | undefined {
  if (seen.has(node)) return undefined;
  const visited = new Set(seen); visited.add(node);
  if (node.template !== undefined) {
    try {
      const pieces = parseTemplate(node.template).map(token => token.name !== undefined
        ? node.parts?.[token.name] && previewSequence(node.parts[token.name], probes, target, barcodes, bases, visited)
        : token.literal);
      return pieces.some(piece => piece === undefined) ? undefined : pieces.join('');
    } catch { return undefined; }
  }
  const form = segmentForm(node);
  let sequence: string | undefined;
  if (form.kind === 'fixed') sequence = form.sequence;
  if (form.kind === 'target') {
    sequence = bases;
    if (form.region && target.layout) {
      let offset = 0;
      for (const name of layoutNames(target.layout)) {
        const length = target.layout.parts[name].length;
        const count = Array.isArray(length) ? length[0] : length;
        if (name === form.region) { sequence = bases.slice(offset, offset + count); break; }
        offset += count;
      }
    }
  }
  if (form.kind === 'barcode') sequence = exampleTarget(barcodes.barcodes[form.barcode]?.length ?? barcodes.default_length ?? 12, 97 + Object.keys(barcodes.barcodes).indexOf(form.barcode));
  if (form.kind === 'probe') {
    try { sequence = previewSequence(getNode(probes, form.reference.split('.')), probes, target, barcodes, bases, visited); } catch { return undefined; }
  }
  if (sequence === undefined) return undefined;
  if (form.start || form.length) { const start = Number(form.start || 1) - 1; sequence = sequence.slice(start, form.length ? start + Number(form.length) : undefined); }
  return form.reverse ? [...sequence].reverse().map(base => ({ A: 'T', T: 'A', C: 'G', G: 'C' }[base] || base)).join('') : sequence;
}
