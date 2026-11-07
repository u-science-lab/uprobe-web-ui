import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { buildTargetExpression, buildBarcodeExpression, buildFixedSequence, buildProbeReferenceExpression, compileProtocol, normalizeProbes, parseTemplate, buildTemplate, reorderPart, renameProbe, removePart, removeProbe, renameTargetRegion, inferLength, validateProbes, collectAttributes, rebalanceLayout, updateNode, createPart, segmentForm, buildSegment } from '../src/utils/probeBuilder';
import { restoreTemplate } from '../src/utils/probeConfig';
import { validateTargetLayout } from '../src/utils/targetLayout';
import type { ProbesConfig } from '../src/types';

const target = { source: 'exon', length: 40, step: 1, attributes: {} };
const barcodes = { count: 1, barcodes: { BC1: { length: 12 } } };
const binding = { expr: buildTargetExpression('', '', '25', true) };
const referenceProbe = (expr: string) => ({ template: '{reference}', parts: { reference: { expr } } });
const cases: ProbesConfig[] = [
  { simple: { template: '{binding}', parts: { binding } } },
  { readout: { template: '{binding}{barcode}', parts: { binding, barcode: { expr: buildBarcodeExpression('BC1', true) } } } },
  { fixed: { template: '{primer}{binding}AA', parts: { primer: buildFixedSequence('ACGT'), binding } } },
  { source: { template: '{binding}', parts: { binding } }, reference: referenceProbe(buildProbeReferenceExpression('source.binding', '2', '5', true)) },
  { nested: { template: '{block}AA{binding}{block}', parts: { binding, block: { template: '{first}GG{second}', parts: { first: { expr: buildBarcodeExpression('BC1') }, second: buildFixedSequence('AC') }, attributes: { gc_content: { enabled: true, min: 30, max: 70, filterEnabled: true } } }, helper: { expr: 'target_region[-6:]' } }, attributes: { length: { enabled: true, min: 20 } } }, ref: referenceProbe('rc(nested.block.first)') },
];
let checks = 0;
const check = (name: string, test: () => void) => { test(); checks++; console.log(`PASS ${name}`); };
for (const [i, probes] of cases.entries()) check(`representative ${i + 1}: load/edit/save/reload`, () => {
  const first = compileProtocol({ post_process: { equal_space: { count: 3 } }, reports: { custom: true } }, probes, target, barcodes, { name: 'Roundtrip' });
  const saved = yaml.load(yaml.dump(first)) as any;
  assert.deepEqual(normalizeProbes({ probes: [{ name: 'stale' }] }, saved), probes);
  const restored = restoreTemplate(saved);
  const root = Object.keys(restored.probes)[0];
  const edited = renameProbe(restored.probes, [root], root + '_edited');
  const second = compileProtocol(saved, edited, restored.targetConfig, barcodes, { name: 'Edited' });
  const reloaded = yaml.load(yaml.dump(second)) as any;
  assert.deepEqual(reloaded.probes, second.probes);
  assert.equal(Object.keys(reloaded.probes)[0], root + '_edited');
  assert.deepEqual(reloaded.post_process.equal_space, { count: 3 });
  assert.deepEqual(reloaded.reports, { custom: true });
  assert.equal(reloaded.target_sequence, undefined);
  assert.equal(reloaded.extracts.target_region.sequence, undefined);
});
check('template literals, escapes, repeated and supporting parts survive', () => {
  const text = '{a}AA{b}{a}{{x}}';
  assert.equal(buildTemplate(parseTemplate(text)), text);
  const node = { template: '{a}AA{b}', parts: { a: binding, b: buildFixedSequence('CC'), helper: binding } };
  const reordered = reorderPart(node, 0, 1);
  assert.equal(reordered.template, 'AA{a}{b}'); assert.deepEqual(reordered.parts, node.parts);
  const repeated = { p: { template: '{a}AA{a}', parts: { a: binding } } };
  assert.ok(removePart(repeated, ['p'], 0).p.parts?.a);
});
check('recursive DAG rename, removal protection and cycle rejection', () => {
  const probes = cases[4];
  const renamed = renameProbe(probes, ['nested','block','first'], 'readout');
  assert.equal(renamed.ref.parts?.reference.expr, 'rc(nested.block.readout)');
  assert.equal(renamed.nested.parts?.block.template, '{readout}GG{second}');
  assert.throws(() => removeProbe(renamed, ['nested','block','readout']), /referenced/);
  assert.throws(() => validateProbes({ a: referenceProbe('b'), b: { template: '{x}', parts: { x: { expr: 'a' } } } }, target, barcodes), /cycle/);
  assert.throws(() => validateProbes({ a: { template: '{x}', parts: { x: { expr: 'a' } } } }, target, barcodes), /cycle/);
  assert.throws(() => validateProbes({ a: referenceProbe('absent.part') }, target, barcodes), /existing/);
});
check('expression projection is lossless when unedited', () => {
  for (const expr of ['rc(target_parts[\'left\'][-6:])', 'rc(target_region[0:25])', 'encoding[target][\'BC1\']', 'rc(encoding[target][\'BC1\'])', "'ACGT'", 'rc(source.part[1:6])']) {
    const original = { expr, attributes: { tm: { enabled: true, min: 50 } } };
    const form = segmentForm(original, 'test');
    assert.deepEqual(buildSegment(form, original), original.expr === "'ACGT'" ? { ...original, length: 4 } : original);
  }
  assert.equal(segmentForm({ expr: 'rc(target_parts[\'left\'][-6:])' }).kind, 'custom');
});
check('whole and split layout changes remain valid, rename/add/remove, reload', () => {
  let layout = { template: '{left}{right}', parts: { left: { length: 20 }, right: { length: 20 } } };
  for (const length of [60, 15, [40, 46]] as const) {
    const changed = rebalanceLayout(layout, Array.isArray(length) ? [...length] as [number,number] : length as number);
    assert.equal(validateTargetLayout(changed, Array.isArray(length) ? [...length] as [number,number] : length as number), '');
  }
  const added = rebalanceLayout({ template: '{left}{right}{extra}', parts: { ...layout.parts, extra: { length: 0 } } }, 40);
  assert.equal(validateTargetLayout(added, 40), '');
  const removed = rebalanceLayout({ template: '{left}{right}', parts: { left: added.parts.left, right: added.parts.right } }, 40);
  assert.equal(validateTargetLayout(removed, 40), '');
  const probes = renameTargetRegion({ p: { expr: buildTargetExpression('left', '', '', true) } }, 'left', 'binding');
  assert.equal(probes.p.expr, "rc(target_parts['binding'])");
  const compiled = compileProtocol({}, { p: referenceProbe("rc(target_parts['left'])") }, { ...target, layout }, barcodes, { name: 'Split' });
  assert.deepEqual(restoreTemplate(yaml.load(yaml.dump(compiled))).targetConfig.layout, layout);
  assert.throws(() => validateProbes({ p: referenceProbe("target_parts['missing']") }, target, barcodes), /region/);
});
check('lengths derive from region, barcode, literals, nested structure and reference', () => {
  assert.equal(inferLength(cases[0].simple, cases[0], target, barcodes), 25);
  assert.equal(inferLength(cases[1].readout, cases[1], target, barcodes), 37);
  assert.equal(inferLength(cases[2].fixed, cases[2], target, barcodes), 31);
  assert.equal(inferLength(cases[3].reference, cases[3], target, barcodes), 5);
  assert.equal(inferLength(cases[4].nested, cases[4], target, barcodes), 59);
});
check('legacy array normalizes only when canonical probes are unavailable', () => {
  const legacy = { probes: [{ id: '1', name: 'old', parts: [{ source: 'target', startPos: 1, endPos: 25, isReverseComplement: true }, { source: 'fixed', sequence: 'ACGT' }] }, { id: '2', name: 'ref', parts: [{ source: 'probe', sourceProbeId: '1', sourceStartPos: 1, sourceEndPos: 5 }] }] };
  const normalized = normalizeProbes(legacy, {});
  assert.equal(normalized.old.parts?.part1.expr, 'rc(target_region[0:25])');
  assert.equal(normalized.ref.parts?.part1.expr, 'old[0:5]');
  assert.deepEqual(normalizeProbes(legacy, { probes: cases[4] }), cases[4]);
});
check('nested scientific attributes and filters roundtrip and update once', () => {
  const compiled = compileProtocol({}, cases[4], target, barcodes, { name: 'Nested' });
  assert.equal(compiled.attributes.nested_block_gc_content.target, 'nested.block');
  assert.equal(compiled.post_process.filters.nested_block_gc_content.condition, 'nested_block_gc_content >= 0.3 & nested_block_gc_content <= 0.7');
  const restored = restoreTemplate(compiled);
  assert.equal(Object.keys(restored.probes.nested.parts.block.attributes).length, 1);
  const changed = updateNode(restored.probes, ['nested','block'], n => ({ ...n, attributes: { gc_content: { ...n.attributes!.gc_content, min: 35, filterExpression: undefined } } }));
  const collected = collectAttributes(changed, restored.targetConfig);
  assert.match(collected.filters.nested_block_gc_content.condition, />= 0.35/);
  const again = restoreTemplate(compileProtocol(compiled, changed, restored.targetConfig, barcodes, { name: 'Updated' }));
  assert.equal(Object.keys(again.probes.nested.parts.block.attributes).length, 1);
});
check('composite editing does not flatten or remove extension fields', () => {
  const original = { ...cases[4].nested.parts!.block, extension: { retained: true } };
  const edited = createPart(original, 'third', buildFixedSequence('TT'));
  assert.equal(edited.template, '{first}GG{second}{third}');
  assert.deepEqual((edited as any).extension, { retained: true });
  assert.equal(edited.parts?.first.expr, "encoding[target]['BC1']");
  const incomplete = { p: { template: '{block}', parts: { block: { template: '', parts: {} } } } };
  validateProbes(incomplete, target, barcodes, true);
  assert.throws(() => validateProbes(incomplete, target, barcodes), /segment/);
});
check('deleted or renamed scopes leave no stale attributes or filters', () => {
  const compiled = compileProtocol({}, cases[4], target, barcodes, { name: 'Original' });
  const restored = restoreTemplate(compiled);
  const renamed = renameProbe(restored.probes, ['nested'], 'renamed');
  const result = compileProtocol(compiled, renamed, target, barcodes, { name: 'Renamed' });
  assert.ok(Object.values(result.attributes).every((attr: any) => !attr.target.startsWith('nested')));
  const withoutRef = removeProbe(restored.probes, ['ref']);
  const removed = removeProbe(withoutRef, ['nested']);
  const replacement = { replacement: cases[0].simple };
  const cleaned = compileProtocol(compiled, { ...removed, ...replacement }, target, barcodes, { name: 'Removed' });
  assert.deepEqual(cleaned.attributes, {}); assert.deepEqual(cleaned.post_process.filters, {});
});
console.log(`${checks} targeted checks passed.`);
if (process.env.PROBE_BUILDER_OUTPUT) writeFileSync(process.env.PROBE_BUILDER_OUTPUT, JSON.stringify(cases.map((probes, index) => ({
  name: `canonical_check_${index + 1}`, genome: 'fixture', targets: ['gene'], encoding: { gene: { BC1: 'ACGTACGTACGT' } },
  ...compileProtocol({}, probes, target, barcodes, { name: 'Compatibility check' }),
}))));
