import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
const module = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync('src/utils/encodingFields.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }), { module, exports: module.exports });
const { encodingFields, encodingCsvValue } = module.exports;
const fields = encodingFields({ barcodes: { barcodes: { BC2: {length: 12}, BC1: {length: 10}, readout: {description: 'Readout'} } }, probes: { p: { parts: { x: {expr: `encoding[target]["adapter"]` } } } } });
assert.equal(fields.barcode1.name, 'BC1');
assert.equal(fields.barcode2.name, 'BC2');
assert.equal(fields.barcode3.name, 'readout');
assert.equal(fields.barcode4.name, 'adapter');
assert.equal(encodingCsvValue({readout:'ACGT'}, 'barcode3', fields.barcode3), 'ACGT');
assert.equal(encodingCsvValue({barcode3:'TGCA'}, 'barcode3', fields.barcode3), 'TGCA');
assert.throws(() => encodingCsvValue({readout:'ACGT', barcode3:'TGCA'}, 'barcode3', fields.barcode3), /Conflicting/);
console.log('PASS: named encoding fields, BC ordering, expression fallback and CSV aliases');


const sparse = encodingFields({barcodes:{barcodes:{BC2:{length:10}}}});
assert.equal(Object.keys(sparse).length, 1);
assert.equal(sparse.barcode1.name, 'BC2');
const oldTargets = [{target:'gene', sequence:'ACGT', barcode1:'AAAA', barcode2:'CCCC'}];
const cleared = module.exports.clearEncodingValues(oldTargets);
assert.equal(cleared[0].target, 'gene');
assert.equal(cleared[0].sequence, 'ACGT');
assert.equal('barcode1' in cleared[0], false);
assert.equal(oldTargets[0].barcode1, 'AAAA');
console.log('PASS: sparse BC fields and template switch clearing');
