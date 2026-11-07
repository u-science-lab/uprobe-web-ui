import { useState } from 'react';
import { Box, Button, Stack, TextField, MenuItem, Accordion, AccordionSummary, AccordionDetails, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TargetLengthEditor from './TargetLengthEditor';
import ProbeAttributesEditor from './ProbeAttributesEditor';
import { TargetConfig, rebalanceLayout, uniqueName, identifier } from '../utils/probeBuilder';
import { layoutNames, TargetLayout } from '../utils/targetLayout';
import { formatTargetLength, parseTargetLength } from '../utils/sampling';

export default function CustomTargetEditor({ value, onChange, onRename, onValidity }: { value: TargetConfig; onChange: (target: TargetConfig) => void; onRename: (layout: TargetLayout, before: string, after: string) => void; onValidity: (valid: boolean) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [rename, setRename] = useState<{ before: string; after: string } | null>(null);
  const [regionText, setRegionText] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const layout = value.layout;
  const names = layout ? layoutNames(layout) : [];
  const rebuild = (ordered: string[], parts: TargetLayout['parts']) => onChange({ ...value, layout: rebalanceLayout({ template: ordered.map(name => `{${name}}`).join(''), parts }, value.length) });
  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} flexWrap="wrap">
      <TextField select size="small" label="Source" value={value.source} sx={{ minWidth: 150 }} onChange={e => onChange({ ...value, source: e.target.value })}>{[['exon','Exon'],['mRNA','mRNA'],['genome','Genome'],['CDS','CDS'],['UTR','UTR']].map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
      <TargetLengthEditor value={text ?? formatTargetLength(value.length)} onChange={next => {
        setText(next);
        try { const length = parseTargetLength(next); onChange({ ...value, length, layout: layout ? rebalanceLayout(layout, length) : undefined }); setError(''); onValidity(true); } catch { setError('Enter a valid target length.'); onValidity(false); }
      }} />
      <TextField select size="small" label="Layout" value={layout ? 'split' : 'whole'} sx={{ minWidth: 160 }} onChange={e => {
        if (e.target.value === 'whole') onChange({ ...value, layout: undefined });
        else { const base = Array.isArray(value.length) ? value.length[0] : value.length; onChange({ ...value, layout: rebalanceLayout({ template: '{left}{right}', parts: { left: { length: Math.floor(base / 2) }, right: { length: 0 } } }, value.length) }); }
      }}><MenuItem value="whole">Whole target</MenuItem><MenuItem value="split">Split target</MenuItem></TextField>
    </Stack>
    {layout && <Box>
      <Stack direction="row" spacing={0.5} sx={{ mb: 2 }} aria-label="Target layout">{names.map(name => <Box key={name} sx={{ flex: Math.max(1, Number(Array.isArray(layout.parts[name].length) ? layout.parts[name].length[0] : layout.parts[name].length)), minWidth: 60, bgcolor: 'action.hover', borderBottom: '2px solid', borderColor: 'primary.main', px: 1, py: 0.75, textAlign: 'center' }}><Typography variant="body2">{name}</Typography></Box>)}</Stack>
      <Stack spacing={1}>
        {names.map((name, index) => <Stack key={name} direction="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button sx={{ textTransform: 'none', minWidth: 90 }} onClick={() => setRename({ before: name, after: name })}>{name}</Button>
          <TextField size="small" label="Length (nt)" sx={{ width: 180 }} value={regionText[name] ?? formatTargetLength(layout.parts[name].length)} helperText={index === names.length - 1 ? 'Adjusted automatically' : undefined} onChange={e => {
            setRegionText({ ...regionText, [name]: e.target.value });
            try { const length = e.target.value === '0' ? 0 : parseTargetLength(e.target.value); const parts = { ...layout.parts, [name]: { ...layout.parts[name], length } };
              if (index === names.length - 1) {
                // Editing the final region transfers the difference to its predecessor.
                const order = [...names.slice(0, -2), name, names[names.length - 2]];
                const balanced = rebalanceLayout({ ...layout, template: order.map(n => `{${n}}`).join(''), parts }, value.length);
                onChange({ ...value, layout: { ...layout, parts: balanced.parts } });
              } else rebuild(names, parts);
              setRegionText({}); setError(''); onValidity(true);
            } catch { setError('Enter a valid region length or range.'); onValidity(false); }
          }} />
          <Button size="small" aria-label={`Move ${name} left`} disabled={index === 0} onClick={() => { const ordered = [...names]; [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]]; rebuild(ordered, layout.parts); }}>←</Button>
          <Button size="small" disabled={names.length <= 2} onClick={() => { const parts = { ...layout.parts }; delete parts[name]; rebuild(names.filter(n => n !== name), parts); }}>Remove</Button>
        </Stack>)}
        <Button sx={{ alignSelf: 'flex-start' }} onClick={() => { const name = uniqueName(layout.parts, 'region'); const last = names[names.length - 1]; const current = layout.parts[last].length; const base = Array.isArray(current) ? current[0] : current; const parts = { ...layout.parts, [last]: { ...layout.parts[last], length: Math.floor(base / 2) }, [name]: { length: 0 } }; rebuild([...names, name], parts); }}>+ Add region</Button>
      </Stack>
    </Box>}
    {error && <Typography color="error" variant="body2">{error}</Typography>}
    <Accordion disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: { xs: 2, sm: 3 } }}><Typography variant="body2">Advanced</Typography></AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 2, sm: 3 }, pt: 1, pb: 3 }}><Stack spacing={3}>
        <TextField size="small" type="number" label="Step (nt)" value={value.step ?? 1} inputProps={{ min: 1 }} sx={{ width: 180 }} onChange={e => onChange({ ...value, step: Number(e.target.value) })} />
        <Typography variant="body2" fontWeight={600}>Target attributes</Typography>
        <ProbeAttributesEditor dna={value.source === 'genome'} value={value.attributes} onChange={attributes => onChange({ ...value, attributes })} />
      </Stack></AccordionDetails>
    </Accordion>
    <Dialog open={!!rename} onClose={() => setRename(null)}><DialogTitle>Rename region</DialogTitle><DialogContent><TextField autoFocus label="Name" sx={{ mt: 1 }} value={rename?.after || ''} onChange={e => setRename(rename && { ...rename, after: e.target.value })} /></DialogContent><DialogActions><Button onClick={() => setRename(null)}>Cancel</Button><Button disabled={!rename || !identifier.test(rename.after) || rename.before !== rename.after && names.includes(rename.after)} onClick={() => {
      if (!rename || !layout) return;
      const parts = Object.fromEntries(Object.entries(layout.parts).map(([name, part]) => [name === rename.before ? rename.after : name, part]));
      onRename({ ...layout, parts, template: names.map(name => `{${name === rename.before ? rename.after : name}}`).join('') }, rename.before, rename.after); setRename(null);
    }}>Apply</Button></DialogActions></Dialog>
  </Stack>;
}
