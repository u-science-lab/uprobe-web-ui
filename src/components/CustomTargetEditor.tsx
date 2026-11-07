import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TargetLengthEditor from './TargetLengthEditor';
import ProbeAttributesEditor from './ProbeAttributesEditor';
import { TargetConfig, rebalanceLayout, uniqueName, identifier } from '../utils/probeBuilder';
import { layoutNames, TargetLayout } from '../utils/targetLayout';
import { formatTargetLength, parseTargetLength, TargetLength } from '../utils/sampling';

interface Props {
  value: TargetConfig;
  onChange: (target: TargetConfig) => void;
  onRename: (layout: TargetLayout, before: string, after: string) => void;
  onValidity: (valid: boolean) => void;
  advancedOnly?: boolean;
}

function parseRegionLength(text: string): TargetLength {
  const parsed = text.trim().startsWith('[') ? JSON.parse(text) : Number(text);
  if (!text.trim()) throw new Error('Enter a length.');
  const bounds = Array.isArray(parsed) ? parsed : [parsed, parsed];
  if (bounds.length !== 2 || !bounds.every(n => Number.isSafeInteger(n) && n >= 0) || bounds[0] > bounds[1]) {
    throw new Error('Use a non-negative length or [minimum, maximum].');
  }
  return Array.isArray(parsed) ? [bounds[0], bounds[1]] : parsed;
}

export default function CustomTargetEditor({ value, onChange, onRename, onValidity, advancedOnly = false }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [regionText, setRegionText] = useState<Record<string, string>>({});
  const [rename, setRename] = useState<{ before: string; after: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const layout = value.layout;
  const names = layout ? layoutNames(layout) : [];
  let targetError = '';
  try { parseTargetLength(text ?? value.length); } catch { targetError = 'Enter a positive length or range.'; }
  const regionErrors: Record<string, string> = {};
  for (const [name, draft] of Object.entries(regionText)) {
    if (!layout?.parts[name]) continue;
    try { parseRegionLength(draft); } catch { regionErrors[name] = 'Use a length or [minimum, maximum].'; }
  }
  const hasInvalidDraft = !!targetError || Object.keys(regionErrors).length > 0;
  const reportValidity = (targetText: string | null, regions: Record<string, string>) => {
    let valid = true;
    try { parseTargetLength(targetText ?? value.length); } catch { valid = false; }
    for (const [name, draft] of Object.entries(regions)) {
      if (layout?.parts[name]) { try { parseRegionLength(draft); } catch { valid = false; } }
    }
    onValidity(valid);
  };
  const rebuild = (ordered: string[], parts: TargetLayout['parts']) => onChange({
    ...value,
    layout: rebalanceLayout({ template: ordered.map(name => `{${name}}`).join(''), parts }, value.length),
  });
  const moveRegion = (index: number, offset: number) => {
    if (!layout) return;
    const ordered = [...names];
    [ordered[index], ordered[index + offset]] = [ordered[index + offset], ordered[index]];
    rebuild(ordered, layout.parts);
  };

  if (advancedOnly) return <Stack spacing={2.5}>
    <TextField
      size="small" type="number" label="Step (nt)"
      value={value.step ?? 1} inputProps={{ min: 1, step: 1 }}
      error={!Number.isSafeInteger(value.step ?? 1) || (value.step ?? 1) < 1}
      helperText={!Number.isSafeInteger(value.step ?? 1) || (value.step ?? 1) < 1 ? 'Use a positive integer.' : undefined}
      sx={{ width: { xs: '100%', sm: 180 } }}
      onChange={e => {
        const step = Number(e.target.value);
        onValidity(Number.isSafeInteger(step) && step > 0);
        onChange({ ...value, step });
      }}
    />
    <Typography variant="subtitle2">Target attributes</Typography>
    <ProbeAttributesEditor
      dna={value.source === 'genome'} value={value.attributes}
      onChange={attributes => onChange({ ...value, attributes })}
    />
  </Stack>;

  return <Stack spacing={2.5} sx={{ minWidth: 0 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
      <TextField select fullWidth size="small" label="Source" value={value.source}
        onChange={e => onChange({ ...value, source: e.target.value })}>
        {[['exon', 'Exon'], ['mRNA', 'mRNA'], ['genome', 'Genome'], ['CDS', 'CDS'], ['UTR', 'UTR']].map(([key, label]) =>
          <MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
      <TextField select fullWidth size="small" label="Layout" value={layout ? 'split' : 'whole'}
        disabled={hasInvalidDraft}
        onChange={e => {
          if (e.target.value === 'whole') onChange({ ...value, layout: undefined });
          else {
            const base = Array.isArray(value.length) ? value.length[0] : value.length;
            onChange({ ...value, layout: rebalanceLayout({
              template: '{left}{right}',
              parts: { left: { length: Math.floor(base / 2) }, right: { length: 0 } },
            }, value.length) });
          }
        }}>
        <MenuItem value="whole">Whole target</MenuItem>
        <MenuItem value="split">Split target</MenuItem>
      </TextField>
      <Box sx={{ gridColumn: '1 / -1', minWidth: 0, '& .MuiTextField-root': { flex: '1 1 130px', minWidth: 0 } }}>
        <TargetLengthEditor value={text ?? formatTargetLength(value.length)} onChange={next => {
          setText(next);
          reportValidity(next, regionText);
          try {
            const length = parseTargetLength(next);
            onChange({ ...value, length, layout: layout ? rebalanceLayout(layout, length) : undefined });
          } catch { /* Keep intermediate text until the length is valid. */ }
        }} />
      </Box>
    </Box>
    {layout && <Stack spacing={1.5}>
      <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
        <Stack direction="row" spacing={0.5} aria-label="Target layout" sx={{ minWidth: 'max-content' }}>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>5′</Typography>
          {names.map(name => <Box key={name} sx={{
            minWidth: 64, flexGrow: Math.max(1, Number(Array.isArray(layout.parts[name].length) ? layout.parts[name].length[0] : layout.parts[name].length)),
            bgcolor: 'action.hover', borderBottom: '2px solid', borderColor: 'primary.main',
            borderRadius: '4px 4px 0 0', px: 1.5, py: 0.75, textAlign: 'center',
          }}><Typography variant="caption">{name}</Typography></Box>)}
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 0.5 }}>3′</Typography>
        </Stack>
      </Box>
      {names.map((name, index) => <Box key={name} sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(70px, 1fr) minmax(100px, 150px) auto' },
        alignItems: 'start', columnGap: 1, rowGap: 0.5,
        '&:hover .region-actions, &:focus-within .region-actions': { opacity: 1 },
      }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0, pt: 0.5, gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{name}</Typography>
          <Tooltip title={`Rename ${name}`}><IconButton size="small" aria-label={`Rename ${name}`}
            disabled={hasInvalidDraft} onClick={() => setRename({ before: name, after: name })}>
            <EditOutlinedIcon fontSize="inherit" />
          </IconButton></Tooltip>
        </Stack>
        <TextField size="small" label="Length (nt)" sx={{ minWidth: 0 }} value={regionText[name] ?? formatTargetLength(layout.parts[name].length)}
          error={!!regionErrors[name]} helperText={regionErrors[name] || (index === names.length - 1 ? 'Auto-balanced' : undefined)}
          onChange={e => {
            const drafts = { ...regionText, [name]: e.target.value };
            setRegionText(drafts);
            reportValidity(text, drafts);
            try {
              const length = parseRegionLength(e.target.value);
              const parts = { ...layout.parts, [name]: { ...layout.parts[name], length } };
              if (index === names.length - 1 && names.length > 1) {
                const order = [...names.slice(0, -2), name, names[names.length - 2]];
                const balanced = rebalanceLayout({ ...layout, template: order.map(n => `{${n}}`).join(''), parts }, value.length);
                onChange({ ...value, layout: { ...layout, parts: balanced.parts } });
              } else rebuild(names, parts);
              const remaining = { ...regionText }; delete remaining[name];
              setRegionText(remaining);
              reportValidity(text, remaining);
            } catch { /* Invalid draft remains visible without altering the layout. */ }
          }} />
        <Stack className="region-actions" direction="row" sx={{
          pt: 0.5, opacity: { xs: 1, md: 0.55 },
          '@media (hover: none)': { opacity: 1 },
          '& .MuiIconButton-root:hover': { color: 'primary.main' },
        }}>
          <Tooltip title={`Move ${name} left`}><span><IconButton size="small" aria-label={`Move ${name} left`}
            disabled={index === 0 || hasInvalidDraft} onClick={() => moveRegion(index, -1)}><ArrowBackOutlinedIcon fontSize="inherit" /></IconButton></span></Tooltip>
          <Tooltip title={`Move ${name} right`}><span><IconButton size="small" aria-label={`Move ${name} right`}
            disabled={index === names.length - 1 || hasInvalidDraft} onClick={() => moveRegion(index, 1)}><ArrowForwardOutlinedIcon fontSize="inherit" /></IconButton></span></Tooltip>
          <Tooltip title={`Remove ${name}`}><span><IconButton size="small" aria-label={`Remove ${name}`}
            disabled={names.length <= 2 || hasInvalidDraft} onClick={() => setRemoving(name)}><DeleteOutlineOutlinedIcon fontSize="inherit" /></IconButton></span></Tooltip>
        </Stack>
      </Box>)}
      <Tooltip title="Add region"><span style={{ alignSelf: 'flex-start' }}><IconButton size="small" aria-label="Add region"
        disabled={hasInvalidDraft} onClick={() => {
          const name = uniqueName(layout.parts, 'region');
          const last = names[names.length - 1];
          const current = layout.parts[last].length;
          const base = Array.isArray(current) ? current[0] : current;
          const parts = { ...layout.parts, [last]: { ...layout.parts[last], length: Math.floor(base / 2) }, [name]: { length: 0 } };
          rebuild([...names, name], parts);
        }}><AddOutlinedIcon fontSize="small" /></IconButton></span></Tooltip>
    </Stack>}
    {targetError && <Alert severity="error" sx={{ py: 0 }}>{targetError}</Alert>}
    <Dialog open={!!rename} onClose={() => setRename(null)} fullWidth maxWidth="xs">
      <DialogTitle>Rename region</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth size="small" label="Name" sx={{ mt: 1 }} value={rename?.after || ''}
          onChange={e => setRename(rename && { ...rename, after: e.target.value })} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRename(null)}>Cancel</Button>
        <Button disabled={!rename || !identifier.test(rename.after) || rename.before !== rename.after && names.includes(rename.after)} onClick={() => {
          if (!rename || !layout) return;
          const parts = Object.fromEntries(Object.entries(layout.parts).map(([name, part]) => [name === rename.before ? rename.after : name, part]));
          onRename({ ...layout, parts, template: names.map(name => `{${name === rename.before ? rename.after : name}}`).join('') }, rename.before, rename.after);
          setRename(null);
        }}>Apply</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={!!removing} onClose={() => setRemoving(null)} fullWidth maxWidth="xs">
      <DialogTitle>Remove region?</DialogTitle>
      <DialogContent><DialogContentText>Remove {removing} and redistribute its length across the remaining layout?</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={() => setRemoving(null)}>Cancel</Button>
        <Button color="error" onClick={() => {
          if (!layout || !removing) return;
          const parts = { ...layout.parts }; delete parts[removing];
          rebuild(names.filter(name => name !== removing), parts);
          setRemoving(null);
        }}>Remove region</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
