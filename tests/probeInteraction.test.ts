import assert from 'node:assert/strict';
import { barcodeReferences, renameTargetReferences, targetRegionReferences, usesBarcode } from '../src/utils/probeReferences';
import { applySegmentEdit, remapSegmentAction, SegmentEdit } from '../src/utils/segmentEditing';
import { buildFixedSequence, createPart, getNode, reorderPart, segmentForm, updateNode } from '../src/utils/probeBuilder';
import { saveCustomMethod } from '../src/utils/customProbeSave';

const wrap = (expr: string) => ({ p: { template: '{part}', parts: { part: { expr } } } });
assert.deepEqual(barcodeReferences(`rc( encoding [ target ] [ "BC1" ] )[0:4]`), { names: ['BC1'], dynamic: false });
assert.equal(usesBarcode(wrap("'ACGT'"), 'ACGT'), false);
assert.equal(usesBarcode(wrap("encoding[target]['ACGT']"), 'ACGT'), true);
assert.equal(usesBarcode(wrap(`"encoding[target]['BC1']"`), 'BC1'), false);
assert.equal(usesBarcode(wrap("encoding[target]['BC10']"), 'BC1'), false);
assert.equal(usesBarcode(wrap('encoding[target][target]'), 'BC1'), true);
assert.equal(usesBarcode(wrap('encoding["gene"]["BC1"]'), 'BC1'), true);
console.log('PASS exact barcode references, fixed literals and dynamic lookup protection');

const protocol = {
  metadata: { description: 'target_parts.left is only explanatory text' },
  attributes: { left_gc: { target: 'target_parts.left', type: 'gc_content' } },
  post_process: {
    filters: { exclusion: { type: 'sequence_pattern', target: "target_parts['left']", exclude_patterns: ['AAAA'] } },
    avoid_otp: { 'target_parts:left': { target_regions: ['target_parts.right'] } },
  },
  probes: {
    p: { template: '{block}', parts: { block: { template: '{binding}', parts: { binding: { expr: `rc(target_parts [ "left" ][0:12])` } } } } },
    literal: { template: '{text}', parts: { text: { expr: `"target_parts['left']"` } } },
  },
};
const references = targetRegionReferences(protocol, ['left']);
assert.ok(references.includes('attributes.left_gc.target'));
assert.ok(references.includes('post_process.filters.exclusion.target'));
assert.ok(references.includes('post_process.avoid_otp.target_parts:left'));
assert.ok(references.includes('probes.p.parts.block.parts.binding.expr'));
assert.ok(!references.some(path => path.startsWith('metadata') || path.startsWith('probes.literal')));
assert.equal(targetRegionReferences(protocol, ['missing']).length, 0);
assert.ok(targetRegionReferences({ probes: wrap('target_parts[target]') }, ['left']).length);
console.log('PASS region deletion checks nested probes, saved attributes, filters and post-processing keys');

const renamed = renameTargetReferences(protocol, 'left', 'binding');
assert.equal(renamed.attributes.left_gc.target, 'target_parts.binding');
assert.equal(renamed.post_process.filters.exclusion.target, "target_parts['binding']");
assert.ok((renamed.post_process.avoid_otp as any)['target_parts:binding']);
assert.equal(renamed.probes.p.parts.block.parts.binding.expr, "rc(target_parts['binding'][0:12])");
assert.deepEqual(renamed.metadata, protocol.metadata);
assert.deepEqual(renamed.probes.literal, protocol.probes.literal);
assert.deepEqual(protocol.attributes.left_gc.target, 'target_parts.left');
assert.equal(targetRegionReferences(renamed, ['left']).length, 0);
console.log('PASS region rename preserves references without rewriting literals or descriptive text');

const target = { source: 'exon', length: 40, step: 1 };
const barcodes = { count: 0, barcodes: {} };
const probes = {
  p: { template: '{A}{B}{block}', parts: {
    A: { ...buildFixedSequence('ACGT'), attributes: { gc_content: { enabled: true, min: 30 } } },
    B: { expr: 'rc(target_region[0:20])', length: 99 },
    block: { template: '{spacer}', parts: { spacer: buildFixedSequence('AA') } },
  } },
};
function edit(name: string): SegmentEdit {
  const original = getNode(probes, ['p', name]), form = segmentForm(original, name);
  return { parentPath: ['p'], index: ['A', 'B', 'block'].indexOf(name), nodePath: ['p', name], original, form: { ...form }, initialForm: { ...form }, parentTemplate: probes.p.template };
}
const unchanged = applySegmentEdit(probes, edit('B'), target, barcodes);
assert.equal(unchanged.probes, probes);
assert.equal(unchanged.changed, false);
assert.equal(unchanged.probes.p.parts?.B.length, 99);
const lowercase = edit('A'); lowercase.form.sequence = 'acgt';
assert.equal(applySegmentEdit(probes, lowercase, target, barcodes).changed, false);
console.log('PASS unmodified and semantically equivalent Apply preserve identity and legacy metadata');

const changed = edit('A'); changed.form.sequence = 'TGCA';
const applied = applySegmentEdit(probes, changed, target, barcodes);
const moved = updateNode(applied.probes, ['p'], node => reorderPart(node, 1, -1));
assert.equal(moved.p.parts?.A.expr, "'TGCA'");
assert.equal(moved.p.template, '{B}{A}{block}');
assert.equal(getNode(applied.probes, ['p', 'B']).expr, 'rc(target_region[0:20])');
assert.deepEqual(moved.p.parts?.A.attributes, probes.p.parts.A.attributes);
assert.equal(probes.p.parts.A.expr, "'ACGT'");
console.log('PASS Apply followed by pending select or move uses the fresh canonical state');

const compositeEdit = edit('block'); compositeEdit.form.name = 'renamed';
const renamedBlock = applySegmentEdit(probes, compositeEdit, target, barcodes);
const pending = remapSegmentAction({ kind: 'select', parentPath: ['p', 'block'] }, renamedBlock.renamed);
assert.equal(pending.kind, 'select');
if (pending.kind !== 'select') throw new Error('Expected select');
assert.deepEqual(pending.parentPath, ['p', 'renamed']);
const appended = updateNode(renamedBlock.probes, pending.parentPath, node => createPart(node, 'newChild', buildFixedSequence('CC')));
assert.equal(appended.p.parts?.renamed.template, '{spacer}{newChild}');
assert.equal(appended.p.parts?.renamed.parts?.spacer.expr, "'AA'");
assert.equal(appended.p.parts?.block, undefined);
console.log('PASS renaming a composite remaps pending child actions without losing nested structure');

const invalid = edit('A'); invalid.form.name = 'B';
assert.throws(() => applySegmentEdit(probes, invalid, target, barcodes), /unique/);
assert.equal(invalid.form.name, 'B');
assert.equal(probes.p.template, '{A}{B}{block}');
console.log('PASS invalid Apply keeps the form and original canonical structure');

const events: string[] = [];
let rejectRefresh!: (error: Error) => void;
const delayedRefresh = new Promise<string[]>(resolve => { void resolve; });
await saveCustomMethod(async () => { events.push('save'); }, () => delayedRefresh, {
  saved: () => events.push('saved'), refreshed: () => events.push('refreshed'),
  refreshFailed: () => events.push('refresh failed'), use: () => events.push('workflow'),
});
assert.deepEqual(events, ['save', 'saved', 'workflow']);
const failureEvents: string[] = [];
const rejectedRefresh = new Promise<string[]>((_resolve, reject) => { rejectRefresh = reject; });
await saveCustomMethod(async () => {}, () => rejectedRefresh, {
  saved: () => failureEvents.push('saved'), refreshed: () => failureEvents.push('refreshed'),
  refreshFailed: () => failureEvents.push('refresh failed'), use: () => failureEvents.push('workflow'),
});
rejectRefresh(new Error('List refresh unavailable'));
await Promise.resolve();
assert.deepEqual(failureEvents, ['saved', 'workflow', 'refresh failed']);
let refreshedAfterFailedSave = false, navigatedAfterFailedSave = false;
await assert.rejects(saveCustomMethod(async () => { throw new Error('Save rejected'); }, async () => { refreshedAfterFailedSave = true; return []; }, {
  saved: () => { throw new Error('Must not report success'); }, refreshed: () => {}, refreshFailed: () => {},
  use: () => { navigatedAfterFailedSave = true; },
}), /Save rejected/);
assert.equal(refreshedAfterFailedSave, false); assert.equal(navigatedAfterFailedSave, false);
console.log('PASS save success, failed or stalled refresh, and workflow handoff remain independent');
