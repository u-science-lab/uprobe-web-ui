import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  Chip,
  Box,
  LinearProgress,
  IconButton,
  Stack,
  Tooltip,
  styled,
  Button,
} from '@mui/material';
import {
  PauseCircle as PauseCircleIcon,
  PlayCircle as PlayCircleIcon,
  PlayArrow as PlayArrowIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Replay as ReplayIcon,
  Visibility as VisibilityIcon,
  Autorenew as AutorenewIcon,
  Pause as PauseIcon,
  ErrorOutline as ErrorOutlineIcon,
} from '@mui/icons-material';
import type { Task } from '../../types';
import YAML from 'yaml';

const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  marginTop: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.spacing(1),
  border: `1px solid ${theme.palette.divider}`,
  '& .MuiTableCell-head': {
    fontWeight: 500,
    backgroundColor: theme.palette.background.default,
    borderBottom: `1px solid ${theme.palette.divider}`,
    fontSize: '0.875rem',
  },
  '& .MuiTableRow-hover:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '& .MuiTableCell-root': {
    borderBottom: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1),
    overflowWrap: 'anywhere',
  },
  '& .MuiTableCell-root:last-child': {
    position: 'sticky',
    right: 0,
    zIndex: 1,
    backgroundColor: theme.palette.background.paper,
    borderLeft: `1px solid ${theme.palette.divider}`,
  },
  '& .MuiTableCell-head:last-child': {
    zIndex: 3,
    backgroundColor: theme.palette.background.default,
  },
}));

interface TaskTableProps {
  tasks: Task[];
  page: number;
  rowsPerPage: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPauseTask: (taskId: string) => void;
  onResumeTask: (taskId: string) => void;
  onRunTask: (taskId: string) => void;
  onRerunTask: (taskId: string) => void;
  onDownloadResult: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onViewReport: (task: Task) => void;
  onViewRaw: (task: Task) => void;
  onViewError?: (task: Task) => void;
}

const getStatusColor = (status: string): "success" | "info" | "warning" | "error" | "default" => {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "pending":
      return "warning";
    case "queued":
      return "warning";
    case "failed":
      return "error";
    case "paused":
    default:
      return "default";
  }
};

const statusIcons = {
  pending: <ScheduleIcon fontSize="small" />,
  queued: <ScheduleIcon fontSize="small" />,
  running: <AutorenewIcon fontSize="small" />,
  completed: <CheckCircleIcon fontSize="small" />,
  failed: <ErrorOutlineIcon fontSize="small" />,
  paused: <PauseIcon fontSize="small" />,
};

// Helper function to get probe name from task
const getTaskProbeName = (task: Task): string => {
  try {
    const match = task.description.match(/Protocol for designing (.+?) probes from species/);
    if (match && match[1]) {
      return match[1];
    }
    if (task.yaml_content) {
      const yamlData = YAML.parse(task.yaml_content);
      if (yamlData.probes) {
        const probeKeys = Object.keys(yamlData.probes).filter(key => key.startsWith('probe_'));
        if (probeKeys.length > 0) {
          return `Custom (${probeKeys.length} probes)`;
        }
      }
    }
    if (task.parameters?.probes) {
      const probeKeys = Object.keys(task.parameters.probes).filter(key => key.startsWith('probe_'));
      if (probeKeys.length > 0) {
        return `Custom (${probeKeys.length} probes)`;
      }
    }
    return 'Custom Probe';
  } catch (error) {
    console.warn('Error determining probe name for task:', task.id, error);
    return 'Unknown';
  }
};

// Helper function to get probe type (source) from task
const getTaskSource = (task: Task): string => {
  try {
    if (task.yaml_content) {
      const yamlData = YAML.parse(task.yaml_content);
      if (yamlData.extracts?.target_region?.source) {
        return yamlData.extracts.target_region.source;
      }
    }
    if (task.parameters?.extracts?.target_region?.source) {
      return task.parameters.extracts.target_region.source;
    }
    return 'exon';
  } catch (error) {
    console.warn('Error determining source for task:', task.id, error);
    return 'Unknown';
  }
};

// Helper function to get probe type (DNA/RNA) from task
const getTaskProbeType = (task: Task): 'DNA' | 'RNA' => {
  const source = getTaskSource(task);
  if (source === 'genome') {
    return 'DNA';
  }
  return 'RNA';
};




const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  onPauseTask,
  onResumeTask,
  onRunTask,
  onDownloadResult,
  onDeleteTask,
  onRerunTask,
  onViewReport,
  onViewRaw,
  onViewError,
}) => {
  const safePage = Math.min(page, Math.max(0, Math.ceil(tasks.length / rowsPerPage) - 1));
  return (
    <Box sx={{ minWidth: 0 }}>
    <StyledTableContainer role="region" aria-label="Task list" sx={{
      mt: 0, borderRadius: 2, overflow: 'hidden',
      '& .MuiTableCell-root': { p: 2, verticalAlign: 'top' },
      '& .MuiTableCell-root:last-child': { position: 'static', borderLeft: 0 },
      '@media (max-width: 999px)': {
        border: 0, background: 'transparent',
        '& table, & tbody': { display: 'block', width: '100%' },
        '& thead': { display: 'none' },
        '& tbody tr': { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' },
        '& .MuiTableCell-root': { display: 'block', width: 'auto', minWidth: 0, border: 0, px: 2, py: 1 },
        '& .MuiTableCell-root:first-of-type': { pt: 2 },
        '& .MuiTableCell-root:last-child': { pb: 2, borderTop: '1px solid', borderColor: 'divider' },
      },
    }}>
      <Table aria-label="Probe design tasks" sx={{ width: '100%', tableLayout: 'fixed' }}>
        <TableHead><TableRow>
          <TableCell sx={{ width: '30%' }}>Task</TableCell>
          <TableCell sx={{ width: '22%' }}>Design</TableCell>
          <TableCell sx={{ width: '21%' }}>Status / progress</TableCell>
          <TableCell sx={{ width: '13%' }}>Created</TableCell>
          <TableCell align="right" sx={{ width: '14%' }}>Actions</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {tasks.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage).map(task => (
            <TableRow key={task.id} hover>
              <TableCell>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, overflowWrap: 'anywhere', mb: 0.5 }}>{task.name}</Typography>
                <Box component="details" sx={{ color: 'text.secondary', fontSize: 12, '& summary': { cursor: 'pointer', width: 'fit-content' } }}>
                  <summary>Task details</summary>
                  <Typography variant="caption" component="p" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere', my: 0.75 }}>{task.id}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{task.description || 'No description'}</Typography>
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{task.genome}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{getTaskProbeName(task)}</Typography>
                <Typography variant="caption" color="text.secondary">{getTaskProbeType(task)} · {getTaskSource(task)}</Typography>
              </TableCell>
              <TableCell>
                  <Chip
                    icon={task.no_filtered_probes && task.status === 'completed' ? <ErrorOutlineIcon fontSize="small" /> : statusIcons[task.status as keyof typeof statusIcons]}
                    label={task.status === 'running' && task.phase === 'validating' ? 'Validating' : task.status === 'failed' && task.phase === 'validation_failed' ? 'Validation failed' : task.no_filtered_probes && task.status === 'completed' ? 'No passing probes' : task.status === "pending" ? "Queued" : task.status === 'running' ? 'Designing' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    color={task.no_filtered_probes && task.status === 'completed' ? 'warning' : getStatusColor(task.status)}
                    size="small"
                    sx={{ maxWidth: '100%', height: 'auto', minHeight: 24, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                  />

                <Box sx={{ mt: 1, maxWidth: 240 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <LinearProgress
                      variant="determinate"
                      value={task.progress}
                      color={
                        task.status === "failed"
                          ? "error"
                          : task.status === "completed"
                          ? "success"
                          : "primary"
                      }
                      sx={{ flexGrow: 1, minWidth: 0, height: 6, borderRadius: 3 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35 }}>
                      {task.progress}%
                    </Typography>
                  </Box>

                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="caption" color="text.secondary">
                  {new Date(task.created_at).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </TableCell>
              <TableCell align="right">
                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5} justifyContent="flex-end">
                    {task.status === "pending" && (
                      <Tooltip title="Run Task">
                        <IconButton aria-label="Run Task" size="small" onClick={() => onRunTask(task.id)}>
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {task.status === "running" && (
                      <Tooltip title="Pause Task">
                        <IconButton aria-label="Pause Task" size="small" onClick={() => onPauseTask(task.id)}>
                          <PauseCircleIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {task.status === "paused" && (
                      <Tooltip title="Resume Task">
                        <IconButton aria-label="Resume Task" size="small" onClick={() => onResumeTask(task.id)}>
                          <PlayCircleIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {(task.status === 'failed' || task.status === 'completed') && (
                      <Tooltip title="Rerun Task">
                        <IconButton aria-label="Rerun Task" size="small" onClick={() => onRerunTask(task.id)}>
                          <ReplayIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {task.status === 'failed' && task.error_message && onViewError && (
                      <Tooltip title="View Error Details">
                        <IconButton aria-label="View Error Details" size="small" onClick={() => onViewError(task)} sx={{ color: 'error.main' }}>
                          <ErrorOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {task.status === "completed" && task.result_url && (
                      <>
                        {task.no_filtered_probes ? (
                          <Button size="small" color="warning" onClick={() => onViewRaw(task)} disabled={!task.raw_file}>View raw</Button>
                        ) : <Tooltip title="View Report">
                          <IconButton aria-label="View Report" size="small" onClick={() => onViewReport(task)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>}
                        <Tooltip title="Download Results">
                          <IconButton aria-label="Download Results" size="small" onClick={() => onDownloadResult(task.id)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    <Tooltip title="Delete Task">
                      <IconButton aria-label="Delete Task" size="small" onClick={() => onDeleteTask(task.id)} sx={{ color: 'error.main' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>

              </TableCell>
            </TableRow>
          ))}
          {tasks.length === 0 && <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: '48px !important' }}>
            <Typography variant="subtitle2">No tasks found</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Try another search or status, or create a new task.</Typography>
          </TableCell></TableRow>}
        </TableBody>
      </Table>
    </StyledTableContainer>
      <TablePagination
        component="div"
        sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', justifyContent: 'flex-end', px: 0, gap: 0.5 }, '& .MuiTablePagination-spacer': { display: 'none' }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { my: 1 } }}
        count={tasks.length}
        page={safePage}
        onPageChange={onPageChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
      />
    </Box>
  );
};

export default TaskTable; 
