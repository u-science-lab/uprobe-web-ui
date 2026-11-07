import { useState } from 'react';
import { Box, Button, Chip, Stack, TextField, MenuItem, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Accordion, AccordionSummary, AccordionDetails, Alert } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { ProbeConfig, ProbesConfig } from '../types';
import { formatTargetLength } from '../utils/sampling';
import { TargetConfig, BarcodeConfig, SegmentForm, createProbe, createPart, getNode, updateNode, parseTemplate, buildTemplate, buildSegment, segmentForm, segmentLabel, inferLength, uniqueName, removePart, removeProbe, reorderPart, renameProbe, walkProbes, validateProbes } from '../utils/probeBuilder';

const types = [['target','Target binding'],['barcode','Barcode / Readout'],['fixed','Fixed sequence'],['probe','Probe reference'],['composite','Composite segment']];
interface Editing { path: string[]; index?: number; form: SegmentForm; original?: ProbeConfig }
export default function ProbeStructureEditor({ probes, onChange, target, barcodes, onBarcodes, onRename }: { probes: ProbesConfig; onChange: (probes: ProbesConfig) => void; target: TargetConfig; barcodes: BarcodeConfig; onBarcodes: (barcodes: BarcodeConfig) => void; onRename: (before: string, after: string) => void }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [renaming, setRenaming] = useState<{ path: string[]; name: string } | null>(null);
  const [newBarcode, setNewBarcode] = useState<{ name: string; length: number } | null>(null);
  const [error, setError] = useState('');
  const run = (action: () => void) => { try { action(); setError(''); } catch (e) { setError((e as Error).message); } };
  const lengthLabel = (node: ProbeConfig) => { try { const length = inferLength(node, probes, target, barcodes); return length === undefined ? '' : `${formatTargetLength(length)} nt`; } catch { return ''; } };
  const patch = (values: Partial<SegmentForm>) => setEditing(current => current && { ...current, form: { ...current.form, ...values } });
  const open = (path: string[], index?: number) => run(() => {
    const parent = getNode(probes, path);
    if (index === undefined) setEditing({ path, form: { ...segmentForm({ expr: 'rc(target_region)' }), name: uniqueName(parent.parts || {}, 'segment') } });
    else {
      const token = parseTemplate(parent.template || '')[index];
      const original = token.name !== undefined ? parent.parts![token.name] : { expr: `'${token.literal}'` };
      setEditing({ path, index, original, form: segmentForm(original, token.name || '') });
    }
  });
  const renderNode = (node: ProbeConfig, path: string[]): React.ReactNode => {
    if (node.template === undefined) return <Button variant="outlined" onClick={() => setEditing({ path: path.slice(0, -1), original: node, form: segmentForm(node, path[path.length - 1]) })}>{segmentLabel(node)} {lengthLabel(node)}</Button>;
    let tokens;
    try { tokens = parseTemplate(node.template); } catch { return <Alert severity="warning">This saved structure is preserved. Its segment placeholders cannot be edited here.</Alert>; }
    return <Box>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ py: 2 }}>
        <Typography color="text.secondary" variant="body2">5′</Typography>
        {tokens.map((token, index) => {
          const part = token.name !== undefined ? node.parts?.[token.name] : { expr: `'${token.literal}'`, length: token.literal.length };
          return <Stack key={index} alignItems="center" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, minWidth: 100 }}>
            <Button sx={{ textTransform: 'none', display: 'flex', flexDirection: 'column', px: 2 }} onClick={() => open(path, index)}>
              <Typography variant="body2" fontWeight={600}>{token.name || token.literal}</Typography>
              <Typography variant="caption" color="text.secondary">{part ? segmentLabel(part) : 'Missing segment'}</Typography>
              <Typography variant="caption" color="text.secondary">{part && lengthLabel(part)}</Typography>
            </Button>
            <Stack direction="row"><Button size="small" sx={{ minWidth: 30 }} aria-label={`Move ${token.name || 'sequence'} left`} disabled={index === 0} onClick={() => run(() => onChange(updateNode(probes, path, n => reorderPart(n, index, -1))))}>←</Button><Button size="small" sx={{ minWidth: 30 }} aria-label={`Move ${token.name || 'sequence'} right`} disabled={index === tokens.length - 1} onClick={() => run(() => onChange(updateNode(probes, path, n => reorderPart(n, index, 1))))}>→</Button><Button size="small" sx={{ minWidth: 30 }} aria-label={`Remove ${token.name || 'sequence'}`} onClick={() => run(() => onChange(removePart(probes, path, index)))}>×</Button></Stack>
          </Stack>;
        })}
        <Typography color="text.secondary" variant="body2">3′</Typography>
        <Button size="small" onClick={() => open(path)}>+ Add segment</Button>
      </Stack>
      {Object.entries(node.parts || {}).filter(([, part]) => part.template !== undefined).map(([name, part]) => <Accordion key={name} disableGutters elevation={0} sx={{ borderLeft: '2px solid', borderColor: 'divider', pl: 2, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">{name} · Composite</Typography></AccordionSummary>
        <AccordionDetails sx={{ px: 0 }}>{renderNode(part, [...path, name])}</AccordionDetails>
      </Accordion>)}
      {Object.entries(node.parts || {}).filter(([name]) => !tokens.some(token => token.name === name)).map(([name, part]) => <Stack key={name} direction="row" alignItems="center" gap={1}><Chip size="small" label={`${name} · supporting segment`} onClick={() => setEditing({ path, original: part, form: segmentForm(part, name) })} /><Button size="small" onClick={() => run(() => onChange(removeProbe(probes, [...path, name])))}>Remove</Button></Stack>)}
    </Box>;
  };
  const references: string[] = []; walkProbes(probes, (_, path) => references.push(path));
  const form = editing?.form;
  return <Stack spacing={2}>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    {Object.entries(probes).map(([name, node]) => <Box key={name} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Typography fontWeight={600}>{name}</Typography><Typography variant="caption" color="text.secondary">{lengthLabel(node)}</Typography>
        <Button size="small" onClick={() => setRenaming({ path: [name], name })}>Rename</Button>
        <Button size="small" sx={{ ml: 'auto' }} onClick={() => run(() => onChange(removeProbe(probes, [name])))}>Remove probe</Button>
      </Stack>
      {renderNode(node, [name])}
    </Box>)}
    <Button sx={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...probes, [uniqueName(probes, 'probe_')]: createProbe() })}>+ Add Probe</Button>
    <Dialog open={!!editing} onClose={() => { setEditing(null); setError(''); }} fullWidth maxWidth="sm">
      <DialogTitle>{editing?.original ? 'Edit segment' : 'Add segment'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {form && <>
          {!(editing?.index !== undefined && parseTemplate(getNode(probes, editing.path).template || '')[editing.index]?.literal !== undefined) && <TextField size="small" label="Segment name" value={form.name} onChange={e => patch({ name: e.target.value })} />}
          <TextField select size="small" label="Type" value={form.kind} onChange={e => patch({ kind: e.target.value as SegmentForm['kind'], start: '', length: '' })}>{types.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}{form.kind === 'custom' && <MenuItem value="custom">Saved segment</MenuItem>}</TextField>
          {form.kind === 'custom' && <Typography variant="body2" color="text.secondary">The saved sequence rule is retained.</Typography>}
          {form.kind === 'target' && <TextField select size="small" label="Region" value={form.region} onChange={e => patch({ region: e.target.value, length: '', start: '' })}><MenuItem value="">Whole target</MenuItem>{Object.keys(target.layout?.parts || {}).map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}{form.region && !target.layout?.parts[form.region] && <MenuItem value={form.region}>{form.region} (removed)</MenuItem>}</TextField>}
          {form.kind === 'barcode' && <><TextField select size="small" label="Barcode" value={form.barcode} onChange={e => patch({ barcode: e.target.value })}><MenuItem value="">Choose barcode</MenuItem>{Object.entries(barcodes.barcodes).map(([name, item]) => <MenuItem key={name} value={name}>{name} · {item.length ?? barcodes.default_length ?? '?'} nt</MenuItem>)}</TextField><Button sx={{ alignSelf: 'flex-start' }} onClick={() => setNewBarcode({ name: uniqueName(barcodes.barcodes, 'BC'), length: barcodes.default_length ?? 12 })}>+ Define barcode</Button></>}
          {form.kind === 'fixed' && <TextField size="small" label="Sequence" value={form.sequence} onChange={e => patch({ sequence: e.target.value })} helperText={`${form.sequence.replace(/\s/g, '').length} nt`} />}
          {form.kind === 'probe' && <TextField select size="small" label="Probe / Region" value={form.reference} onChange={e => patch({ reference: e.target.value })}><MenuItem value="">Choose sequence</MenuItem>{references.map(path => <MenuItem key={path} value={path}>{path.replace(/\./g, ' / ')}{!path.includes('.') ? ' · Entire probe' : ''}</MenuItem>)}</TextField>}
          {['target','barcode','probe'].includes(form.kind) && <TextField select size="small" label="Orientation" value={form.reverse ? 'reverse' : 'forward'} onChange={e => patch({ reverse: e.target.value === 'reverse' })}><MenuItem value="forward">Forward</MenuItem><MenuItem value="reverse">Reverse complement</MenuItem></TextField>}
          {form.kind === 'target' && <TextField size="small" label="Length (nt)" type="number" value={form.length} placeholder="Entire region" onChange={e => patch({ length: e.target.value })} inputProps={{ min: 1 }} />}
          {['target','probe'].includes(form.kind) && <Accordion disableGutters elevation={0}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Advanced</Typography></AccordionSummary><AccordionDetails><Stack direction="row" spacing={2}><TextField size="small" label="Start (1-based)" type="number" value={form.start} placeholder="1" onChange={e => patch({ start: e.target.value })} inputProps={{ min: 1 }} />{form.kind === 'probe' && <TextField size="small" label="Length (nt)" type="number" value={form.length} placeholder="Entire region" onChange={e => patch({ length: e.target.value })} inputProps={{ min: 1 }} />}</Stack></AccordionDetails></Accordion>}
        </>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => { setEditing(null); setError(''); }}>Cancel</Button><Button variant="contained" onClick={() => run(() => {
        if (!editing) return;
        const { path, index, original, form: current } = editing;
        const part = buildSegment(current, original);
        let next = probes;
        let renamed: [string, string] | undefined;
        if (index !== undefined) {
          const token = parseTemplate(getNode(probes, path).template || '')[index];
          if (token.name !== undefined) {
            const full = [...path, token.name];
            next = updateNode(next, full, () => part);
            if (token.name !== current.name) { next = renameProbe(next, full, current.name); renamed = [full.join('.'), [...path, current.name].join('.')]; }
          } else {
            if (current.kind !== 'fixed') throw new Error('Choose Fixed sequence to edit this sequence.');
            next = updateNode(next, path, parent => { const tokens = parseTemplate(parent.template || ''); tokens[index] = { literal: current.sequence.replace(/\s/g, '').toUpperCase() }; return { ...parent, template: buildTemplate(tokens) }; });
          }
        } else if (original) {
          // Root expression nodes and supporting parts retain their canonical location.
          const originalPath = references.find(ref => getNode(probes, ref.split('.')) === original)?.split('.');
          if (!originalPath) throw new Error('Sequence no longer exists.');
          next = updateNode(next, originalPath, () => part);
          if (current.name !== originalPath[originalPath.length - 1]) { next = renameProbe(next, originalPath, current.name); renamed = [originalPath.join('.'), [...originalPath.slice(0, -1), current.name].join('.')]; }
        } else next = updateNode(next, path, parent => createPart(parent, current.name, part));
        // Other unfinished probes may be empty while editing; cycles are checked again at save.
        validateProbes(next, target, barcodes, true);
        if (renamed) onRename(...renamed);
        onChange(next); setEditing(null);
      })}>Apply</Button></DialogActions>
    </Dialog>
    <Dialog open={!!renaming} onClose={() => setRenaming(null)}><DialogTitle>Rename probe</DialogTitle><DialogContent><TextField sx={{ mt: 1 }} autoFocus label="Name" value={renaming?.name || ''} onChange={e => setRenaming(renaming && { ...renaming, name: e.target.value })} />{error && <Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={() => run(() => { if (!renaming) return; const next = renameProbe(probes, renaming.path, renaming.name); onRename(renaming.path.join('.'), renaming.name); onChange(next); setRenaming(null); })}>Apply</Button></DialogActions></Dialog>
    <Dialog open={!!newBarcode} onClose={() => setNewBarcode(null)}><DialogTitle>Define barcode</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Name" value={newBarcode?.name || ''} onChange={e => setNewBarcode(newBarcode && { ...newBarcode, name: e.target.value })} /><TextField label="Length (nt)" type="number" value={newBarcode?.length ?? ''} onChange={e => setNewBarcode(newBarcode && { ...newBarcode, length: Number(e.target.value) })} /></Stack>{error && <Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button onClick={() => setNewBarcode(null)}>Cancel</Button><Button onClick={() => run(() => { if (!newBarcode || !/^[A-Za-z_]\w*$/.test(newBarcode.name) || barcodes.barcodes[newBarcode.name] || !Number.isSafeInteger(newBarcode.length) || newBarcode.length <= 0) throw new Error('Enter a unique name and a positive length.'); const entries = { ...barcodes.barcodes, [newBarcode.name]: { length: newBarcode.length } }; onBarcodes({ ...barcodes, barcodes: entries, count: Object.keys(entries).length }); patch({ barcode: newBarcode.name }); setNewBarcode(null); })}>Add</Button></DialogActions></Dialog>
  </Stack>;
}
