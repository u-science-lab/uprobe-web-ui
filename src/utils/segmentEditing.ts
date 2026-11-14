import type { ProbeConfig, ProbesConfig } from '../types';
import {
  BarcodeConfig, SegmentForm, TargetConfig, buildSegment, buildTemplate, createPart,
  getNode, parseTemplate, renameProbe, updateNode, validateProbes,
} from './probeBuilder';

export interface SegmentEdit {
  parentPath: string[];
  index?: number;
  nodePath?: string[];
  original?: ProbeConfig;
  form: SegmentForm;
  initialForm: SegmentForm;
  parentTemplate?: string;
}
export type SegmentAction =
  | { kind: 'select'; parentPath: string[]; index?: number; nodePath?: string[] }
  | { kind: 'move'; parentPath: string[]; index: number; offset: number }
  | { kind: 'delete'; parentPath?: string[]; index?: number; nodePath?: string[] }
  | { kind: 'renameProbe'; nodePath: string[] }
  | { kind: 'addProbe' }
  | { kind: 'clear' };

// Ignore object key order and optional undefined fields when deciding whether an edit changed data.
export function equalSegmentData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equalSegmentData(value, b[index]));
  const first = Object.entries(a).filter(([, value]) => value !== undefined);
  const second = Object.entries(b).filter(([, value]) => value !== undefined);
  return first.length === second.length && first.every(([key, value]) => Object.prototype.hasOwnProperty.call(b, key) && equalSegmentData(value, (b as Record<string, unknown>)[key]));
}
const structureOf = (node: ProbeConfig | undefined): unknown => node && ({
  expr: node.expr, template: node.template, length: node.length,
  parts: node.parts && Object.fromEntries(Object.entries(node.parts).map(([name, part]) => [name, structureOf(part)])),
});

export function remapSegmentAction(action: SegmentAction, renamed?: [string, string]): SegmentAction {
  if (!renamed) return action;
  const [before, after] = renamed;
  const path = (value: string[] | undefined) => {
    if (!value) return value;
    const key = value.join('.');
    return (key === before ? after : key.startsWith(before + '.') ? after + key.slice(before.length) : key).split('.');
  };
  if (action.kind === 'select') return { ...action, parentPath: path(action.parentPath)!, nodePath: path(action.nodePath) };
  if (action.kind === 'move') return { ...action, parentPath: path(action.parentPath)! };
  if (action.kind === 'delete') return { ...action, parentPath: path(action.parentPath), nodePath: path(action.nodePath) };
  if (action.kind === 'renameProbe') return { ...action, nodePath: path(action.nodePath)! };
  return action;
}

export function applySegmentEdit(probes: ProbesConfig, editing: SegmentEdit, target: TargetConfig, barcodes: BarcodeConfig): {
  probes: ProbesConfig; editing: SegmentEdit; changed: boolean; renamed?: [string, string];
} {
  // A plain Apply on an existing segment must preserve legacy formatting and metadata exactly.
  if (editing.original && equalSegmentData(editing.form, editing.initialForm)) return { probes, editing, changed: false };
  const { parentPath, index, nodePath, original, form } = editing;
  const parent = getNode(probes, parentPath);
  if (parent.template !== editing.parentTemplate) throw new Error('This structure changed while you were editing. Your values are kept; select the segment again before applying changes.');
  const latest = nodePath ? getNode(probes, nodePath) : original;
  if (nodePath && !equalSegmentData(structureOf(latest), structureOf(original))) throw new Error('This segment changed while you were editing. Your values are kept; select the segment again before applying changes.');
  const part = buildSegment(form, latest);
  let next = probes;
  let nextPath = nodePath;
  let renamed: [string, string] | undefined;
  if (nodePath) {
    next = updateNode(next, nodePath, () => part);
    const name = nodePath[nodePath.length - 1];
    if (name !== form.name) {
      next = renameProbe(next, nodePath, form.name);
      nextPath = [...nodePath.slice(0, -1), form.name];
      renamed = [nodePath.join('.'), nextPath.join('.')];
    }
  } else if (index !== undefined) {
    if (form.kind !== 'fixed') throw new Error('This sequence is a fixed segment.');
    next = updateNode(next, parentPath, node => {
      const tokens = parseTemplate(node.template || '');
      tokens[index] = { literal: form.sequence.replace(/\s/g, '').toUpperCase() };
      return { ...node, template: buildTemplate(tokens) };
    });
  } else {
    next = updateNode(next, parentPath, node => createPart(node, form.name, part));
    nextPath = [...parentPath, form.name];
  }
  validateProbes(next, target, barcodes, true);
  const changed = !equalSegmentData(next, probes);
  if (!changed) next = probes;
  const nextOriginal = nextPath ? getNode(next, nextPath) : part;
  const nextForm = { ...form };
  return {
    probes: next, changed, renamed,
    editing: {
      parentPath, index: index ?? (original ? undefined : parseTemplate(getNode(next, parentPath).template || '').length - 1),
      nodePath: nextPath, original: nextOriginal, form: nextForm, initialForm: { ...nextForm },
      parentTemplate: getNode(next, parentPath).template,
    },
  };
}
