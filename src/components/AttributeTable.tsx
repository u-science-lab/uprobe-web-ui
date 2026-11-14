import { Box, IconButton, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
interface Props {
  attributes: Record<string, any>;
  onChange: (name: string, value: any) => void;
  onEdit: (name: string, value: any) => void;
  onDelete: (name: string) => void;
}
export default function AttributeTable({ attributes, onChange, onEdit, onDelete }: Props) {
  const entries = Object.entries(attributes);
  if (!entries.length) return <Typography variant="body2" color="text.secondary">No attributes configured.</Typography>;
  const columns = 'minmax(140px,1fr) 68px minmax(220px,1.4fr) 76px';
  return <Box sx={{ width: '100%', overflowX: 'auto' }}><Box sx={{ minWidth: 560 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: columns, gap: 1, px: 1, py: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      {['Attribute', 'Calculate', 'Filter condition', ''].map((label, index) => <Typography key={index} variant="caption" color="text.secondary">{label}</Typography>)}
    </Box>
    {entries.map(([name, value]) => {
      const calculated = value.enabled !== false;
      const filtered = calculated && value.filterEnabled !== false;
      const complex = value.filterExpression !== undefined && value.min === undefined && value.max === undefined;
      const unit = ['gcContent', 'gc_content'].includes(name) ? '%' : name === 'tm' ? '°C' : '';
      const setBound = (bound: 'min' | 'max', input: string) => {
        const updated = { ...value, [bound]: input === '' ? undefined : Number(input), filterEnabled: true };
        delete updated.filterExpression; onChange(name, updated);
      };
      return <Box key={name} sx={{ display: 'grid', gridTemplateColumns: columns, gap: 1, alignItems: 'center', px: 1, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box><Typography variant="body2" fontWeight={500}>{name}</Typography>{value.aligner && <Typography variant="caption" color="text.secondary">{value.aligner}</Typography>}</Box>
        <Switch size="small" checked={calculated} inputProps={{ 'aria-label': `Calculate ${name}` }} onChange={event => onChange(name, { ...value, enabled: event.target.checked })} />
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Enable attribute filtering"><Switch size="small" checked={filtered} disabled={!calculated} inputProps={{ 'aria-label': `Filter ${name}` }} onChange={event => onChange(name, { ...value, filterEnabled: event.target.checked })} /></Tooltip>
          {!filtered ? <Typography variant="caption" color="text.secondary">{calculated ? 'Calculated only' : 'Disabled'}</Typography> : complex ? <Typography variant="caption" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{value.filterExpression}</Typography> : <>
            <TextField size="small" type="number" label={value.minInclusive === false ? 'Min >' : 'Min ≥'} value={value.min ?? ''} placeholder="—" onChange={event => setBound('min', event.target.value)} inputProps={{ 'aria-label': `${name} minimum`, step: 'any' }} />
            <TextField size="small" type="number" label={value.maxInclusive === false ? 'Max <' : 'Max ≤'} value={value.max ?? ''} placeholder="—" onChange={event => setBound('max', event.target.value)} inputProps={{ 'aria-label': `${name} maximum`, step: 'any' }} />
            {unit && <Typography variant="caption" color="text.secondary">{unit}</Typography>}
          </>}
        </Stack>
        <Stack direction="row"><Tooltip title="Advanced settings"><IconButton size="small" aria-label={`Edit ${name}`} onClick={() => onEdit(name, value)}><TuneIcon fontSize="small" /></IconButton></Tooltip><Tooltip title="Remove attribute"><IconButton size="small" aria-label={`Remove ${name}`} onClick={() => onDelete(name)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip></Stack>
      </Box>;
    })}
  </Box></Box>;
}
