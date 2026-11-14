import { Chip, Stack } from '@mui/material';
import { attributeType } from '../utils/probeConfig';

const labels: Record<string, string> = { annealing_temperature: 'Tm', tm: 'Tm', gc_content: 'GC', mapped_genes: 'Map', mapped_sites: 'Specificity', fold_score: 'Fold', self_match: 'Self match', kmer_count: 'k-mer', length: 'Length' };

/** Compact presentation only; the original attribute configuration stays unchanged. */
export default function AttributeChips({ value = {}, onEdit, onDelete }: {
  value?: Record<string, any>;
  onEdit?: (name: string) => void;
  onDelete?: (name: string) => void;
}) {
  return <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ minWidth: 0 }}>
    {Object.entries(value).filter(([, attr]) => attr && attr.enabled !== false).map(([name, attr]) => {
      const type = attr.originalType || attributeType(name);
      const minimum = attr.min === undefined ? '' : `${attr.minInclusive === false ? '>' : '≥'} ${attr.min}`;
      const maximum = attr.max === undefined ? '' : `${attr.maxInclusive === false ? '<' : '≤'} ${attr.max}`;
      const exclusive = attr.minInclusive === false || attr.maxInclusive === false;
      const bounds = attr.filterEnabled === false ? 'calculate only'
        : attr.filterExpression && attr.min === undefined && attr.max === undefined ? 'custom filter'
        : attr.min !== undefined && attr.max !== undefined && !exclusive ? `${attr.min}–${attr.max}`
        : [minimum, maximum].filter(Boolean).join(', ');
      const unit = bounds && (attr.min !== undefined || attr.max !== undefined) && attr.filterEnabled !== false ? ['tm', 'annealing_temperature'].includes(type) ? ' °C' : type === 'gc_content' ? ' %' : '' : '';
      return <Chip key={name} size="small" variant="outlined" label={`${labels[type] || name}${bounds ? ': ' + bounds + unit : ''}`}
        onClick={onEdit ? () => onEdit(name) : undefined} onDelete={onDelete ? () => onDelete(name) : undefined}
        sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />;
    })}
  </Stack>;
}
