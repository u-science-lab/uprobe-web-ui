import { Fragment, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Alert, Box, Button, ButtonBase, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography, ListSubheader,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
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
  onRename: (before: string, after: string) => void;
  inspectorContainer?: HTMLElement | null;
  onPendingChange?: (pending: boolean) => void;
  onSelectionChange?: (path: string[] | null) => void;
}

export default function ProbeStructureEditor({ probes, onChange, target, barcodes, onBarcodes, onRename, inspectorContainer, onPendingChange, onSelectionChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ path: string[]; name: string } | null>(null);
  const [newBarcode, setNewBarcode] = useState<{ name: string; length: number } | null>(null);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<SegmentAction | null>(null);
  const [danger, setDanger] = useState<{ title: string; description: string; action?: Extract<SegmentAction, { kind: 'delete' }>; continuation?: SegmentAction; replacement?: boolean } | null>(null);
  const [more, setMore] = useState<{ anchor: HTMLElement; path: string[] } | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [activeProbe, setActiveProbe] = useState(Object.keys(probes)[0] || '');
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
      setEditing(next); setAdvanced(false); setActiveProbe(action.parentPath[0]);
      onSelectionChange?.(next.original ? next.nodePath || next.parentPath : null);
      if (next.original?.template !== undefined && next.nodePath) setExpanded(previous => ({ ...previous, [next.nodePath!.join('.')]: true }));
      inspectorContainer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (action.kind === 'addProbe') {
      const name = uniqueName(source, 'probe_');
      onChange({ ...source, [name]: createProbe() }); setActiveProbe(name); clearSelection(); return;
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
  const namedSelected = (path: string[], index: number, name?: string) => !!editing && same(editing.parentPath, path) && editing.index === index && (name ? editing.nodePath?.join('.') === [...path, name].join('.') : !editing.nodePath);

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
    return <Box>
      <Box role="group" aria-label={`${path.join(' / ')} sequence, 5 prime to 3 prime`} sx={{ overflowX: 'auto', pb: 1, scrollbarWidth: 'thin' }}>
        <Stack direction="row" alignItems="center" sx={{ width: 'max-content', minWidth: '100%', py: 2, px: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pr: 1.5 }}>5′</Typography>
          {tokens.map((token, index) => {
            const part = token.name !== undefined ? node.parts?.[token.name] : { expr: `'${token.literal}'`, length: token.literal.length };
            const partForm = part ? segmentForm(part) : undefined;
            const kind = partForm?.kind || 'custom';
            const color = colors[kind];
            const selected = namedSelected(path, index, token.name);
            const name = token.name || token.literal;
            return <Fragment key={`${index}:${token.name || 'literal'}`}>
              {index > 0 && <Box aria-hidden sx={{ width: 24, flexShrink: 0, height: 2, bgcolor: 'divider' }} />}
              <Box sx={{ flexShrink: 0, width: kind === 'composite' ? 176 : 154, border: '1px solid', borderColor: selected ? 'primary.main' : alpha(color, 0.5), borderRadius: 1.5, bgcolor: alpha(color, selected ? 0.17 : 0.09), boxShadow: selected ? theme => `0 0 0 1px ${theme.palette.primary.main}` : 'none', '& .segment-actions': { opacity: selected ? 1 : 0.3 }, '&:hover .segment-actions, &:focus-within .segment-actions': { opacity: 1 }, '@media (hover: none)': { '& .segment-actions': { opacity: 1 } } }}>
                <Tooltip title={`${name} · ${part ? segmentLabel(part) : 'Missing segment'}`}><ButtonBase aria-label={`Select segment ${name}`} aria-pressed={selected} onClick={() => select(path, index)} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', px: 1.5, pt: 1.5, pb: 0.75, textAlign: 'left', borderRadius: '6px 6px 0 0', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: '100%' }}>{name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>{part ? segmentLabel(part) : 'Missing segment'}</Typography>
                  <Typography variant="caption" color="text.secondary">{part ? lengthLabel(part) : '—'}</Typography>
                </ButtonBase></Tooltip>
                {kind === 'target' && <Tooltip title={partForm?.reverse ? 'Antiparallel target binding (reverse complement)' : 'Target sequence in the same orientation'}><Box sx={{ px: 1.5, pb: 0.75, color: 'text.secondary' }}>
                  <Tooltip title={`Target: ${partForm?.region || 'Whole target'}`}><Typography variant="caption" noWrap sx={{ display: 'block', maxWidth: '100%', fontSize: 10 }}>Target: {partForm?.region || 'Whole target'}</Typography></Tooltip>
                  <svg viewBox="0 0 130 34" width="100%" height="34" role="img" aria-label={partForm?.reverse ? 'Probe 5 prime to 3 prime, target 3 prime to 5 prime' : 'Probe and target 5 prime to 3 prime'}>
                    <g fill="currentColor" fontSize="8" fontFamily="inherit"><text x="0" y="10">5′</text><text x="119" y="10">3′</text><text x="0" y="30">{partForm?.reverse ? '3′' : '5′'}</text><text x="119" y="30">{partForm?.reverse ? '5′' : '3′'}</text></g>
                    <g fill="none" stroke="currentColor" strokeWidth="1.1"><path d="M15 7H113l-4-3m4 3-4 3" /><path d={partForm?.reverse ? 'M113 27H15l4-3m-4 3 4 3' : 'M15 27H113l-4-3m4 3-4 3'} />{[32,46,60,74,88,102].map(x => <path key={x} d={`M${x} 12v10`} opacity="0.45" strokeDasharray={partForm?.reverse ? undefined : '2 2'} />)}</g>
                  </svg>
                </Box></Tooltip>}
                <Stack className="segment-actions" direction="row" justifyContent="center" sx={{ borderTop: '1px solid', borderColor: alpha(color, 0.16), transition: 'opacity 120ms' }}>
                  {icon(`Move ${name} left`, <ArrowBackOutlinedIcon sx={{ fontSize: 16 }} />, () => move(path, index, -1), index === 0)}
                  {icon(`Move ${name} right`, <ArrowForwardOutlinedIcon sx={{ fontSize: 16 }} />, () => move(path, index, 1), index === tokens.length - 1)}
                  {part?.template !== undefined && token.name && icon(`${expanded[[...path, token.name].join('.')] ? 'Collapse' : 'Expand'} ${name}`, <ExpandMoreIcon sx={{ fontSize: 18, transform: expanded[[...path, token.name].join('.')] ? 'rotate(180deg)' : undefined }} />, () => setExpanded(previous => ({ ...previous, [[...path, token.name!].join('.')]: !previous[[...path, token.name!].join('.')] })))}
                  {icon(`Delete ${name}`, <DeleteOutlineIcon sx={{ fontSize: 17 }} />, () => askDelete({ kind: 'delete', parentPath: path, index, nodePath: token.name ? [...path, token.name] : undefined }), false, true)}
                </Stack>
              </Box>
            </Fragment>;
          })}
          {!tokens.length && <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>Add your first segment</Typography>}
          <Box aria-hidden sx={{ width: 24, flexShrink: 0, height: 2, bgcolor: 'divider' }} />
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pr: 1 }}>3′</Typography>
          {icon(`Add segment to ${path.join(' / ')}`, <AddOutlinedIcon fontSize="small" />, () => select(path))}
        </Stack>
      </Box>
      {Object.entries(node.parts || {}).filter(([, part]) => part.template !== undefined).map(([name, part]) => {
        const fullPath = [...path, name], key = fullPath.join('.');
        return <Collapse key={name} in={!!expanded[key]}><Box sx={{ ml: { xs: 1, sm: 3 }, pl: 2, borderLeft: '2px solid', borderColor: alpha(colors.composite, 0.4), my: 1 }}>
          <Stack direction="row" alignItems="center" gap={0.75}><AccountTreeOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} /><Tooltip title={fullPath.join(' / ')}><Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: '70%' }}>{fullPath.join(' / ')}</Typography></Tooltip>{icon(`Collapse ${name}`, <ExpandMoreIcon sx={{ fontSize: 18, transform: 'rotate(180deg)' }} />, () => setExpanded(previous => ({ ...previous, [key]: false })))}</Stack>
          {renderNode(part, fullPath)}
        </Box></Collapse>;
      })}
      {Object.entries(node.parts || {}).some(([name]) => !tokens.some(token => token.name === name)) && <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ pb: 1 }}>
        <Typography variant="caption" color="text.secondary">Supporting segments</Typography>
        {Object.entries(node.parts || {}).filter(([name]) => !tokens.some(token => token.name === name)).map(([name]) => <Tooltip key={name} title={`${name} · supporting segment`}><Chip size="small" variant="outlined" sx={{ maxWidth: 180 }} label={name} color={selectionMatches(path, undefined, name) ? 'primary' : 'default'} onClick={() => select(path, undefined, name)} /></Tooltip>)}
      </Stack>}
    </Box>;
  };

  const references: string[] = [];
  walkProbes(probes, (_, path) => references.push(path));
  const selectedPath = editing?.nodePath?.join(' / ') || editing?.parentPath.join(' / ');
  const inspector = <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="subtitle1" fontWeight={600}>Selected Segment</Typography><Stack direction="row">{editing?.original && icon('Delete selected segment', <DeleteOutlineIcon fontSize="small" />, () => askDelete({ kind: 'delete', parentPath: editing.parentPath, index: editing.index, nodePath: editing.nodePath }), false, true)}{editing && icon('Close segment editor', <CloseOutlinedIcon fontSize="small" />, () => guarded({ kind: 'clear' }))}</Stack></Stack>
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
      <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{Object.keys(probes).length} {Object.keys(probes).length === 1 ? 'probe' : 'probes'} · 5′ → 3′</Typography>{icon('Add probe', <AddOutlinedIcon fontSize="small" />, () => guarded({ kind: 'addProbe' }))}</Stack>
      {error && !editing && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {!Object.keys(probes).length && <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}><Typography variant="body2">Add a probe to begin your design.</Typography></Box>}
      {Object.entries(probes).map(([name, node]) => {
        const candidate = editing?.parentPath[0] || activeProbe;
        const open = probeExpanded[name] ?? name === (probes[candidate] ? candidate : Object.keys(probes)[0]);
        let count = 0; try { count = parseTemplate(node.template || '').length; } catch { /* Preserve unsupported saved structures. */ }
        return <Box key={name} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, px: { xs: 1.5, sm: 2.5 }, py: 1.5, minWidth: 0 }}>
          <Stack direction="row" gap={1} alignItems="center">
            {icon(`${open ? 'Collapse' : 'Expand'} probe ${name}`, <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : undefined }} />, () => setProbeExpanded(previous => ({ ...previous, [name]: !open })))}
            <Tooltip title={name}><Typography variant="subtitle2" noWrap sx={{ minWidth: 0, maxWidth: '45%' }}>{name}</Typography></Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{lengthLabel(node)}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>{count} {count === 1 ? 'segment' : 'segments'}</Typography>
            <Box sx={{ ml: 'auto' }} />
            <Tooltip title={`Probe actions for ${name}`}><IconButton size="small" aria-label={`Probe actions for ${name}`} onClick={event => setMore({ anchor: event.currentTarget, path: [name] })} sx={{ color: 'text.secondary', width: 40, height: 40, '&:hover': { color: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}><MoreHorizIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
          </Stack>
          <Collapse in={open}>{renderNode(node, [name])}</Collapse>
        </Box>;
      })}
    </Stack>
    {inspectorContainer ? createPortal(inspector, inspectorContainer) : <Box sx={{ mt: 3, p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>{inspector}</Box>}
    <Menu open={!!more} anchorEl={more?.anchor} onClose={() => setMore(null)}>
      <MenuItem onClick={() => { if (!more) return; const path = more.path; setMore(null); guarded({ kind: 'renameProbe', nodePath: path }); }}><EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Rename probe</MenuItem>
      <MenuItem onClick={() => { if (!more) return; const path = more.path; setMore(null); askDelete({ kind: 'delete', nodePath: path }); }} sx={{ color: 'error.main' }}><DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Delete probe</MenuItem>
    </Menu>
    <Dialog open={!!pendingAction} onClose={() => setPendingAction(null)} maxWidth="xs" fullWidth><DialogTitle>Keep segment changes?</DialogTitle><DialogContent><Typography variant="body2">Apply your changes before continuing, or discard them.</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setPendingAction(null)}>Keep editing</Button><Button onClick={() => { const action = pendingAction; setPendingAction(null); clearSelection(); if (action) run(() => execute(action, probes)); }}>Discard & continue</Button><Button variant="contained" onClick={() => { if (pendingAction) apply(false, pendingAction); }}>Apply &amp; continue</Button></DialogActions></Dialog>
    <Dialog open={!!danger} onClose={() => setDanger(null)} maxWidth="xs" fullWidth><DialogTitle>{danger?.title}</DialogTitle><DialogContent><Typography variant="body2">{danger?.description}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setDanger(null)}>Cancel</Button><Button color="error" onClick={() => { if (!danger) return; if (danger.replacement) apply(true, danger.continuation); else if (danger.action && run(() => deleteSequence(danger.action!))) setDanger(null); }}>Confirm</Button></DialogActions></Dialog>
    <Dialog open={!!renaming} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth><DialogTitle>Rename probe</DialogTitle><DialogContent><TextField sx={{ mt: 1 }} fullWidth autoFocus label="Name" value={renaming?.name || ''} onChange={e => setRenaming(renaming && ({ ...renaming, name: e.target.value }))} />{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={() => run(() => { if (!renaming) return; const next = renameProbe(probes, renaming.path, renaming.name); if (!same(next, probes)) { onRename(renaming.path.join('.'), renaming.name); onChange(next); } setActiveProbe(renaming.name); clearSelection(); setRenaming(null); })}>Apply</Button></DialogActions></Dialog>
    <Dialog open={!!newBarcode} onClose={() => setNewBarcode(null)} maxWidth="xs" fullWidth><DialogTitle>Define barcode</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Name" value={newBarcode?.name || ''} onChange={e => setNewBarcode(newBarcode && ({ ...newBarcode, name: e.target.value }))} /><TextField label="Length (nt)" type="number" value={newBarcode?.length ?? ''} onChange={e => setNewBarcode(newBarcode && ({ ...newBarcode, length: Number(e.target.value) }))} inputProps={{ min: 1 }} /></Stack>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setNewBarcode(null)}>Cancel</Button><Button onClick={() => run(() => { if (!newBarcode || !/^[A-Za-z_]\w*$/.test(newBarcode.name) || barcodes.barcodes[newBarcode.name] || !Number.isSafeInteger(newBarcode.length) || newBarcode.length <= 0) throw new Error('Enter a unique name and a positive length.'); const entries = { ...barcodes.barcodes, [newBarcode.name]: { length: newBarcode.length } }; onBarcodes({ ...barcodes, barcodes: entries, count: Object.keys(entries).length }); patch({ barcode: newBarcode.name }); setNewBarcode(null); })}>Add barcode</Button></DialogActions></Dialog>
  </>;
}
