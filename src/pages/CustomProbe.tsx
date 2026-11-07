import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ApiService from '../api';
import CustomTargetEditor from '../components/CustomTargetEditor';
import ProbeStructureEditor from '../components/ProbeStructureEditor';
import ProbeAttributesEditor from '../components/ProbeAttributesEditor';
import { ProbeConfig, ProbesConfig } from '../types';
import { useDraftState } from '../utils/useDraftState';
import { restoreTemplate } from '../utils/probeConfig';
import { TargetConfig, BarcodeConfig, compileProtocol, createProbe, normalizeProbes, walkProbes, updateNode, renameTargetRegion } from '../utils/probeBuilder';

interface BuilderDraft {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  probes: ProbesConfig;
  target: TargetConfig;
  barcodes: BarcodeConfig;
  seed: Record<string, any>;
}
const fresh = (): BuilderDraft => ({ id: crypto.randomUUID(), name: '', description: '', createdAt: new Date().toISOString(), probes: { probe_1: createProbe() }, target: { source: 'exon', length: 40, step: 1, attributes: {} }, barcodes: { count: 0, default_length: 12, barcodes: {} }, seed: {} });
const readProtocol = (text: string) => { const value = yaml.load(text || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This method has no valid saved protocol.'); return value as Record<string, any>; };

export default function CustomProbe() {
  const navigate = useNavigate();
  const [draft, setDraft] = useDraftState<BuilderDraft>('custom.canonical.v1', fresh());
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('probe_1');
  const [revision, setRevision] = useState(0);
  const [invalidTarget, setInvalidTarget] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const patch = (values: Partial<BuilderDraft>) => setDraft(previous => ({ ...previous, ...values }));
  const report = (error: any) => setMessage({ text: error?.response?.data?.detail || error.message || 'Unable to save method.', error: true });
  useEffect(() => { ApiService.getCustomProbes().then(setHistory).catch(report); }, []);
  const load = (group: any) => {
    try {
      const protocol = readProtocol(group.yamlContent);
      const probes = normalizeProbes(group, protocol);
      const restored = restoreTemplate({ ...protocol, probes, ...(!protocol.extracts?.target_region && !protocol.target_sequence && group.targetConfig ? { target_sequence: group.targetConfig } : {}) });
      const target = { source: 'exon', length: 40, ...restored.targetConfig, sequence: undefined } as TargetConfig;
      const bars = protocol.barcodes || protocol.barcode_config || group.barcodeConfig || { count: 0, barcodes: {} };
      // The seed retains unrelated protocol settings, never a second structure model.
      const { probes: _probes, target_sequence: _legacy, barcodes: _bars, barcode_config: _legacyBars, ...seed } = protocol;
      if (seed.extracts) { seed.extracts = { ...seed.extracts }; delete seed.extracts.target_region; }
      setDraft({ id: group.id, name: group.name, description: group.description || protocol.metadata?.description || '', createdAt: group.createdAt, probes: restored.probes, target, barcodes: { ...bars, barcodes: bars.barcodes || {}, count: Object.keys(bars.barcodes || {}).length }, seed });
      setScope(Object.keys(probes)[0] || ''); setRevision(n => n + 1); setInvalidTarget(false); setShowHistory(false); setMessage(null);
    } catch (e) { report(e); }
  };
  const save = async (use = false) => {
    if (busy) return;
    try {
      if (!draft.name.trim()) throw new Error('Enter a method name.');
      if (invalidTarget) throw new Error('Complete the target length settings.');
      const protocol = compileProtocol(draft.seed, draft.probes, draft.target, draft.barcodes, { name: draft.name.trim(), description: draft.description });
      const group = { id: draft.id, name: draft.name.trim(), description: draft.description, type: 'custom', schemaVersion: 2, createdAt: draft.createdAt, updatedAt: new Date().toISOString(), probes: protocol.probes, targetConfig: protocol.extracts.target_region, targetLength: draft.target.length, step: draft.target.step ?? 1, barcodeCount: draft.barcodes.count, barcodeConfig: draft.barcodes, yamlContent: yaml.dump(protocol, { noRefs: true, lineWidth: -1 }) };
      setBusy(true); await ApiService.saveCustomProbe(group); setHistory(await ApiService.getCustomProbes());
      setMessage({ text: 'Method saved.', error: false });
      if (use) navigate('/design/designworkflow?template=' + encodeURIComponent(group.name));
    } catch (e) { report(e); } finally { setBusy(false); }
  };
  const scopes: { path: string; node: ProbeConfig }[] = []; walkProbes(draft.probes, (node, path) => scopes.push({ path, node }));
  const activeScope = scopes.find(s => s.path === scope) || scopes[0];
  // Keep references in externally defined attribute/exclusion scopes synchronized on rename.
  const renameScope = (before: string, after: string) => setDraft(previous => {
    const seed = structuredClone(previous.seed);
    const rewrite = (path: string) => path === before ? after : path.startsWith(before + '.') ? after + path.slice(before.length) : path;
    for (const attr of Object.values(seed.attributes || {}) as any[]) if (typeof attr.target === 'string') attr.target = rewrite(attr.target);
    for (const filter of Object.values(seed.post_process?.filters || {}) as any[]) if (typeof filter.target === 'string') filter.target = rewrite(filter.target);
    return { ...previous, seed };
  });
  return <Container maxWidth="lg" sx={{ py: 4, pb: 10 }}>
    <Stack spacing={4}>
      <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="h5" fontWeight={600}>Custom Probe</Typography><Stack direction="row"><Button onClick={() => setShowHistory(true)}>Saved methods</Button><Button onClick={() => { setDraft(fresh()); setRevision(n => n + 1); setInvalidTarget(false); setMessage(null); }}>New method</Button></Stack></Stack>
      {message && <Alert severity={message.error ? 'error' : 'success'} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <Box component="section"><Typography variant="h6" sx={{ mb: 2 }}>Basic Information</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField size="small" label="Method name" value={draft.name} onChange={e => patch({ name: e.target.value })} sx={{ minWidth: 260 }} /><TextField size="small" fullWidth label="Description (optional)" value={draft.description} onChange={e => patch({ description: e.target.value })} /></Stack></Box>
      <Box component="section" sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 3 }}><Typography variant="h6" sx={{ mb: 2 }}>Target</Typography><CustomTargetEditor key={revision} value={draft.target} onValidity={valid => setInvalidTarget(!valid)} onChange={target => patch({ target })} onRename={(layout, before, after) => { patch({ target: { ...draft.target, layout }, probes: renameTargetRegion(draft.probes, before, after) }); renameScope(`target_parts.${before}`, `target_parts.${after}`); }} /></Box>
      <Box component="section" sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 3 }}><Typography variant="h6" sx={{ mb: 2 }}>Probe Structure</Typography><ProbeStructureEditor probes={draft.probes} target={draft.target} barcodes={draft.barcodes} onChange={probes => patch({ probes })} onBarcodes={barcodes => patch({ barcodes })} onRename={renameScope} /></Box>
      <Accordion disableGutters elevation={0} sx={{ borderTop: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: { xs: 2, sm: 3 } }}><Typography variant="h6">Filters &amp; Attributes</Typography></AccordionSummary><AccordionDetails sx={{ px: { xs: 2, sm: 3 }, pt: 1, pb: 3 }}><Stack spacing={3}>
        {activeScope && <><TextField select size="small" label="Sequence" value={activeScope.path} sx={{ maxWidth: 360 }} onChange={e => setScope(e.target.value)}>{scopes.map(({ path }) => <MenuItem key={path} value={path}>{path.replace(/\./g, ' / ')}</MenuItem>)}</TextField><ProbeAttributesEditor dna={draft.target.source === 'genome'} value={activeScope.node.attributes} onChange={attributes => patch({ probes: updateNode(draft.probes, activeScope.path.split('.'), node => ({ ...node, attributes })) })} /></>}
        <Typography variant="subtitle2">Barcode definitions</Typography>
        {Object.entries(draft.barcodes.barcodes).map(([name, value]) => <Stack key={name} direction="row" alignItems="center" spacing={2}><Typography variant="body2" sx={{ minWidth: 100 }}>{name}</Typography><TextField size="small" label="Length (nt)" type="number" value={value.length ?? draft.barcodes.default_length ?? ''} onChange={e => patch({ barcodes: { ...draft.barcodes, barcodes: { ...draft.barcodes.barcodes, [name]: { ...value, length: Number(e.target.value) } } } })} /><Button onClick={() => {
          let used = false; walkProbes(draft.probes, node => { if (node.expr?.includes(`'${name}'`) || node.expr?.includes(`"${name}"`)) used = true; });
          if (used) { setMessage({ text: 'This barcode is used by a segment.', error: true }); return; }
          const entries = { ...draft.barcodes.barcodes }; delete entries[name]; patch({ barcodes: { ...draft.barcodes, barcodes: entries, count: Object.keys(entries).length } });
        }}>Remove</Button></Stack>)}
        {!Object.keys(draft.barcodes.barcodes).length && <Typography variant="body2" color="text.secondary">Define barcodes when adding a Barcode / Readout segment.</Typography>}
      </Stack></AccordionDetails></Accordion>
      <Stack direction="row" justifyContent="flex-end" spacing={2}><Button disabled={busy} onClick={() => save()}>Save method</Button><Button disabled={busy} variant="contained" onClick={() => save(true)}>Save &amp; use in workflow</Button></Stack>
    </Stack>
    <Dialog open={showHistory} onClose={() => setShowHistory(false)} fullWidth maxWidth="sm"><DialogTitle>Saved methods</DialogTitle><DialogContent><Stack spacing={1}>{history.map(group => <Stack direction="row" key={group.id} alignItems="center"><Button sx={{ textTransform: 'none', mr: 'auto' }} onClick={() => load(group)}>{group.name}</Button><Button size="small" onClick={() => { const url = URL.createObjectURL(new Blob([group.yamlContent], { type: 'text/yaml' })); const a = document.createElement('a'); a.href = url; a.download = `${group.name}.yaml`; a.click(); URL.revokeObjectURL(url); }}>Download</Button><Button size="small" onClick={() => setDeleting(group)}>Delete</Button></Stack>)}{!history.length && <Typography color="text.secondary">No saved methods</Typography>}</Stack></DialogContent><DialogActions><Button onClick={() => setShowHistory(false)}>Close</Button></DialogActions></Dialog>
    <Dialog open={!!deleting} onClose={() => setDeleting(null)}><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogActions><Button onClick={() => setDeleting(null)}>Cancel</Button><Button color="error" onClick={async () => { try { await ApiService.deleteCustomProbe(deleting.id); setHistory(await ApiService.getCustomProbes()); setDeleting(null); } catch (e) { report(e); } }}>Delete</Button></DialogActions></Dialog>
  </Container>;
}
