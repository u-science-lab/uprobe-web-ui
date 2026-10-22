import React from 'react';
import { Box, Typography } from '@mui/material';

interface TaskStats {
  total: number; completed: number; running: number;
  pending: number; failed: number; paused: number;
}

const TaskStatistics: React.FC<{ stats: TaskStats }> = ({ stats }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, gap: { xs: 1, sm: 1.5 }, mb: 2.5 }}>
    {[
      { label: 'Total tasks', value: stats.total, color: 'text.primary' },
      { label: 'Running', value: stats.running, color: 'info.main' },
      { label: 'Queued', value: stats.pending, color: 'warning.main' },
      { label: 'Completed', value: stats.completed, color: 'success.main' },
      { label: 'Failed', value: stats.failed, color: 'error.main' },
      { label: 'Paused', value: stats.paused, color: 'text.secondary' },
    ].map(item => <Box key={item.label} sx={{ minWidth: 0, px: 2, py: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <Typography variant="body2" color="text.secondary">{item.label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 26, lineHeight: 1.2, fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: item.color }}>{item.value}</Typography>
    </Box>)}
  </Box>
);

export default TaskStatistics;
