// Isolated UI verification: no authentication, production writes, or design execution.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { CssBaseline, Box, Button, Stack, Typography } from '@mui/material';
import yaml from 'js-yaml';
import ApiService from '../src/api';
import CustomProbe from '../src/pages/CustomProbe';
import DesignWorkflow from '../src/pages/DesignWorkflow';
import { ThemeProvider } from '../src/contexts/ThemeContext';

const fixtureKey = 'canonical-builder-verification-v3';
const fixture = {
  metadata: { name: 'Nested fixture' },
  extracts: { target_region: { source: 'exon', length: 40, step: 1, layout: { template: '{left}{right}', parts: { left: { length: 20 }, right: { length: 20 } } } } },
  attributes: { left_gc: { target: 'target_parts.left', type: 'gc_content' } },
  barcodes: { count: 1, barcodes: { BC1: { length: 12 } } },
  probes: {
    circle: { template: '{binding}AA{block}{binding}', parts: {
      binding: { expr: 'rc(target_region[0:20])' },
      block: { template: '{readout}GG{spacer}', parts: { readout: { expr: "encoding[target]['BC1']" }, spacer: { expr: "'AC'" } }, attributes: { gc_content: { enabled: true, min: 30, max: 70 } } },
    } },
    detector: { template: '{reference}', parts: { reference: { expr: 'rc(circle.block.readout)' } } },
  },
};
const groups = () => JSON.parse(localStorage.getItem(fixtureKey) || 'null') || [{ id: 'nested-fixture', name: 'Nested fixture', type: 'custom', probes: [{ id: 'stale-ui-array' }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), barcodeCount: 1, targetLength: 40, yamlContent: yaml.dump(fixture) }];
let failNextRefresh = false;
ApiService.getCustomProbes = async () => {
  if (failNextRefresh) { failNextRefresh = false; throw new Error('Fixture saved-list refresh unavailable'); }
  return groups();
};
ApiService.saveCustomProbe = async group => { const previous = groups().filter((item: any) => item.id !== group.id); localStorage.setItem(fixtureKey, JSON.stringify([...previous, group])); return group; };
ApiService.deleteCustomProbe = async id => { localStorage.setItem(fixtureKey, JSON.stringify(groups().filter((item: any) => item.id !== id))); };
ApiService.getSpeciesOptions = async () => ['GRCm39'];
ApiService.getBuiltinProbes = async () => [];
let submitted: any = null;
ApiService.submitTask = async config => { submitted = config; return { code: 200, message: 'Fixture only', data: {} } as any; };
ApiService.runTask = async () => { throw new Error('Design execution is disabled in verification.'); };
function Receipt() {
  return <Box sx={{ p: 4 }}><Typography variant="h5">Task configuration generated</Typography><Typography>{Object.keys(submitted?.probes || {}).join(', ')}</Typography><pre data-testid="generated-task-config">{JSON.stringify(submitted, null, 2)}</pre></Box>;
}
function SavedReceipt() {
  const [value, setValue] = useState('');
  return <><Button onClick={() => setValue(JSON.stringify(groups(), null, 2))}>Inspect saved test data</Button><Button onClick={() => { failNextRefresh = true; }}>Fail next saved-list refresh</Button>{value && <pre data-testid="saved-test-data">{value}</pre>}</>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><CssBaseline /><BrowserRouter><Stack direction="row" spacing={2} sx={{ p: 2 }}><Link to="/design/customprobe">Builder</Link><Link to="/design/designworkflow">Workflow</Link><SavedReceipt /></Stack><Routes><Route path="/design/designworkflow" element={<DesignWorkflow />} /><Route path="/task" element={<Receipt />} /><Route path="*" element={<CustomProbe />} /></Routes></BrowserRouter></ThemeProvider>);
