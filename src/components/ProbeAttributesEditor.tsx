import { useState } from 'react';
import { Box, Button, IconButton, MenuItem, Stack, TextField, FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';
import { alpha, Theme } from '@mui/material/styles';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { attributeType } from '../utils/probeConfig';

const destructiveActionSx = {
  minWidth: 40,
  minHeight: 40,
  borderRadius: 1,
  color: 'error.main',
  '&:hover': { color: 'error.main', bgcolor: (theme: Theme) => alpha(theme.palette.error.main, 0.1) },
  '&.Mui-focusVisible': {
    color: 'error.main', bgcolor: (theme: Theme) => alpha(theme.palette.error.main, 0.1),
    outline: '2px solid', outlineColor: 'error.main', outlineOffset: 2,
  },
  '&.Mui-disabled': { color: 'action.disabled' },
};

const choices: Record<string, string> = { length: 'Length', gc_content: 'GC content', fold_score: 'Fold score', tm: 'Melting temperature', self_match: 'Self match', mapped_genes: 'Mapped genes', kmer_count: 'K-mer count', mapped_sites: 'Mapped sites' };
const defaults: Record<string, any> = { gc_content: { min: 40, max: 60 }, tm: { min: 60, max: 75 }, fold_score: { max: 40 }, self_match: { max: 4 }, mapped_genes: { max: 5, aligner: 'bowtie2', min_mapq: 30 }, mapped_sites: { aligner: 'bowtie2', min_mapq: 30 }, kmer_count: { kmer_len: 35, aligner: 'jellyfish', threads: 10, size: '1G' } };
export default function ProbeAttributesEditor({ value = {}, onChange, dna }: { value?: Record<string, any>; onChange: (value: Record<string, any>) => void; dna: boolean }) {
  const [selected, setSelected] = useState('gc_content');
  const update = (name: string, patch: any, bounds = false) => {
    const next = { ...value[name], ...patch };
    if (bounds) delete next.filterExpression;
    onChange({ ...value, [name]: next });
  };
  return <Stack spacing={2}>
    {Object.entries(value).filter(([, attr]) => attr.enabled !== false).map(([name, attr]) => {
      const type = attr.originalType || attributeType(name);
      const label = choices[name] || Object.keys(choices).find(key => attributeType(key) === type) && choices[Object.keys(choices).find(key => attributeType(key) === type)!] || name;
      return <Box key={name}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="body2" fontWeight={600}>{label}</Typography>
          <Tooltip title={`Remove ${label}`}>
            <IconButton
              size="small"
              aria-label={`Remove ${label}`}
              onClick={() => update(name, { enabled: false })}
              sx={destructiveActionSx}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <FormControlLabel label="Filter" control={<Switch size="small" checked={attr.filterEnabled !== false} onChange={(_, checked) => update(name, { filterEnabled: checked })} />} />
          {attr.filterEnabled !== false && ['min','max'].map(bound => <TextField key={bound} size="small" type="number" label={bound === 'min' ? 'Minimum' : 'Maximum'} sx={{ width: 135 }} value={attr[bound] ?? ''} onChange={e => update(name, { [bound]: e.target.value === '' ? undefined : Number(e.target.value) }, true)} />)}
          {['mapped_genes','mapped_sites','kmer_count'].includes(type) && <TextField select size="small" label="Aligner" sx={{ width: 150 }} value={(attr.aligner || (type === 'kmer_count' ? 'jellyfish' : 'bowtie2')).toLowerCase()} onChange={e => update(name, { aligner: e.target.value })}>
            {(type === 'kmer_count' ? ['jellyfish'] : ['bowtie2','blast','mmseqs2']).map(aligner => <MenuItem key={aligner} value={aligner}>{aligner === 'bowtie2' ? 'Bowtie2' : aligner === 'blast' ? 'BLAST' : aligner === 'mmseqs2' ? 'MMseqs2' : 'Jellyfish'}</MenuItem>)}
          </TextField>}
          {Object.entries({ kmer_len: 'K-mer length', min_mapq: 'Minimum mapping quality', threads: 'Threads', size: 'Memory', temperature: 'Temperature', sodium: 'Sodium', magnesium: 'Magnesium', dntp: 'dNTP', dna_conc: 'DNA concentration' }).filter(([key]) => attr[key] !== undefined || key === 'kmer_len' && type === 'kmer_count').map(([key, text]) => <TextField key={key} size="small" label={text} sx={{ width: 160 }} value={attr[key] ?? ''} onChange={e => update(name, { [key]: key === 'size' ? e.target.value : e.target.value === '' ? undefined : Number(e.target.value) })} />)}
        </Stack>
        {attr.filterExpression && attr.min === undefined && attr.max === undefined && <Typography variant="caption" color="text.secondary">Saved custom filter retained</Typography>}
      </Box>;
    })}
    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
      <TextField select size="small" label="Attribute" value={selected} sx={{ minWidth: 190, maxWidth: '100%' }} onChange={e => setSelected(e.target.value)}>{Object.entries(choices).filter(([key]) => !(['mapped_genes'].includes(key) && dna) && !( ['kmer_count','mapped_sites'].includes(key) && !dna)).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
      <Button size="small" startIcon={<AddOutlinedIcon fontSize="small" />} onClick={() => onChange({ ...value, [selected]: { ...(defaults[selected] || {}), ...value[selected], enabled: true } })}>Add attribute</Button>
    </Stack>
  </Stack>;
}
