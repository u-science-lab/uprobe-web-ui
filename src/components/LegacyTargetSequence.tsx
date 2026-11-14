import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import RefreshIcon from '@mui/icons-material/Refresh';
import TuneIcon from '@mui/icons-material/Tune';
import CustomTargetEditor from './CustomTargetEditor';
import ProbeAttributesEditor from './ProbeAttributesEditor';
import AttributeChips from './AttributeChips';
import { TargetConfig, rebalanceLayout } from '../utils/probeBuilder';
import { formatTargetLength, parseTargetLength } from '../utils/sampling';
import type { TargetLayout } from '../utils/targetLayout';

interface Props {
  value: TargetConfig;
  preview: string;
  onRegenerate: () => void;
  onChange: (target: TargetConfig) => void;
  onRename: (layout: TargetLayout, before: string, after: string) => void;
  onValidity: (valid: boolean) => void;
}

export default function LegacyTargetSequence({ value, preview, onRegenerate, onChange, onRename, onValidity }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'attributes' | 'layout' | null>(null);
  return <Stack spacing={2.5}>
    <Stack direction="row" alignItems="center" spacing={1}><ScienceIcon color="primary" /><Typography variant="h5" fontWeight={600}>Target Sequence</Typography></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(150px, 1fr) minmax(150px, 1fr) auto' }, gap: 2 }}>
      <TextField select size="small" label="Source Type" value={value.source} onChange={event => onChange({ ...value, source: event.target.value })}>
        {[['exon', 'Exon'], ['mRNA', 'mRNA'], ['genome', 'Genome'], ['CDS', 'CDS'], ['UTR', 'UTR']].map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
      <TextField size="small" label="Sequence Length" value={text ?? formatTargetLength(value.length)} error={!!error} helperText={error || undefined} onChange={event => {
        setText(event.target.value);
        try {
          const length = parseTargetLength(event.target.value);
          onChange({ ...value, length, layout: value.layout ? rebalanceLayout(value.layout, length) : undefined });
          setError(''); onValidity(true);
        } catch (reason) { setError((reason as Error).message); onValidity(false); }
      }} />
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRegenerate} disabled={!!error}>Regenerate</Button>
        <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setDialog('attributes')}>Attributes</Button>
      </Stack>
    </Box>
    <Box>
      <Typography variant="subtitle2" gutterBottom>Target Sequence ({formatTargetLength(value.length)} nt):</Typography>
      <Box sx={{ p: 2, minHeight: 60, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, fontFamily: 'monospace', letterSpacing: '0.08em', overflowWrap: 'anywhere' }} data-testid="target-sequence-preview">{preview}</Box>
      <Typography variant="caption" color="text.secondary">Example preview only. Actual target sequences are supplied in Design Workflow.</Typography>
    </Box>
    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" justifyContent="space-between">
      <AttributeChips value={value.attributes} onEdit={() => setDialog('attributes')} />
      <Button size="small" onClick={() => setDialog('layout')}>Layout &amp; sampling</Button>
    </Stack>
    <Dialog open={dialog !== null} onClose={() => setDialog(null)} fullWidth maxWidth="md">
      <DialogTitle>{dialog === 'attributes' ? 'Target Attributes' : 'Target Layout & Sampling'}</DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>{dialog === 'attributes'
        ? <ProbeAttributesEditor dna={value.source === 'genome'} value={value.attributes} onChange={attributes => onChange({ ...value, attributes })} />
        : <Stack spacing={3}><CustomTargetEditor value={value} onChange={onChange} onRename={onRename} onValidity={onValidity} /><CustomTargetEditor advancedOnly value={value} onChange={onChange} onRename={onRename} onValidity={onValidity} /></Stack>}
      </DialogContent>
      <DialogActions><Button onClick={() => setDialog(null)}>Done</Button></DialogActions>
    </Dialog>
  </Stack>;
}
