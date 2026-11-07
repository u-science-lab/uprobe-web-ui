import { Fragment, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Alert, Box, Button, ButtonBase, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography,
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
  TargetConfig, BarcodeConfig, SegmentForm, TemplateSegment, createProbe, createPart,
  getNode, updateNode, parseTemplate, buildTemplate, buildSegment, segmentForm,
  segmentLabel, inferLength, uniqueName, removePart, removeProbe, reorderPart,
  renameProbe, walkProbes, validateProbes,
} from '../utils/probeBuilder';

const types = [
  ['target', 'Target binding'], ['barcode', 'Barcode / Readout'],
  ['fixed', 'Fixed sequence'], ['probe', 'Probe reference'], ['composite', 'Composite segment'],
];
const colors = { target: '#4e91a0', barcode: '#8973a8', fixed: '#ac8c59', probe: '#6488ac', composite: '#5e9282', custom: '#828996' };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const structureOf = (node: ProbeConfig | undefined): unknown => node && ({ expr: node.expr, template: node.template, length: node.length, parts: node.parts && Object.fromEntries(Object.entries(node.parts).map(([name, part]) => [name, structureOf(part)])) });
interface Editing {
  parentPath: string[];
  index?: number;
  nodePath?: string[];
  original?: ProbeConfig;
  form: SegmentForm;
  initialForm: SegmentForm;
  parentTemplate?: string;
}
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
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [danger, setDanger] = useState<{ title: string; description: string; action: () => void | boolean } | null>(null);
  const [more, setMore] = useState<{ anchor: HTMLElement; path: string[] } | null>(null);
  const [advanced, setAdvanced] = useState(false);
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
  const guarded = (action: () => void) => {
    if (dirty) setPendingAction(() => action);
    else run(action);
  };
  const clearSelection = () => { setEditing(null); onSelectionChange?.(null); setAdvanced(false); setError(''); };
  const lengthLabel = (node: ProbeConfig) => {
    try { const length = inferLength(node, probes, target, barcodes); return length === undefined ? 'Length varies' : `${formatTargetLength(length)} nt`; }
    catch { return 'Length varies'; }
  };
  const patch = (values: Partial<SegmentForm>) => setEditing(current => current && ({ ...current, form: { ...current.form, ...values } }));
  const makeSelection = (parentPath: string[], index?: number, directName?: string): Editing => {
    const parent = getNode(probes, parentPath);
    let original: ProbeConfig | undefined;
    let nodePath: string[] | undefined;
    let name = uniqueName(parent.parts || {}, 'segment');
    if (directName) { name = directName; nodePath = [...parentPath, name]; original = getNode(probes, nodePath); }
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
  const select = (parentPath: string[], index?: number, directName?: string) => guarded(() => {
    const next = makeSelection(parentPath, index, directName);
    setEditing(next); onSelectionChange?.(next.original ? next.nodePath || next.parentPath : null); setAdvanced(false);
    if (next.original?.template !== undefined && next.nodePath) setExpanded(previous => ({ ...previous, [next.nodePath!.join('.')]: true }));
    inspectorContainer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const selectionMatches = (parentPath: string[], index?: number, name?: string) => !!editing && same(editing.parentPath, parentPath) && (name ? editing.nodePath?.join('.') === [...parentPath, name].join('.') : editing.index === index && !editing.nodePath);
  const namedSelected = (path: string[], index: number, name?: string) => !!editing && same(editing.parentPath, path) && editing.index === index && (name ? editing.nodePath?.join('.') === [...path, name].join('.') : !editing.nodePath);

  const apply = (replaceComposite = false): boolean => {
    if (!editing) return true;
    if (!replaceComposite && editing.original?.template !== undefined && Object.keys(editing.original.parts || {}).length && editing.form.kind !== 'composite') {
      setDanger({ title: 'Replace composite segment?', description: 'Its nested segments will be removed. Any remaining references must still be valid.', action: () => apply(true) });
      return false;
    }
    return run(() => {
      const { parentPath, index, nodePath, original, form: current } = editing;
      const parent = getNode(probes, parentPath);
      if (parent.template !== editing.parentTemplate) throw new Error('This structure changed while you were editing. Keep your values, or discard and select the segment again.');
      const latest = nodePath ? getNode(probes, nodePath) : original;
      if (nodePath && !same(structureOf(latest), structureOf(original))) throw new Error('This segment changed while you were editing. Your values are kept; discard and select the segment again before applying changes.');
      const part = buildSegment(current, latest);
      let next = probes;
      let renamed: [string, string] | undefined;
      let nextPath = nodePath;
      if (nodePath) {
        next = updateNode(next, nodePath, () => part);
        const name = nodePath[nodePath.length - 1];
        if (name !== current.name) {
          next = renameProbe(next, nodePath, current.name);
          nextPath = [...nodePath.slice(0, -1), current.name];
          renamed = [nodePath.join('.'), nextPath.join('.')];
        }
      } else if (index !== undefined) {
        if (current.kind !== 'fixed') throw new Error('This sequence is a fixed segment.');
        next = updateNode(next, parentPath, node => {
          const tokens = parseTemplate(node.template || '');
          tokens[index] = { literal: current.sequence.replace(/\s/g, '').toUpperCase() };
          return { ...node, template: buildTemplate(tokens) };
        });
      } else {
        next = updateNode(next, parentPath, node => createPart(node, current.name, part));
        nextPath = [...parentPath, current.name];
      }
      validateProbes(next, target, barcodes, true);
      if (renamed) onRename(...renamed);
      onChange(next);
      onSelectionChange?.(nextPath || parentPath);
      const nextOriginal = nextPath ? getNode(next, nextPath) : part;
      const nextForm = segmentForm(nextOriginal, nextPath ? nextPath[nextPath.length - 1] : '');
      setEditing({ parentPath, index: index ?? (original ? undefined : parseTemplate(getNode(next, parentPath).template || '').length - 1), nodePath: nextPath, original: nextOriginal, form: nextForm, initialForm: { ...nextForm }, parentTemplate: getNode(next, parentPath).template });
      if (current.kind === 'composite' && nextPath) setExpanded(previous => ({ ...previous, [nextPath!.join('.')]: true }));
      setDanger(null);
    });
  };

  const askDelete = (title: string, action: () => void) => guarded(() => setDanger({
    title,
    description: 'This removes the selected sequence from this method. Existing references are checked before it is removed.',
    action: () => { action(); clearSelection(); },
  }));
  const move = (path: string[], index: number, offset: number) => guarded(() => {
    onChange(updateNode(probes, path, node => reorderPart(node, index, offset)));
    clearSelection();
  });
  const icon = (label: string, child: ReactNode, action: () => void, disabled = false, destructive = false) => <Tooltip title={label}>
    <span><IconButton size="small" aria-label={label} disabled={disabled} onClick={action} sx={{ color: 'text.secondary', '&:hover': { color: destructive ? 'error.main' : 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>{child}</IconButton></span>
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
            const kind = part ? segmentForm(part).kind : 'custom';
            const color = colors[kind];
            const selected = namedSelected(path, index, token.name);
            const name = token.name || token.literal;
            return <Fragment key={`${index}:${token.name || 'literal'}`}>
              {index > 0 && <Box aria-hidden sx={{ width: 24, flexShrink: 0, height: 2, bgcolor: 'divider' }} />}
              <Box sx={{ flexShrink: 0, width: 154, border: '1px solid', borderColor: selected ? 'primary.main' : alpha(color, 0.5), borderRadius: 1.5, bgcolor: alpha(color, selected ? 0.17 : 0.09), boxShadow: selected ? theme => `0 0 0 1px ${theme.palette.primary.main}` : 'none', '& .segment-actions': { opacity: selected ? 1 : 0.3 }, '&:hover .segment-actions, &:focus-within .segment-actions': { opacity: 1 }, '@media (hover: none)': { '& .segment-actions': { opacity: 1 } } }}>
                <ButtonBase aria-label={`Select segment ${name}`} aria-pressed={selected} onClick={() => select(path, index)} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', px: 1.5, pt: 1.5, pb: 0.75, textAlign: 'left', borderRadius: '6px 6px 0 0', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: '100%' }}>{name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{part ? segmentLabel(part) : 'Missing segment'}</Typography>
                  <Typography variant="caption" color="text.secondary">{part ? lengthLabel(part) : '—'}</Typography>
                </ButtonBase>
                <Stack className="segment-actions" direction="row" justifyContent="center" sx={{ borderTop: '1px solid', borderColor: alpha(color, 0.16), transition: 'opacity 120ms' }}>
                  {icon(`Move ${name} left`, <ArrowBackOutlinedIcon sx={{ fontSize: 16 }} />, () => move(path, index, -1), index === 0)}
                  {icon(`Move ${name} right`, <ArrowForwardOutlinedIcon sx={{ fontSize: 16 }} />, () => move(path, index, 1), index === tokens.length - 1)}
                  {part?.template !== undefined && token.name && icon(`${expanded[[...path, token.name].join('.')] ? 'Collapse' : 'Expand'} ${name}`, <ExpandMoreIcon sx={{ fontSize: 18, transform: expanded[[...path, token.name].join('.')] ? 'rotate(180deg)' : undefined }} />, () => setExpanded(previous => ({ ...previous, [[...path, token.name!].join('.')]: !previous[[...path, token.name!].join('.')] })))}
                  {icon(`Delete ${name}`, <DeleteOutlineIcon sx={{ fontSize: 17 }} />, () => askDelete(`Delete ${name}?`, () => onChange(removePart(probes, path, index))), false, true)}
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
          <Stack direction="row" alignItems="center" gap={0.75}><AccountTreeOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} /><Typography variant="caption" fontWeight={600}>{fullPath.join(' / ')}</Typography>{icon(`Collapse ${name}`, <ExpandMoreIcon sx={{ fontSize: 18, transform: 'rotate(180deg)' }} />, () => setExpanded(previous => ({ ...previous, [key]: false })))}</Stack>
          {renderNode(part, fullPath)}
        </Box></Collapse>;
      })}
      {Object.entries(node.parts || {}).some(([name]) => !tokens.some(token => token.name === name)) && <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ pb: 1 }}>
        <Typography variant="caption" color="text.secondary">Supporting segments</Typography>
        {Object.entries(node.parts || {}).filter(([name]) => !tokens.some(token => token.name === name)).map(([name]) => <Chip key={name} size="small" variant="outlined" label={name} color={selectionMatches(path, undefined, name) ? 'primary' : 'default'} onClick={() => select(path, undefined, name)} />)}
      </Stack>}
    </Box>;
  };

  const references: string[] = [];
  walkProbes(probes, (_, path) => references.push(path));
  const selectedPath = editing?.nodePath?.join(' / ') || editing?.parentPath.join(' / ');
  const inspector = <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="subtitle1" fontWeight={600}>Selected Segment</Typography><Stack direction="row">{editing?.original && icon('Delete selected segment', <DeleteOutlineIcon fontSize="small" />, () => askDelete('Delete selected segment?', () => { if (editing.index !== undefined) onChange(removePart(probes, editing.parentPath, editing.index)); else if (editing.nodePath) onChange(removeProbe(probes, editing.nodePath)); }), false, true)}{editing && icon('Close segment editor', <CloseOutlinedIcon fontSize="small" />, () => guarded(clearSelection))}</Stack></Stack>
    {!editing ? <Box sx={{ py: 4, px: 2, textAlign: 'center', color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}><AccountTreeOutlinedIcon sx={{ fontSize: 28, mb: 1, opacity: 0.7 }} /><Typography variant="body2">Select a segment on the canvas to edit it.</Typography></Box> : <>
      <Stack direction="row" gap={1} alignItems="center"><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{selectedPath}{!editing.original ? ' / New segment' : ''}</Typography>{dirty && <Chip size="small" label="Unsaved" variant="outlined" sx={{ height: 22 }} />}</Stack>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {!literal && <TextField size="small" label="Segment name" value={form!.name} onChange={e => patch({ name: e.target.value })} />}
      <TextField select size="small" label="Type" value={form!.kind} disabled={literal} onChange={e => patch({ kind: e.target.value as SegmentForm['kind'], start: '', length: '' })}>{types.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}{form!.kind === 'custom' && <MenuItem value="custom">Saved segment</MenuItem>}</TextField>
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
      <Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="small" disabled={same(form, editing.initialForm)} onClick={() => setEditing(current => current && ({ ...current, form: { ...current.initialForm } }))}>Reset</Button><Button size="small" variant="contained" onClick={() => apply()}>Apply segment</Button></Stack>
    </>}
  </Stack>;

  return <>
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{Object.keys(probes).length} {Object.keys(probes).length === 1 ? 'probe' : 'probes'} · 5′ → 3′</Typography>{icon('Add probe', <AddOutlinedIcon fontSize="small" />, () => guarded(() => { onChange({ ...probes, [uniqueName(probes, 'probe_')]: createProbe() }); clearSelection(); }))}</Stack>
      {error && !editing && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {!Object.keys(probes).length && <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}><Typography variant="body2">Add a probe to begin your design.</Typography></Box>}
      {Object.entries(probes).map(([name, node]) => <Box key={name} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, px: { xs: 1.5, sm: 2.5 }, py: 1.5, minWidth: 0 }}>
        <Stack direction="row" gap={1} alignItems="center"><Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>{name}</Typography><Typography variant="caption" color="text.secondary">{lengthLabel(node)}</Typography><Box sx={{ ml: 'auto' }} /><Tooltip title={`Probe actions for ${name}`}><IconButton size="small" aria-label={`Probe actions for ${name}`} onClick={event => setMore({ anchor: event.currentTarget, path: [name] })} sx={{ color: 'text.secondary' }}><MoreHorizIcon fontSize="small" /></IconButton></Tooltip></Stack>
        {renderNode(node, [name])}
      </Box>)}
    </Stack>
    {inspectorContainer ? createPortal(inspector, inspectorContainer) : <Box sx={{ mt: 3, p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>{inspector}</Box>}
    <Menu open={!!more} anchorEl={more?.anchor} onClose={() => setMore(null)}>
      <MenuItem onClick={() => { if (!more) return; const path = more.path; setMore(null); guarded(() => setRenaming({ path, name: path[path.length - 1] })); }}><EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} />Rename probe</MenuItem>
      <MenuItem onClick={() => { if (!more) return; const path = more.path; setMore(null); askDelete(`Delete ${path.join(' / ')}?`, () => onChange(removeProbe(probes, path))); }} sx={{ color: 'error.main' }}><DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Delete probe</MenuItem>
    </Menu>
    <Dialog open={!!pendingAction} onClose={() => setPendingAction(null)} maxWidth="xs" fullWidth><DialogTitle>Keep segment changes?</DialogTitle><DialogContent><Typography variant="body2">Apply your changes before continuing, or discard them.</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setPendingAction(null)}>Keep editing</Button><Button onClick={() => { const action = pendingAction; setPendingAction(null); setEditing(null); if (action) run(action); }}>Discard & continue</Button><Button variant="contained" onClick={() => { if (apply()) setPendingAction(null); }}>Apply changes</Button></DialogActions></Dialog>
    <Dialog open={!!danger} onClose={() => setDanger(null)} maxWidth="xs" fullWidth><DialogTitle>{danger?.title}</DialogTitle><DialogContent><Typography variant="body2">{danger?.description}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setDanger(null)}>Cancel</Button><Button color="error" onClick={() => { if (danger && run(danger.action)) setDanger(null); }}>Confirm</Button></DialogActions></Dialog>
    <Dialog open={!!renaming} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth><DialogTitle>Rename probe</DialogTitle><DialogContent><TextField sx={{ mt: 1 }} fullWidth autoFocus label="Name" value={renaming?.name || ''} onChange={e => setRenaming(renaming && ({ ...renaming, name: e.target.value }))} />{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={() => run(() => { if (!renaming) return; const next = renameProbe(probes, renaming.path, renaming.name); onRename(renaming.path.join('.'), renaming.name); onChange(next); clearSelection(); setRenaming(null); })}>Apply</Button></DialogActions></Dialog>
    <Dialog open={!!newBarcode} onClose={() => setNewBarcode(null)} maxWidth="xs" fullWidth><DialogTitle>Define barcode</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Name" value={newBarcode?.name || ''} onChange={e => setNewBarcode(newBarcode && ({ ...newBarcode, name: e.target.value }))} /><TextField label="Length (nt)" type="number" value={newBarcode?.length ?? ''} onChange={e => setNewBarcode(newBarcode && ({ ...newBarcode, length: Number(e.target.value) }))} inputProps={{ min: 1 }} /></Stack>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setNewBarcode(null)}>Cancel</Button><Button onClick={() => run(() => { if (!newBarcode || !/^[A-Za-z_]\w*$/.test(newBarcode.name) || barcodes.barcodes[newBarcode.name] || !Number.isSafeInteger(newBarcode.length) || newBarcode.length <= 0) throw new Error('Enter a unique name and a positive length.'); const entries = { ...barcodes.barcodes, [newBarcode.name]: { length: newBarcode.length } }; onBarcodes({ ...barcodes, barcodes: entries, count: Object.keys(entries).length }); patch({ barcode: newBarcode.name }); setNewBarcode(null); })}>Add barcode</Button></DialogActions></Dialog>
  </>;
}
