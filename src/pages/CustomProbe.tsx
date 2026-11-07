import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  CircularProgress, Container, Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ApiService from '../api';
import CustomTargetEditor from '../components/CustomTargetEditor';
import ProbeStructureEditor from '../components/ProbeStructureEditor';
import ProbeAttributesEditor from '../components/ProbeAttributesEditor';
import type { ProbeConfig, ProbesConfig } from '../types';
import { useDraftState } from '../utils/useDraftState';
import { restoreTemplate } from '../utils/probeConfig';
import {
  TargetConfig, BarcodeConfig, compileProtocol, createProbe, normalizeProbes,
  walkProbes, updateNode, renameTargetRegion,
} from '../utils/probeBuilder';

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

const fresh = (): BuilderDraft => ({
  id: crypto.randomUUID(), name: '', description: '', createdAt: new Date().toISOString(),
  probes: { probe_1: createProbe() },
  target: { source: 'exon', length: 40, step: 1, attributes: {} },
  barcodes: { count: 0, default_length: 12, barcodes: {} }, seed: {},
});
const readProtocol = (text: string) => {
  const value = yaml.load(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This method has no valid saved protocol.');
  }
  return value as Record<string, any>;
};
const panelStyle = { p: { xs: 2, sm: 2.5 }, minWidth: 0, boxShadow: 'none' };
const disclosureStyle = { '&:before': { display: 'none' }, boxShadow: 'none' };

export default function CustomProbe() {
  const navigate = useNavigate();
  const [draft, setDraft] = useDraftState<BuilderDraft>('custom.canonical.v1', fresh());
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('probe_1');
  const [revision, setRevision] = useState(0);
  const [validity, setValidity] = useState({ basic: true, advanced: true });
  const [dirty, setDirty] = useDraftState<boolean>('custom.canonical.dirty', false);
  const [pendingSegment, setPendingSegment] = useState(false);
  const [inspectorContainer, setInspectorContainer] = useState<HTMLDivElement | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [deletingBarcode, setDeletingBarcode] = useState<string | null>(null);
  const [replaceAction, setReplaceAction] = useState<(() => void) | null>(null);

  const patch = (values: Partial<BuilderDraft>) => {
    setDraft(previous => ({ ...previous, ...values }));
    setDirty(true);
  };
  const report = (error: any) => setMessage({
    text: error?.response?.data?.detail || error.message || 'Unable to save method.', error: true,
  });
  useEffect(() => { ApiService.getCustomProbes().then(setHistory).catch(report); }, []);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty && !pendingSegment) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, pendingSegment]);

  const replaceDraft = (action: () => void) => {
    if (pendingSegment) {
      setMessage({ text: 'Apply or discard the selected segment changes first.', error: true });
      return;
    }
    if (dirty) setReplaceAction(() => action);
    else action();
  };
  const resetEditor = () => {
    setRevision(n => n + 1);
    setValidity({ basic: true, advanced: true });
    setPendingSegment(false); setDirty(false); setMessage(null);
  };
  const newMethod = () => replaceDraft(() => {
    setDraft(fresh()); setScope('probe_1'); resetEditor();
  });
  const load = (group: any) => replaceDraft(() => {
    try {
      const protocol = readProtocol(group.yamlContent);
      const probes = normalizeProbes(group, protocol);
      const restored = restoreTemplate({
        ...protocol, probes,
        ...(!protocol.extracts?.target_region && !protocol.target_sequence && group.targetConfig
          ? { target_sequence: group.targetConfig } : {}),
      });
      const target = { source: 'exon', length: 40, ...restored.targetConfig, sequence: undefined } as TargetConfig;
      const bars = protocol.barcodes || protocol.barcode_config || group.barcodeConfig || { count: 0, barcodes: {} };
      const { probes: _probes, target_sequence: _legacy, barcodes: _bars, barcode_config: _legacyBars, ...seed } = protocol;
      if (seed.extracts) { seed.extracts = { ...seed.extracts }; delete seed.extracts.target_region; }
      setDraft({
        id: group.id, name: group.name,
        description: group.description || protocol.metadata?.description || '',
        createdAt: group.createdAt, probes: restored.probes, target,
        barcodes: { ...bars, barcodes: bars.barcodes || {}, count: Object.keys(bars.barcodes || {}).length }, seed,
      });
      setScope(Object.keys(probes)[0] || ''); setShowHistory(false); resetEditor();
    } catch (error) { report(error); }
  });
  const save = async (use = false) => {
    if (busy || pendingSegment) return;
    try {
      if (!draft.name.trim()) throw new Error('Enter a method name.');
      if (!validity.basic || !validity.advanced) throw new Error('Complete the target settings.');
      const protocol = compileProtocol(draft.seed, draft.probes, draft.target, draft.barcodes, {
        name: draft.name.trim(), description: draft.description,
      });
      const group = {
        id: draft.id, name: draft.name.trim(), description: draft.description,
        type: 'custom', schemaVersion: 2, createdAt: draft.createdAt, updatedAt: new Date().toISOString(),
        probes: protocol.probes, targetConfig: protocol.extracts.target_region,
        targetLength: draft.target.length, step: draft.target.step ?? 1,
        barcodeCount: draft.barcodes.count, barcodeConfig: draft.barcodes,
        yamlContent: yaml.dump(protocol, { noRefs: true, lineWidth: -1 }),
      };
      setBusy(true);
      await ApiService.saveCustomProbe(group);
      setDirty(false);
      setHistory(await ApiService.getCustomProbes());
      setMessage({ text: 'Method saved.', error: false });
      if (use) navigate('/design/designworkflow?template=' + encodeURIComponent(group.name));
    } catch (error) { report(error); } finally { setBusy(false); }
  };

  const scopes: { path: string; node: ProbeConfig }[] = [];
  walkProbes(draft.probes, (node, path) => scopes.push({ path, node }));
  const activeScope = scopes.find(item => item.path === scope) || scopes[0];
  const renameScope = (before: string, after: string) => {
    setDraft(previous => {
      const seed = structuredClone(previous.seed);
      const rewrite = (path: string) => path === before ? after : path.startsWith(before + '.') ? after + path.slice(before.length) : path;
      for (const attr of Object.values(seed.attributes || {}) as any[]) {
        if (typeof attr.target === 'string') attr.target = rewrite(attr.target);
      }
      for (const filter of Object.values(seed.post_process?.filters || {}) as any[]) {
        if (typeof filter.target === 'string') filter.target = rewrite(filter.target);
      }
      return { ...previous, seed };
    });
    setScope(previous => previous === before ? after : previous.startsWith(before + '.') ? after + previous.slice(before.length) : previous);
    setDirty(true);
  };
  const changeTarget = (target: TargetConfig) => {
    const removed = Object.keys(draft.target.layout?.parts || {}).filter(name => !target.layout?.parts[name]);
    let referenced = false;
    walkProbes(draft.probes, node => {
      const names = [...(node.expr || '').matchAll(/target_parts\s*\[\s*(['"])([^'"]+)\1\s*\]/g)].map(match => match[2]);
      if (names.some(name => removed.includes(name))) referenced = true;
    });
    for (const filter of Object.values(draft.seed.post_process?.filters || {}) as any[]) {
      const path = String(filter.target || '').replace(/:/g, '.');
      if (removed.some(name => path === `target_parts.${name}` || path.startsWith(`target_parts.${name}.`))) referenced = true;
    }
    if (referenced) {
      setMessage({ text: 'A segment or filter uses this target region. Update that reference before removing it.', error: true });
      return;
    }
    patch({ target });
  };
  const removeBarcode = () => {
    if (!deletingBarcode) return;
    const name = deletingBarcode;
    let used = false;
    walkProbes(draft.probes, node => {
      if (node.expr?.includes(`'${name}'`) || node.expr?.includes(`"${name}"`)) used = true;
    });
    if (used) setMessage({ text: 'This barcode is used by a segment.', error: true });
    else {
      const entries = { ...draft.barcodes.barcodes }; delete entries[name];
      patch({ barcodes: { ...draft.barcodes, barcodes: entries, count: Object.keys(entries).length } });
    }
    setDeletingBarcode(null);
  };
  const pendingHint = pendingSegment ? 'Apply or discard segment changes first' : '';

  return <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 3 }, pb: 5 }}>
    <Stack spacing={2.5}>
      <Box component="section" aria-label="Method information">
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>Custom Probe</Typography>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={pendingHint}><span><Button disabled={busy || pendingSegment} onClick={() => setShowHistory(true)}>Saved methods</Button></span></Tooltip>
            <Tooltip title={pendingHint}><span><Button disabled={busy || pendingSegment} onClick={newMethod}>New method</Button></span></Tooltip>
          </Stack>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField size="small" label="Method name" value={draft.name} disabled={busy} onChange={e => patch({ name: e.target.value })} sx={{ width: { xs: '100%', sm: 300 }, flexShrink: 0 }} />
          <TextField size="small" fullWidth label="Description (optional)" value={draft.description} disabled={busy} onChange={e => patch({ description: e.target.value })} />
        </Stack>
      </Box>
      {message && <Alert severity={message.error ? 'error' : 'success'} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Paper component="section" variant="outlined" sx={panelStyle} aria-label="Probe structure canvas">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>Probe Structure</Typography>
          <Chip size="small" variant="outlined" label={`${Object.keys(draft.probes).length} probe${Object.keys(draft.probes).length === 1 ? '' : 's'}`} />
        </Stack>
        <ProbeStructureEditor
          key={revision} probes={draft.probes} target={draft.target} barcodes={draft.barcodes}
          onChange={probes => patch({ probes })} onBarcodes={barcodes => patch({ barcodes })}
          onRename={renameScope} inspectorContainer={inspectorContainer}
          onPendingChange={setPendingSegment}
          onSelectionChange={path => { if (path) setScope(path.join('.')); }}
        />
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
        <Paper component="section" variant="outlined" sx={panelStyle} aria-label="Target settings">
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Target Settings</Typography>
          <CustomTargetEditor
            key={`target-${revision}`} value={draft.target}
            onValidity={valid => setValidity(previous => ({ ...previous, basic: valid }))}
            onChange={changeTarget}
            onRename={(layout, before, after) => {
              patch({ target: { ...draft.target, layout }, probes: renameTargetRegion(draft.probes, before, after) });
              renameScope(`target_parts.${before}`, `target_parts.${after}`);
            }}
          />
        </Paper>
        <Paper component="section" variant="outlined" sx={panelStyle} aria-label="Selected segment settings">
          <Box ref={setInspectorContainer} />
        </Paper>
      </Box>

      <Accordion disableGutters elevation={0} sx={{ ...disclosureStyle, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-label="Advanced settings" sx={{ px: { xs: 2, sm: 2.5 } }}>
          <Typography variant="subtitle2">Advanced Settings</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pt: 0, pb: 2 }}>
          <Accordion disableGutters elevation={0} sx={disclosureStyle}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Filters &amp; Attributes</Typography></AccordionSummary>
            <AccordionDetails><Stack spacing={2}>
              {activeScope && <>
                <TextField select size="small" label="Sequence" value={activeScope.path} sx={{ maxWidth: 360 }} onChange={e => setScope(e.target.value)}>
                  {scopes.map(({ path }) => <MenuItem key={path} value={path}>{path.replace(/\./g, ' / ')}</MenuItem>)}
                </TextField>
                <ProbeAttributesEditor dna={draft.target.source === 'genome'} value={activeScope.node.attributes} onChange={attributes => patch({ probes: updateNode(draft.probes, activeScope.path.split('.'), node => ({ ...node, attributes })) })} />
              </>}
            </Stack></AccordionDetails>
          </Accordion>
          <Divider />
          <Accordion disableGutters elevation={0} sx={disclosureStyle}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Barcode definitions</Typography></AccordionSummary>
            <AccordionDetails><Stack spacing={1.5}>
              {Object.entries(draft.barcodes.barcodes).map(([name, value]) => <Stack key={name} direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <Typography variant="body2" sx={{ minWidth: 80 }}>{name}</Typography>
                <TextField size="small" label="Length (nt)" type="number" inputProps={{ min: 1 }} sx={{ width: 160 }} value={value.length ?? draft.barcodes.default_length ?? ''} onChange={e => patch({ barcodes: { ...draft.barcodes, barcodes: { ...draft.barcodes.barcodes, [name]: { ...value, length: Number(e.target.value) } } } })} />
                <Tooltip title={`Delete ${name}`}><IconButton size="small" aria-label={`Delete barcode ${name}`} onClick={() => setDeletingBarcode(name)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>)}
              {!Object.keys(draft.barcodes.barcodes).length && <Typography variant="body2" color="text.secondary">Define a barcode from a Barcode / Readout segment.</Typography>}
            </Stack></AccordionDetails>
          </Accordion>
          <Divider />
          <Accordion disableGutters elevation={0} sx={disclosureStyle}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Target advanced settings</Typography></AccordionSummary>
            <AccordionDetails>
              <CustomTargetEditor key={`advanced-${revision}`} advancedOnly value={draft.target} onChange={changeTarget}
                onValidity={valid => setValidity(previous => ({ ...previous, advanced: valid }))}
                onRename={() => {}} />
            </AccordionDetails>
          </Accordion>
        </AccordionDetails>
      </Accordion>

      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="flex-end" spacing={1.5} sx={{ pt: 1 }}>
        {(pendingSegment || dirty) && <Typography variant="caption" color="text.secondary" sx={{ mr: { sm: 'auto' } }}>{pendingSegment ? 'Segment changes need Apply or Discard' : 'Unsaved changes'}</Typography>}
        <Tooltip title={pendingHint}><span><Button fullWidth disabled={busy || pendingSegment} onClick={() => save()}>Save method</Button></span></Tooltip>
        <Tooltip title={pendingHint}><span><Button fullWidth disabled={busy || pendingSegment} variant="contained" disableElevation onClick={() => save(true)}>Save &amp; use in workflow</Button></span></Tooltip>
      </Stack>
    </Stack>

    <Dialog open={showHistory} onClose={() => setShowHistory(false)} fullWidth maxWidth="sm">
      <DialogTitle>Saved methods</DialogTitle>
      <DialogContent><Stack spacing={1}>
        {history.map(group => <Stack direction="row" key={group.id} alignItems="center" spacing={0.5}>
          <Button sx={{ textTransform: 'none', mr: 'auto', minWidth: 0, overflowWrap: 'anywhere' }} onClick={() => load(group)}>{group.name}</Button>
          <Tooltip title="Download method"><IconButton size="small" aria-label={`Download ${group.name}`} onClick={() => {
            const url = URL.createObjectURL(new Blob([group.yamlContent], { type: 'text/yaml' }));
            const link = document.createElement('a'); link.href = url; link.download = `${group.name}.yaml`; link.click(); URL.revokeObjectURL(url);
          }}><DownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Delete method"><IconButton size="small" aria-label={`Delete ${group.name}`} onClick={() => setDeleting(group)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>)}
        {!history.length && <Typography color="text.secondary">No saved methods</Typography>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setShowHistory(false)}>Close</Button></DialogActions>
    </Dialog>
    <Dialog open={!!replaceAction} onClose={() => setReplaceAction(null)}>
      <DialogTitle>Discard unsaved method changes?</DialogTitle>
      <DialogContent><Typography variant="body2">The current method has changes that have not been saved.</Typography></DialogContent>
      <DialogActions><Button onClick={() => setReplaceAction(null)}>Keep editing</Button><Button color="error" onClick={() => { const action = replaceAction; setReplaceAction(null); action?.(); }}>Discard changes</Button></DialogActions>
    </Dialog>
    <Dialog open={!!deletingBarcode} onClose={() => setDeletingBarcode(null)}>
      <DialogTitle>Delete barcode {deletingBarcode}?</DialogTitle>
      <DialogActions><Button onClick={() => setDeletingBarcode(null)}>Cancel</Button><Button color="error" onClick={removeBarcode}>Delete</Button></DialogActions>
    </Dialog>
    <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
      <DialogTitle>Delete {deleting?.name}?</DialogTitle>
      <DialogContent><Typography variant="body2">This removes the saved method.</Typography></DialogContent>
      <DialogActions><Button onClick={() => setDeleting(null)}>Cancel</Button><Button color="error" onClick={async () => {
        try { await ApiService.deleteCustomProbe(deleting.id); setHistory(await ApiService.getCustomProbes()); setDeleting(null); } catch (error) { report(error); }
      }}>Delete</Button></DialogActions>
    </Dialog>
    <Dialog open={busy} disableEscapeKeyDown aria-labelledby="saving-method-title" maxWidth="xs">
      <DialogContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={24} />
        <Typography id="saving-method-title" variant="body2">Saving method…</Typography>
      </DialogContent>
    </Dialog>
  </Container>;
}
