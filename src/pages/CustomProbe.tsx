import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  CircularProgress, Container, Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ApiService from '../api';
import LegacyTargetSequence from '../components/LegacyTargetSequence';
import BiotechIcon from '@mui/icons-material/Biotech';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import { exampleTarget } from '../utils/probePreview';
import ProbeStructureEditor from '../components/ProbeStructureEditor';
import ProbeAttributesEditor from '../components/ProbeAttributesEditor';
import type { ProbeConfig, ProbesConfig } from '../types';
import { useDraftState } from '../utils/useDraftState';
import { restoreTemplate } from '../utils/probeConfig';
import {
  TargetConfig, BarcodeConfig, compileProtocol, createProbe, normalizeProbes,
  walkProbes, updateNode,
} from '../utils/probeBuilder';
import { renameTargetReferences, targetRegionReferences, usesBarcode } from '../utils/probeReferences';
import { saveCustomMethod } from '../utils/customProbeSave';

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
  id: crypto.randomUUID(), name: `Probe_${Math.floor(Math.random() * 10000)}`, description: '', createdAt: new Date().toISOString(),
  probes: { probe_1: createProbe() },
  target: { source: 'exon', length: 50, step: 1, attributes: {} },
  barcodes: { count: 0, default_length: 12, barcodes: {} }, seed: {},
});
const readProtocol = (text: string) => {
  const value = yaml.load(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This method has no valid saved protocol.');
  }
  return value as Record<string, any>;
};
const panelStyle = { p: { xs: 2, sm: 3 }, minWidth: 0, boxShadow: 'none', bgcolor: 'background.default', borderRadius: 2 };
const disclosureStyle = { '&:before': { display: 'none' }, boxShadow: 'none' };
const localIconStyle = {
  minWidth: 40, minHeight: 40, color: 'text.secondary',
  '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
  '&.Mui-disabled': { color: 'action.disabled' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};
const deleteIconStyle = {
  ...localIconStyle, color: 'error.main',
  '&:hover': { color: 'error.main', bgcolor: 'action.hover' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'error.main', outlineOffset: 2 },
};

export default function CustomProbe() {
  const navigate = useNavigate();
  const [draft, setDraft] = useDraftState<BuilderDraft>('custom.canonical.v1', fresh());
  const [previewSeed, setPreviewSeed] = useState(1);
  const previewLength = Array.isArray(draft.target.length) ? draft.target.length[0] : draft.target.length;
  const targetPreview = exampleTarget(previewLength, previewSeed);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('probe_1');
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [validity, setValidity] = useState({ basic: true, advanced: true });
  const [dirty, setDirty] = useDraftState<boolean>('custom.canonical.dirty', false);
  const [pendingSegment, setPendingSegment] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [deletingBarcode, setDeletingBarcode] = useState<string | null>(null);
  const [replaceAction, setReplaceAction] = useState<(() => void) | null>(null);

  const patch = (values: Partial<BuilderDraft>) => {
    if (Object.entries(values).every(([key, value]) => JSON.stringify(draft[key as keyof BuilderDraft]) === JSON.stringify(value))) return;
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
    setSelectedSegment(null);
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
      await saveCustomMethod(() => ApiService.saveCustomProbe(group), () => ApiService.getCustomProbes(), {
        saved: () => { setDirty(false); setMessage({ text: 'Method saved.', error: false }); },
        refreshed: setHistory,
        refreshFailed: () => {
          if (!use) setMessage({ text: 'Method saved. Saved methods could not refresh; reopen the list to retry.', error: false });
        },
        use: use ? () => navigate('/design/designworkflow?template=' + encodeURIComponent(group.name)) : undefined,
      });
    } catch (error) { report(error); } finally { setBusy(false); }
  };

  const scopes: { path: string; node: ProbeConfig }[] = [];
  walkProbes(draft.probes, (node, path) => scopes.push({ path, node }));
  const activeScope = scopes.find(item => item.path === scope);
  const selectedScope = scopes.find(item => item.path === selectedSegment);
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
    setSelectedSegment(previous => previous === before ? after : previous?.startsWith(before + '.') ? after + previous.slice(before.length) : previous);
    setDirty(true);
  };
  const changeTarget = (target: TargetConfig) => {
    const removed = Object.keys(draft.target.layout?.parts || {}).filter(name => !target.layout?.parts[name]);
    if (targetRegionReferences({ ...draft.seed, probes: draft.probes }, removed).length) {
      setMessage({ text: 'A segment, attribute or saved filter uses this target region. Update that reference before removing it.', error: true });
      return;
    }
    patch({ target });
  };
  const removeBarcode = () => {
    if (!deletingBarcode) return;
    const name = deletingBarcode;
    if (usesBarcode(draft.probes, name)) setMessage({ text: 'This barcode is used by a segment.', error: true });
    else {
      const entries = { ...draft.barcodes.barcodes }; delete entries[name];
      patch({ barcodes: { ...draft.barcodes, barcodes: entries, count: Object.keys(entries).length } });
    }
    setDeletingBarcode(null);
  };
  const pendingHint = pendingSegment ? 'Apply or discard segment changes first' : '';

  return <Container maxWidth={false} sx={{ py: 3, pb: 5 }}><Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 2 }}>
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ py: 1, mb: 2 }}>
        <BiotechIcon color="primary" sx={{ fontSize: 36 }} /><Typography variant="h4" fontWeight={600}>Create Your Own Probe Type</Typography>
      </Stack>
      {message && <Alert severity={message.error ? 'error' : 'success'} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Paper component="section" variant="outlined" sx={panelStyle} aria-label="Target settings">
        <LegacyTargetSequence key={`target-${revision}`} value={draft.target} preview={targetPreview}
          onRegenerate={() => setPreviewSeed(seed => seed + 1)} onChange={changeTarget}
          onValidity={valid => setValidity({ basic: valid, advanced: valid })}
          onRename={(layout, before, after) => patch({ target: { ...draft.target, layout },
            probes: renameTargetReferences(draft.probes, before, after), seed: renameTargetReferences(draft.seed, before, after) })} />
      </Paper>
      <Paper component="section" variant="outlined" sx={panelStyle} aria-label="Probe structure design">
        <ProbeStructureEditor heading={<Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><SettingsIcon color="primary" /><Typography variant="h5" fontWeight={600}>Probe Type Design</Typography></Stack>} information={<Box>        <TextField fullWidth size="small" label="Probe Group Name" value={draft.name} disabled={busy} onChange={event => patch({ name: event.target.value })} sx={{ mb: 1.5 }} />
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 3 }}>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={busy || pendingSegment} onClick={() => save()}>Save Probe Group</Button>
          <Button disabled={busy || pendingSegment} onClick={newMethod}>New method</Button>
        </Stack>
</Box>} key={revision} probes={draft.probes} previewTarget={targetPreview} onHistory={() => { setShowHistory(true); void ApiService.getCustomProbes().then(setHistory).catch(report); }} target={draft.target} barcodes={draft.barcodes}
          onChange={probes => patch({ probes })} onBarcodes={barcodes => patch({ barcodes })}
          onRename={renameScope} onPendingChange={setPendingSegment}
          onSelectionChange={path => setSelectedSegment(path?.join('.') || null)} />
      </Paper>

      <Accordion disableGutters elevation={0} sx={{ ...disclosureStyle, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-label="Advanced settings" sx={{ px: { xs: 2, sm: 2.5 } }}>
          <Typography variant="subtitle2">Filters, Attributes &amp; Barcodes</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pt: 0, pb: 2 }}>
          <Accordion disableGutters elevation={0} sx={disclosureStyle}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Filters &amp; Attributes</Typography></AccordionSummary>
            <AccordionDetails><Stack spacing={2}>
              <Typography variant="caption" color="text.secondary">Choose the sequence whose attributes you want to edit.</Typography>
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>Selected segment: {selectedScope ? selectedScope.path.replace(/\./g, ' / ') : 'None'}</Typography>
                {selectedScope && selectedScope.path !== scope && <Button size="small" onClick={() => setScope(selectedScope.path)}>Use selected segment</Button>}
              </Stack>
                <TextField select size="small" label="Filter target" value={activeScope?.path || ''} sx={{ maxWidth: 360 }} onChange={e => setScope(e.target.value)}>
                  <MenuItem value="" disabled>Choose a sequence</MenuItem>
                  {scopes.map(({ path }) => <MenuItem key={path} value={path}>{path.replace(/\./g, ' / ')}</MenuItem>)}
                </TextField>
              {activeScope ? <>
                <ProbeAttributesEditor dna={draft.target.source === 'genome'} value={activeScope.node.attributes} onChange={attributes => patch({ probes: updateNode(draft.probes, activeScope.path.split('.'), node => ({ ...node, attributes })) })} />
              </> : <Typography variant="body2" color="text.secondary">Choose a filter target to edit its attributes.</Typography>}
            </Stack></AccordionDetails>
          </Accordion>
          <Divider />
          <Accordion disableGutters elevation={0} sx={disclosureStyle}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Barcode definitions</Typography></AccordionSummary>
            <AccordionDetails><Stack spacing={1.5}>
              {Object.entries(draft.barcodes.barcodes).map(([name, value]) => <Stack key={name} direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                <Typography variant="body2" sx={{ minWidth: 80 }}>{name}</Typography>
                <TextField size="small" label="Length (nt)" type="number" inputProps={{ min: 1 }} sx={{ width: 160 }} value={value.length ?? draft.barcodes.default_length ?? ''} onChange={e => patch({ barcodes: { ...draft.barcodes, barcodes: { ...draft.barcodes.barcodes, [name]: { ...value, length: Number(e.target.value) } } } })} />
                <Tooltip title={`Delete ${name}`}><IconButton size="small" sx={deleteIconStyle} aria-label={`Delete barcode ${name}`} onClick={() => setDeletingBarcode(name)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>)}
              {!Object.keys(draft.barcodes.barcodes).length && <Typography variant="body2" color="text.secondary">Define a barcode from a Barcode / Readout segment.</Typography>}
            </Stack></AccordionDetails>
          </Accordion>

        </AccordionDetails>
      </Accordion>

      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="flex-end" spacing={1.5} sx={{ pt: 1 }}>
        {(pendingSegment || dirty) && <Typography variant="caption" color="text.secondary" sx={{ mr: { sm: 'auto' } }}>{pendingSegment ? 'Segment changes need Apply or Discard' : 'Unsaved changes'}</Typography>}
        <Tooltip title={pendingHint}><span><Button fullWidth disabled={busy || pendingSegment} onClick={() => save()}>Save method</Button></span></Tooltip>
        <Tooltip title={pendingHint}><span><Button fullWidth disabled={busy || pendingSegment} variant="contained" disableElevation onClick={() => save(true)}>Save &amp; use in workflow</Button></span></Tooltip>
      </Stack>
    </Stack></Paper>

    <Dialog open={showHistory} onClose={() => setShowHistory(false)} fullWidth maxWidth="sm">
      <DialogTitle>Saved methods</DialogTitle>
      <DialogContent><Stack spacing={1}>
        {history.map(group => <Stack direction="row" key={group.id} alignItems="center" spacing={0.5}>
          <Button sx={{ textTransform: 'none', mr: 'auto', minWidth: 0, overflowWrap: 'anywhere' }} onClick={() => load(group)}>{group.name}</Button>
          <Tooltip title="Download method"><IconButton size="small" sx={localIconStyle} aria-label={`Download ${group.name}`} onClick={() => {
            const url = URL.createObjectURL(new Blob([group.yamlContent], { type: 'text/yaml' }));
            const link = document.createElement('a'); link.href = url; link.download = `${group.name}.yaml`; link.click(); URL.revokeObjectURL(url);
          }}><DownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Delete method"><IconButton size="small" sx={deleteIconStyle} aria-label={`Delete ${group.name}`} onClick={() => setDeleting(group)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
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
