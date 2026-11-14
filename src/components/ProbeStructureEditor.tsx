import { ReactNode, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack,
  TextField, Tooltip, Typography, ListSubheader,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SettingsIcon from '@mui/icons-material/Settings';
import BiotechIcon from '@mui/icons-material/Biotech';
import ProbeAttributesEditor from './ProbeAttributesEditor';
import { previewSequence } from '../utils/probePreview';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import type { ProbeConfig, ProbesConfig } from '../types';
import { formatTargetLength } from '../utils/sampling';
import {
  TargetConfig, BarcodeConfig, SegmentForm, TemplateSegment, createProbe,
  getNode, updateNode, parseTemplate, segmentForm,
  segmentLabel, inferLength, uniqueName, removePart, removeProbe, reorderPart,
  renameProbe, walkProbes,
} from '../utils/probeBuilder';

import { SegmentEdit as Editing, SegmentAction, applySegmentEdit, equalSegmentData as same, remapSegmentAction } from '../utils/segmentEditing';

const types = [
  { kind: 'target', label: 'Target binding', group: 'Basic', help: 'Bind a target region.' },
  { kind: 'barcode', label: 'Barcode / Readout', group: 'Basic', help: 'Use a defined barcode or readout.' },
  { kind: 'fixed', label: 'Fixed sequence', group: 'Basic', help: 'Include a known nucleotide sequence.' },
  { kind: 'probe', label: 'Probe reference', group: 'Advanced', help: 'Reuse a probe or one of its segments.' },
  { kind: 'composite', label: 'Composite segment', group: 'Advanced', help: 'Group several segments into one block.' },
];
const colors = { target: '#4e91a0', barcode: '#8973a8', fixed: '#ac8c59', probe: '#6488ac', composite: '#5e9282', custom: '#828996' };
interface Props {
  probes: ProbesConfig;
  onChange: (probes: ProbesConfig) => void;
  target: TargetConfig;
  barcodes: BarcodeConfig;
  onBarcodes: (barcodes: BarcodeConfig) => void;
  heading?: ReactNode;
  information?: ReactNode;
  previewTarget?: string;
  onHistory?: () => void;
  onRename: (before: string, after: string) => void;
  onPendingChange?: (pending: boolean) => void;
  onSelectionChange?: (path: string[] | null) => void;
}

export default function ProbeStructureEditor({ probes, onChange, target, barcodes, onBarcodes, onRename, heading, information, previewTarget = '', onHistory, onPendingChange, onSelectionChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ path: string[]; name: string } | null>(null);
  const [newBarcode, setNewBarcode] = useState<{ name: string; length: number } | null>(null);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<SegmentAction | null>(null);
  const [danger, setDanger] = useState<{ title: string; description: string; action?: Extract<SegmentAction, { kind: 'delete' }>; continuation?: SegmentAction; replacement?: boolean } | null>(null);
  const [attributePath, setAttributePath] = useState<string[] | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [advanced, setAdvanced] = useState(false);
  const [probeExpanded, setProbeExpanded] = useState<Record<string, boolean>>({});
  const dirty = !!editing && (!editing.original || !same(editing.form, editing.initialForm));
  const form = editing?.form;
  const literal = !!editing && editing.index !== undefined && !editing.nodePath;

  useEffect(() => { onPendingChange?.(dirty); return () => onPendingChange?.(false); }, [dirty, onPendingChange]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);

  const run = (action: () => void | boolean) => {
    try { if (action() === false) return false; setError(''); return true; }
    catch (e) { setError((e as Error).message); return false; }
  };
  const guarded = (action: SegmentAction) => {
    if (dirty) setPendingAction(action);
    else run(() => execute(action, probes));
  };
  const clearSelection = () => { setEditing(null); onSelectionChange?.(null); setAdvanced(false); setError(''); };
  const lengthLabel = (node: ProbeConfig) => {
    try { const length = inferLength(node, probes, target, barcodes); return length === undefined ? 'Length varies' : `${formatTargetLength(length)} nt`; }
    catch { return 'Length varies'; }
  };
  const patch = (values: Partial<SegmentForm>) => setEditing(current => current && ({ ...current, form: { ...current.form, ...values } }));
  const makeSelection = (source: ProbesConfig, parentPath: string[], index?: number, directName?: string): Editing => {
    const parent = getNode(source, parentPath);
    let original: ProbeConfig | undefined;
    let nodePath: string[] | undefined;
    let name = uniqueName(parent.parts || {}, 'segment');
    if (directName) { name = directName; nodePath = [...parentPath, name]; original = getNode(source, nodePath); }
    else if (index !== undefined) {
      const token = parseTemplate(parent.template || '')[index];
      if (!token) throw new Error('This segment no longer exists.');
      name = token.name || '';
      if (token.name !== undefined) { nodePath = [...parentPath, token.name]; original = parent.parts?.[token.name]; }
      else original = { expr: `'${token.literal}'`, length: token.literal.length };
      if (!original) throw new Error('The segment definition is missing.');
    }
    const nextForm = segmentForm(original || { expr: 'rc(target_region)' }, name);
    return { parentPath, index, nodePath, original, form: nextForm, initialForm: { ...nextForm }, parentTemplate: parent.template };
  };
  const execute = (action: SegmentAction, source: ProbesConfig) => {
    if (action.kind === 'clear') { clearSelection(); return; }
    if (action.kind === 'select') {
      const next = makeSelection(source, action.parentPath, action.index, action.nodePath?.[action.nodePath.length - 1]);
      setEditing(next); setAdvanced(false);
      onSelectionChange?.(next.original ? next.nodePath || next.parentPath : null);
      if (next.original?.template !== undefined && next.nodePath) setExpanded(previous => ({ ...previous, [next.nodePath!.join('.')]: true }));
      return;
    }
    if (action.kind === 'addProbe') {
      const name = uniqueName(source, 'probe_');
      onChange({ ...source, [name]: createProbe() }); clearSelection(); return;
    }
    if (action.kind === 'move') {
      const next = updateNode(source, action.parentPath, node => reorderPart(node, action.index, action.offset));
      if (!same(next, source)) onChange(next);
      clearSelection(); return;
    }
    if (action.kind === 'renameProbe') {
      getNode(source, action.nodePath);
      setRenaming({ path: action.nodePath, name: action.nodePath[action.nodePath.length - 1] }); return;
    }
    const label = action.nodePath?.[action.nodePath.length - 1] || 'selected segment';
    setDanger({ title: `Delete ${label}?`, description: 'This removes the sequence from this method. Existing references are checked before it is removed.', action });
  };
  const select = (parentPath: string[], index?: number, directName?: string) => guarded({ kind: 'select', parentPath, index, nodePath: directName ? [...parentPath, directName] : undefined });
  const selectionMatches = (parentPath: string[], index?: number, name?: string) => !!editing && same(editing.parentPath, parentPath) && (name ? editing.nodePath?.join('.') === [...parentPath, name].join('.') : editing.index === index && !editing.nodePath);


  const apply = (replaceComposite = false, continuation?: SegmentAction): boolean => {
    if (!editing) { if (continuation) return run(() => execute(continuation, probes)); return true; }
    if (!replaceComposite && editing.original?.template !== undefined && Object.keys(editing.original.parts || {}).length && editing.form.kind !== 'composite') {
      setDanger({ title: 'Replace composite segment?', description: 'Its nested segments will be removed. Any remaining references must still be valid.', replacement: true, continuation });
      return false;
    }
    return run(() => {
      const result = applySegmentEdit(probes, editing, target, barcodes);
      if (result.renamed) onRename(...result.renamed);
      if (result.changed) onChange(result.probes);
      setEditing(result.editing);
      onSelectionChange?.(result.editing.nodePath || result.editing.parentPath);
      if (result.editing.form.kind === 'composite' && result.editing.nodePath) setExpanded(previous => ({ ...previous, [result.editing.nodePath!.join('.')]: true }));
      setDanger(null);
      if (continuation) execute(remapSegmentAction(continuation, result.renamed), result.probes);
      else clearSelection();
      setPendingAction(null);
    });
  };
  const askDelete = (action: Extract<SegmentAction, { kind: 'delete' }>) => guarded(action);
  const deleteSequence = (action: Extract<SegmentAction, { kind: 'delete' }>) => {
    const next = action.index !== undefined && action.parentPath ? removePart(probes, action.parentPath, action.index) : action.nodePath ? removeProbe(probes, action.nodePath) : probes;
    if (!same(next, probes)) onChange(next);
    clearSelection();
  };
  const move = (parentPath: string[], index: number, offset: number) => guarded({ kind: 'move', parentPath, index, offset });
  const icon = (label: string, child: ReactNode, action: () => void, disabled = false, destructive = false) => <Tooltip title={label}>
    <span><IconButton size="small" aria-label={label} disabled={disabled} onClick={action} sx={{ color: destructive ? 'error.main' : 'text.secondary', width: 40, height: 40, '& .MuiSvgIcon-root': { fontSize: 18 }, '&:hover': { color: destructive ? 'error.main' : 'primary.main', bgcolor: destructive ? theme => alpha(theme.palette.error.main, 0.09) : 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: destructive ? 'error.main' : 'primary.main', outlineOffset: 2 }, '&.Mui-disabled': { color: 'action.disabled' } }}>{child}</IconButton></span>
  </Tooltip>;

  const renderNode = (node: ProbeConfig, path: string[]): ReactNode => {
    let tokens: TemplateSegment[];
    try { tokens = parseTemplate(node.template || ''); }
    catch { return <Alert severity="warning">The saved structure is preserved, but its placeholders cannot be edited here.</Alert>; }
    const locked = !!completed[path[0]];
    const preview = previewSequence(node, probes, target, barcodes, previewTarget);
    return <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
      <Box>
        <Typography variant="subtitle2" gutterBottom>Sequence:</Typography>
        <Box sx={{ p: 2, minHeight: 54, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1, fontFamily: 'monospace', letterSpacing: '0.06em', overflowWrap: 'anywhere' }}>
          {!tokens.length ? 'No parts added yet' : preview === undefined ? 'Sequence preview unavailable for this saved expression. Its configuration is preserved.' : preview.slice(0, 3000)}
        </Box>
        <Typography variant="caption" color="text.secondary">{lengthLabel(node)} · 5′ → 3′ · Example preview</Typography>
      </Box>
      <Stack direction="row" gap={0.75} flexWrap="wrap">{tokens.map((token, index) => {
        const part = token.name !== undefined ? node.parts?.[token.name] : { expr: `'${token.literal}'` };
        return <Chip key={index} size="small" label={token.name || token.literal} onClick={locked ? undefined : () => select(path, index)} sx={{ bgcolor: alpha(colors[part ? segmentForm(part).kind : 'custom'], 0.16) }} />;
      })}</Stack>
      {tokens.map((token, index) => {
        const part = token.name !== undefined ? node.parts?.[token.name] : { expr: `'${token.literal}'` };
        const name = token.name || `Part ${index + 1}`;
        return <Box key={`${index}:${name}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={600}>Part {index + 1}: {name}</Typography><Typography variant="caption" color="text.secondary">{part ? segmentLabel(part) : 'Missing segment'} · {part ? lengthLabel(part) : ''}</Typography></Box>
            <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{part?.expr || (part?.template !== undefined ? 'Composite segment' : '')}</Typography>
            {!locked && <Stack direction="row" spacing={0}>
              {icon(`Edit ${name}`, <EditOutlinedIcon />, () => select(path, index))}
              {token.name && icon(`Attributes for ${name}`, <TuneIcon />, () => setAttributePath([...path, token.name!]))}
              {icon(`Move ${name} left`, <ArrowBackOutlinedIcon />, () => move(path, index, -1), index === 0)}
              {icon(`Move ${name} right`, <ArrowForwardOutlinedIcon />, () => move(path, index, 1), index === tokens.length - 1)}
              {icon(`Delete ${name}`, <DeleteOutlineIcon />, () => askDelete({ kind: 'delete', parentPath: path, index, nodePath: token.name ? [...path, token.name] : undefined }), false, true)}
            </Stack>}
          </Stack>
          {part?.template !== undefined && token.name && <>
            <Button size="small" endIcon={<ExpandMoreIcon />} onClick={() => setExpanded(previous => ({ ...previous, [[...path, token.name!].join('.')]: !previous[[...path, token.name!].join('.')] }))}>Nested parts</Button>
            <Collapse in={!!expanded[[...path, token.name].join('.')]}>{renderNode(part, [...path, token.name])}</Collapse>
          </>}
        </Box>;
      })}
      {Object.entries(node.parts || {}).filter(([name]) => !tokens.some(token => token.name === name)).map(([name]) => <Button key={name} variant="outlined" disabled={locked} color={selectionMatches(path, undefined, name) ? 'primary' : 'inherit'} onClick={() => select(path, undefined, name)}>Supporting part: {name}</Button>)}
      {!locked && <Button variant="outlined" startIcon={<AddOutlinedIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => select(path)}>Add Part</Button>}
    </Stack>;
  };

  const references: string[] = [];
  walkProbes(probes, (_, path) => references.push(path));
  const selectedPath = editing?.nodePath?.join(' / ') || editing?.parentPath.join(' / ');
  const inspector = <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="subtitle1" fontWeight={600}>{editing?.original ? 'Edit Part' : 'Add Part'}</Typography><Stack direction="row">{editing?.original && icon('Delete selected segment', <DeleteOutlineIcon fontSize="small" />, () => askDelete({ kind: 'delete', parentPath: editing.parentPath, index: editing.index, nodePath: editing.nodePath }), false, true)}{editing && icon('Close segment editor', <CloseOutlinedIcon fontSize="small" />, () => guarded({ kind: 'clear' }))}</Stack></Stack>
    {!editing ? <Box sx={{ py: 4, px: 2, textAlign: 'center', color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}><AccountTreeOutlinedIcon sx={{ fontSize: 28, mb: 1, opacity: 0.7 }} /><Typography variant="body2">Select a segment on the canvas to edit it.</Typography></Box> : <>
      <Stack direction="row" gap={1} alignItems="center"><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{selectedPath}{!editing.original ? ' / New segment' : ''}</Typography>{dirty && <Chip size="small" label="Pending" variant="outlined" sx={{ height: 22 }} />}</Stack>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {!literal && <TextField size="small" label="Segment name" value={form!.name} onChange={e => patch({ name: e.target.value })} />}
      <TextField select size="small" label="Type" value={form!.kind} disabled={literal} helperText={types.find(type => type.kind === form!.kind)?.help} onChange={e => patch({ kind: e.target.value as SegmentForm['kind'], start: '', length: '' })}>{['Basic', 'Advanced'].flatMap(group => [<ListSubheader key={group} sx={{ lineHeight: '32px', fontSize: 12 }}>{group}</ListSubheader>, ...types.filter(type => type.group === group).map(type => <MenuItem key={type.kind} value={type.kind}>{type.label}</MenuItem>)])}{form!.kind === 'custom' && <MenuItem value="custom">Saved segment</MenuItem>}</TextField>
      {form!.kind === 'custom' && <Typography variant="body2" color="text.secondary">The saved sequence rule is retained.</Typography>}
      {form!.kind === 'composite' && <Typography variant="body2" color="text.secondary">Expand this block on the canvas to edit its segments.</Typography>}
      {form!.kind === 'target' && <TextField select size="small" label="Region" value={form!.region} onChange={e => patch({ region: e.target.value, length: '', start: '' })}><MenuItem value="">Whole target</MenuItem>{Object.keys(target.layout?.parts || {}).map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}{form!.region && !target.layout?.parts[form!.region] && <MenuItem value={form!.region}>{form!.region} (removed)</MenuItem>}</TextField>}
      {form!.kind === 'barcode' && <><TextField select size="small" label="Barcode" value={form!.barcode} onChange={e => patch({ barcode: e.target.value })}><MenuItem value="">Choose barcode</MenuItem>{Object.entries(barcodes.barcodes).map(([name, item]) => <MenuItem key={name} value={name}>{name} · {item.length ?? barcodes.default_length ?? '?'} nt</MenuItem>)}</TextField><Button size="small" startIcon={<AddOutlinedIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => setNewBarcode({ name: uniqueName(barcodes.barcodes, 'BC'), length: barcodes.default_length ?? 12 })}>Define barcode</Button></>}
      {form!.kind === 'fixed' && <TextField size="small" label="Sequence" multiline minRows={2} value={form!.sequence} onChange={e => patch({ sequence: e.target.value })} helperText={`${form!.sequence.replace(/\s/g, '').length} nt`} />}
      {form!.kind === 'probe' && <TextField select size="small" label="Probe / Region" value={form!.reference} onChange={e => patch({ reference: e.target.value })}><MenuItem value="">Choose sequence</MenuItem>{references.map(path => <MenuItem key={path} value={path}>{path.replace(/\./g, ' / ')}{!path.includes('.') ? ' · Entire probe' : ''}</MenuItem>)}</TextField>}
      {['target', 'barcode', 'probe'].includes(form!.kind) && <TextField select size="small" label="Orientation" value={form!.reverse ? 'reverse' : 'forward'} onChange={e => patch({ reverse: e.target.value === 'reverse' })}><MenuItem value="forward">Forward</MenuItem><MenuItem value="reverse">Reverse complement</MenuItem></TextField>}
      {form!.kind === 'target' && <TextField size="small" label="Length (nt)" type="number" value={form!.length} placeholder="Entire region" onChange={e => patch({ length: e.target.value })} inputProps={{ min: 1 }} />}
      {['target', 'probe'].includes(form!.kind) && <Box>
        <Button size="small" color="inherit" endIcon={<ExpandMoreIcon sx={{ transform: advanced ? 'rotate(180deg)' : undefined }} />} onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}>Advanced</Button>
        <Collapse in={advanced}><Stack spacing={2} sx={{ pt: 1 }}><TextField size="small" label="Start (1-based)" type="number" value={form!.start} placeholder="1" onChange={e => patch({ start: e.target.value })} inputProps={{ min: 1 }} />{form!.kind === 'probe' && <TextField size="small" label="Length (nt)" type="number" value={form!.length} placeholder="Entire region" onChange={e => patch({ length: e.target.value })} inputProps={{ min: 1 }} />}</Stack></Collapse>
      </Box>}
      <Divider />
      <Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="small" disabled={same(form, editing.initialForm)} onClick={() => setEditing(current => current && ({ ...current, form: { ...current.initialForm } }))}>Reset</Button><Button size="small" variant="contained" disabled={!dirty} onClick={() => apply()}>Apply segment</Button></Stack>
    </>}
  </Stack>;

  return <>
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
        {heading}<Stack direction="row" spacing={1}>
        {onHistory && <Button variant="outlined" startIcon={<HistoryIcon />} onClick={onHistory}>History</Button>}
        <Button startIcon={<AddOutlinedIcon />} variant="contained" onClick={() => guarded({ kind: 'addProbe' })}>Add Probe</Button></Stack>
      </Stack>
      {information}
      {error && !editing && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {!Object.keys(probes).length && <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}><Typography variant="body2">Add a probe to begin your design.</Typography></Box>}
      {Object.entries(probes).map(([name, node]) => {
        const open = probeExpanded[name] ?? true;
        let count = 0; try { count = parseTemplate(node.template || '').length; } catch { /* Preserve unsupported saved structures. */ }
        return <Box key={name} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <BiotechIcon color={completed[name] ? 'success' : 'primary'} />
            <Box sx={{ mr: 'auto', minWidth: 0, flex: { xs: '1 1 calc(100% - 40px)', sm: '1 1 auto' } }}>
              <Typography variant="subtitle1" fontWeight={600}>{name}{completed[name] ? ' · Completed' : ''}</Typography>
              <TextField variant="standard" size="small" placeholder="Probe name (optional)" value={/^probe_\d+$/.test(name) ? '' : name} inputProps={{ readOnly: true, 'aria-label': `Rename ${name}` }} onClick={() => guarded({ kind: 'renameProbe', nodePath: [name] })} />
            </Box>
            <Typography variant="caption" color="text.secondary">{count} parts</Typography>
            {icon(`Probe attributes for ${name}`, <TuneIcon />, () => setAttributePath([name]))}
            {icon(completed[name] ? `Reopen ${name}` : `Mark ${name} complete`, completed[name] ? <SettingsIcon /> : <CheckCircleIcon color="success" />, () => run(() => {
              if (!completed[name] && !count) throw new Error('Add a part before marking this probe complete.');
              setCompleted(previous => ({ ...previous, [name]: !previous[name] }));
            }))}
            {icon(`${open ? 'Collapse' : 'Expand'} probe ${name}`, <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : undefined }} />, () => setProbeExpanded(previous => ({ ...previous, [name]: !open })))}
            {icon(`Delete probe ${name}`, <DeleteOutlineIcon />, () => askDelete({ kind: 'delete', nodePath: [name] }), false, true)}
          </Stack>
          <Collapse in={open}>{renderNode(node, [name])}</Collapse>
        </Box>;
      })}
    </Stack>
    <Dialog open={!!editing} onClose={() => guarded({ kind: 'clear' })} fullWidth maxWidth="sm" aria-label="Edit segment">
      <DialogContent sx={{ py: 3 }}>{inspector}</DialogContent>
    </Dialog>
    <Dialog open={!!attributePath} onClose={() => setAttributePath(null)} fullWidth maxWidth="md">
      <DialogTitle>{attributePath?.join(' / ')} Attributes</DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>{attributePath && <ProbeAttributesEditor dna={target.source === 'genome'} value={getNode(probes, attributePath).attributes} onChange={attributes => onChange(updateNode(probes, attributePath, node => ({ ...node, attributes })))} />}</DialogContent>
      <DialogActions><Button onClick={() => setAttributePath(null)}>Done</Button></DialogActions>
    </Dialog>
    <Dialog open={!!pendingAction} onClose={() => setPendingAction(null)} maxWidth="xs" fullWidth><DialogTitle>Keep segment changes?</DialogTitle><DialogContent><Typography variant="body2">Apply your changes before continuing, or discard them.</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setPendingAction(null)}>Keep editing</Button><Button onClick={() => { const action = pendingAction; setPendingAction(null); clearSelection(); if (action) run(() => execute(action, probes)); }}>Discard & continue</Button><Button variant="contained" onClick={() => { if (pendingAction) apply(false, pendingAction); }}>Apply &amp; continue</Button></DialogActions></Dialog>
    <Dialog open={!!danger} onClose={() => setDanger(null)} maxWidth="xs" fullWidth><DialogTitle>{danger?.title}</DialogTitle><DialogContent><Typography variant="body2">{danger?.description}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setDanger(null)}>Cancel</Button><Button color="error" onClick={() => { if (!danger) return; if (danger.replacement) apply(true, danger.continuation); else if (danger.action && run(() => deleteSequence(danger.action!))) setDanger(null); }}>Confirm</Button></DialogActions></Dialog>
    <Dialog open={!!renaming} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth><DialogTitle>Rename probe</DialogTitle><DialogContent><TextField sx={{ mt: 1 }} fullWidth autoFocus label="Name" value={renaming?.name || ''} onChange={e => setRenaming(renaming && ({ ...renaming, name: e.target.value }))} />{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={() => run(() => { if (!renaming) return; const next = renameProbe(probes, renaming.path, renaming.name); if (!same(next, probes)) { onRename(renaming.path.join('.'), renaming.name); onChange(next); } clearSelection(); setRenaming(null); })}>Apply</Button></DialogActions></Dialog>
    <Dialog open={!!newBarcode} onClose={() => setNewBarcode(null)} maxWidth="xs" fullWidth><DialogTitle>Define barcode</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Name" value={newBarcode?.name || ''} onChange={e => setNewBarcode(newBarcode && ({ ...newBarcode, name: e.target.value }))} /><TextField label="Length (nt)" type="number" value={newBarcode?.length ?? ''} onChange={e => setNewBarcode(newBarcode && ({ ...newBarcode, length: Number(e.target.value) }))} inputProps={{ min: 1 }} /></Stack>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setNewBarcode(null)}>Cancel</Button><Button onClick={() => run(() => { if (!newBarcode || !/^[A-Za-z_]\w*$/.test(newBarcode.name) || barcodes.barcodes[newBarcode.name] || !Number.isSafeInteger(newBarcode.length) || newBarcode.length <= 0) throw new Error('Enter a unique name and a positive length.'); const entries = { ...barcodes.barcodes, [newBarcode.name]: { length: newBarcode.length } }; onBarcodes({ ...barcodes, barcodes: entries, count: Object.keys(entries).length }); patch({ barcode: newBarcode.name }); setNewBarcode(null); })}>Add barcode</Button></DialogActions></Dialog>
  </>;
}
