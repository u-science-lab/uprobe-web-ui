import { Box, InputAdornment, MenuItem, TextField } from '@mui/material';
import { parseTargetLength } from '../utils/sampling';

export default function TargetLengthEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const range = value.trim().startsWith('[');
  const bounds = range ? value.replace(/^\s*\[/, '').replace(/\]\s*$/, '').split(',').map(v => v.trim()) : [value];
  let error = false;
  try { parseTargetLength(value); } catch { error = true; }
  return <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
    <TextField select size="small" label="Target length mode" value={range ? 'range' : 'fixed'} onChange={e => onChange(e.target.value === 'range' ? `[${bounds[0]}, ${bounds[0]}]` : bounds[0])}>
      <MenuItem value="fixed">Fixed length</MenuItem><MenuItem value="range">Length range</MenuItem>
    </TextField>
    {bounds.slice(0, range ? 2 : 1).map((bound, index) => <TextField key={index} size="small" type="number" label={range ? (index === 0 ? 'Minimum length' : 'Maximum length') : 'Target length'} value={bound} error={error} inputProps={{ min: 1, step: 1 }} onChange={e => {
      const next = [...bounds]; next[index] = e.target.value;
      onChange(range ? `[${next[0]}, ${next[1]}]` : next[0]);
    }} helperText={error ? 'Use positive integers; minimum ≤ maximum' : undefined} InputProps={{ endAdornment: <InputAdornment position="end">nt</InputAdornment> }} />)}
  </Box>;
}
