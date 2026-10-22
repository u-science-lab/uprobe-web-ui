import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Snackbar,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Assignment as AssignmentIcon,
  ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import type { Task } from "../types";
import ApiService from "../api";
import { useNavigate } from "react-router-dom";
import useTaskStore from "../store/taskStore";
import TaskStatistics from '../components/task/TaskStatistics';
import TaskTable from '../components/task/TaskTable';
import Papa from 'papaparse';


const Task: React.FC = () => {
  const { 
    tasks, 
    isLoading, 
    fetchTasks, 
    deleteTask, 
    pauseTask, 
    resumeTask, 
    runTask,
    rerunTask
  } = useTaskStore();
  

  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchText, setSearchText] = useState<string>("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info" | "warning";
  }>({
    open: false,
    message: "",
    severity: "info"
  });
  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    content: string;
  }>({
    open: false,
    title: "",
    content: "",
  });
  const navigate = useNavigate();
  const [rawPreview, setRawPreview] = useState<{ task: Task; rows: string[][] } | null>(null);
  const theme = useTheme();

  useEffect(() => {
    fetchTasks();
    const refreshInterval = setInterval(fetchTasks, 10000);
    return () => clearInterval(refreshInterval);
  }, [fetchTasks]);

  const handleCreateTask = () => {
    navigate('/design');
  };

  const handleViewRaw = async (task: Task) => {
    if (!task.raw_file) return;
    try {
      const blob = await ApiService.downloadTaskFile(task.id, task.raw_file);
      if (task.raw_file.endsWith('.xlsx')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(blob);
        const parser = new DOMParser();
        const stringsXml = await zip.file('xl/sharedStrings.xml')?.async('text');
        const strings = stringsXml ? Array.from(parser.parseFromString(stringsXml, 'application/xml').getElementsByTagName('si')).map(si =>
          Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '').join('')) : [];
        const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text');
        if (!sheetXml) throw new Error('Missing worksheet');
        const rows = Array.from(parser.parseFromString(sheetXml, 'application/xml').getElementsByTagName('row')).slice(0, 101).map(row => {
          const values: string[] = [];
          for (const cell of Array.from(row.getElementsByTagName('c'))) {
            const letters = (cell.getAttribute('r') ?? '').match(/^[A-Z]+/)?.[0] ?? 'A';
            const index = Array.from(letters).reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
            while (values.length <= index) values.push('');
            const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
            values[index] = cell.getAttribute('t') === 's' ? strings[Number(value)] ?? '' : value;
          }
          return values;
        });
        setRawPreview({ task, rows });
        return;
      }
      const parsed = Papa.parse<string[]>(await blob.text(), { preview: 101, skipEmptyLines: true });
      setRawPreview({ task, rows: parsed.data });
    } catch {
      setSnackbar({ open: true, message: 'Failed to load raw candidates. Please try again.', severity: 'error' });
    }
  };

  const handleViewReport = async (task: Task) => {
    try {
      setSnackbar({
        open: true,
        message: "Processing report, this may take a moment...",
        severity: "info",
      });

      // 1. Download the zip file
      const blob = await ApiService.downloadTaskResult(task.id);
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(blob);

      // 2. Find the HTML file
      const htmlFileEntry = Object.values(zip.files).find(
        (file) => file.name.endsWith('.html') && !file.dir
      );
      
      if (!htmlFileEntry) {
        throw new Error("No HTML file found in the archive.");
      }

      const mainHtmlContent = await htmlFileEntry.async('text');
      
      // 3. Parse the HTML and prepare for inlining resources
      const parser = new DOMParser();
      const doc = parser.parseFromString(mainHtmlContent, 'text/html');
      const promises: Promise<void>[] = [];
      const baseUrl = `file:///${htmlFileEntry.name}`;

      // 4. Inline CSS
      doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('//')) {
          const resourcePath = new URL(href, baseUrl).pathname.substring(1);
          const cssFile = zip.file(resourcePath);
          if (cssFile) {
            promises.push(
              cssFile.async('text').then(cssContent => {
                const style = doc.createElement('style');
                style.textContent = cssContent;
                link.replaceWith(style);
              })
            );
          }
        }
      });

      // 5. Inline Javascript
      doc.querySelectorAll('script[src]').forEach(script => {
        const src = script.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('//')) {
          const resourcePath = new URL(src, baseUrl).pathname.substring(1);
          const jsFile = zip.file(resourcePath);
          if (jsFile) {
            promises.push(
              jsFile.async('text').then(jsContent => {
                const newScript = doc.createElement('script');
                newScript.textContent = jsContent;
                script.replaceWith(newScript);
              })
            );
          }
        }
      });
      
      // 6. Inline Images
      doc.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('//')) {
          const resourcePath = new URL(src, baseUrl).pathname.substring(1);
          const imgFile = zip.file(resourcePath);
          if (imgFile) {
            promises.push(
              imgFile.async('base64').then(base64Content => {
                const extension = src.split('.').pop()?.toLowerCase() || 'png';
                const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
                img.setAttribute('src', `data:${mimeType};base64,${base64Content}`);
              })
            );
          }
        }
      });

      await Promise.all(promises);

      // 7. Create a blob from the modified, self-contained HTML
      const finalHtml = doc.documentElement.outerHTML;
      const htmlBlob = new Blob([finalHtml], { type: 'text/html' });
      const url = URL.createObjectURL(htmlBlob);

      const newWindow = window.open(url, '_blank');
      if (newWindow) {
        newWindow.addEventListener('unload', () => URL.revokeObjectURL(url));
      } else {
        URL.revokeObjectURL(url);
      }
      
      setSnackbar({
        open: true,
        message: "Report opened successfully.",
        severity: "success",
      });

    } catch (error) {
      console.error('Failed to create self-contained report:', error);
      setSnackbar({
        open: true,
        message: "Failed to open report. See console for details.",
        severity: "error",
      });
    }
  };



  const handleDeleteTask = (taskId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this task? This action cannot be undone.");
    if (confirmDelete) {
      deleteTask(taskId)
        .then(() => {
          setSnackbar({
            open: true,
            message: "Task deleted successfully",
            severity: "success"
          });
        })
        .catch(error => {
          console.error("Failed to delete task", error);
          setSnackbar({
            open: true,
            message: "Failed to delete task, please try again later",
            severity: "error"
          });
        });
    }
  };

  const handlePauseTask = (taskId: string) => {
    pauseTask(taskId)
        .then(() => {
          setSnackbar({
            open: true,
            message: "Task paused successfully",
            severity: "success"
          });
        })
        .catch(error => {
          console.error("Failed to pause task", error);
          setSnackbar({
            open: true,
            message: "Failed to pause task, please try again later",
            severity: "error"
          });
        });
  };

  const handleResumeTask = (taskId: string) => {
    resumeTask(taskId)
        .then(() => {
          setSnackbar({
            open: true,
            message: "Task resumed successfully",
            severity: "success"
          });
        })
        .catch(error => {
          console.error("Failed to resume task", error);
          setSnackbar({
            open: true,
            message: "Failed to resume task, please try again later",
            severity: "error"
          });
        });
  };

  const handleRunTask = (taskId: string) => {
    runTask(taskId)
      .then(() => {
        setSnackbar({
          open: true,
          message: "Task started successfully",
          severity: "success"
        });
      })
      .catch(error => {
        console.error("Failed to run task", error);
        setSnackbar({
          open: true,
          message: "Failed to start task, please try again later",
          severity: "error"
        });
      });
  };

  const handleRerunTask = (taskId: string) => {
    rerunTask(taskId)
      .then(() => {
        setSnackbar({
          open: true,
          message: "Task is restarting successfully",
          severity: "success"
        });
      })
      .catch(error => {
        console.error("Failed to rerun task", error);
        setSnackbar({
          open: true,
          message: "Failed to restart task, please try again later",
          severity: "error"
        });
      });
  };

  const handleDownloadResult = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    const filename = task ? `${task.name}_${taskId}_results.zip` : `${taskId}_results.zip`;
    
    ApiService.downloadTaskResult(taskId)
      .then(blob => {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        setSnackbar({
          open: true,
          message: "Result file downloaded successfully",
          severity: "success"
        });
      })
      .catch(error => {
        console.error("Failed to download result file", error);
        setSnackbar({
          open: true,
          message: "Failed to download result file, please try again later",
          severity: "error"
        });
      });
  };

  const handleViewError = (task: Task) => {
    setErrorDialog({
      open: true,
      title: `Error Details: ${task.name}`,
      content: task.error_message || "No error details available.",
    });
  };

  const getTasksStatistics = () => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.status === "completed").length;
    const running = tasks.filter((task) => task.status === "running").length;
    const pending = tasks.filter((task) => task.status === "pending" || task.status === "queued").length;
    const failed = tasks.filter((task) => task.status === "failed").length;
    const paused = tasks.filter((task) => task.status === "paused").length;
    
    return { total, completed, running, pending, failed, paused };
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesTab = activeTab === "all" || task.status === activeTab || (activeTab === "pending" && task.status === "queued");
    const matchesSearch =
      task.name.toLowerCase().includes(searchText.toLowerCase()) ||
      task.description.toLowerCase().includes(searchText.toLowerCase()) ||
      task.genome.toLowerCase().includes(searchText.toLowerCase());
    return matchesTab && matchesSearch;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <Box sx={{ p: { xs: 0, sm: 1, md: 2 }, minWidth: 0, width: '100%' }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AssignmentIcon color="primary" sx={{ fontSize: 28 }} />
            <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 650 }}>
              Task Management
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            Manage and monitor your probe design tasks
          </Typography>
        </Stack>
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateTask}
            color="primary"
          >
            Create Task
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchTasks}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      <TaskStatistics stats={getTasksStatistics()} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'stretch', mb: 2 }}>
        <TextField
          variant="outlined"
          placeholder="Search tasks..."
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ width: '100%', maxWidth: { sm: 400 } }}
          inputProps={{ 'aria-label': 'Search tasks' }}
          size="small"
        />
        <Tabs
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          value={activeTab}
          onChange={(_, newValue) => { setActiveTab(newValue); setPage(0); }}
          sx={{ minWidth: 0, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minWidth: 'auto', px: { xs: 1.5, sm: 2 }, textTransform: 'none' } }}
        >
          <Tab label="All Tasks" value="all" />
          <Tab label="Running" value="running" />
          <Tab label="Queued" value="pending" />
          <Tab label="Completed" value="completed" />
          <Tab label="Paused" value="paused" />
          <Tab label="Failed" value="failed" />
        </Tabs>
      </Box>

      <TaskTable
        tasks={filteredTasks}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        onPauseTask={handlePauseTask}
        onResumeTask={handleResumeTask}
        onRunTask={handleRunTask}
        onRerunTask={handleRerunTask}
        onDownloadResult={handleDownloadResult}
        onDeleteTask={handleDeleteTask}
        onViewReport={handleViewReport}
        onViewRaw={handleViewRaw}
        onViewError={handleViewError}
      />

      {tasks.some(task => task.status === 'completed' && task.no_filtered_probes) && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Some tasks have no probes passing post-processing. Use View raw to inspect unfiltered candidates; raw candidates are not passing probes.
        </Alert>
      )}

      <Dialog open={rawPreview !== null} onClose={() => setRawPreview(null)} maxWidth="xl" fullWidth>
        <DialogTitle>Raw candidates — {rawPreview?.task.name}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>No probes passed post-processing. These are unfiltered candidates, shown for troubleshooting only. Preview displays up to 100 rows.</Alert>
          <Box sx={{ overflow: 'auto', maxHeight: '60vh' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{rawPreview?.rows[0]?.map((cell, i) => <th key={i} style={{ padding: 8, textAlign: 'left', whiteSpace: 'nowrap' }}>{cell}</th>)}</tr></thead>
              <tbody>{rawPreview?.rows.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: 8, borderTop: '1px solid #ddd', whiteSpace: 'nowrap' }}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setRawPreview(null)}>Close</Button></DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={errorDialog.open}
        onClose={() => setErrorDialog({ ...errorDialog, open: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{errorDialog.title}</DialogTitle>
        <DialogContent dividers>
          <Typography
            component="pre"
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              backgroundColor: (theme.palette.mode === 'dark') ? '#0b1220' : '#f5f5f5',
              color: (theme.palette.mode === 'dark') ? '#fca5a5' : 'text.primary',
              border: '1px solid',
              borderColor: (theme.palette.mode === 'dark') ? 'rgba(248, 113, 113, 0.35)' : 'divider',
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              lineHeight: 1.6,
              maxHeight: '60vh',
              overflow: 'auto',
              m: 0,
              scrollbarColor: (theme.palette.mode === 'dark') ? '#475569 #1e293b' : undefined,
              '&::-webkit-scrollbar': { width: '8px', height: '8px' },
              '&::-webkit-scrollbar-track': {
                background: (theme.palette.mode === 'dark') ? '#1e293b' : 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: (theme.palette.mode === 'dark') ? '#475569' : '#cbd5e1',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                background: (theme.palette.mode === 'dark') ? '#64748b' : '#94a3b8',
              },
            }}
          >
            {errorDialog.content}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialog({ ...errorDialog, open: false })}>Close</Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon fontSize="small" />}
            onClick={() => {
              navigator.clipboard
                .writeText(errorDialog.content)
                .then(() =>
                  setSnackbar({ open: true, message: 'Error details copied to clipboard', severity: 'success' })
                )
                .catch(() =>
                  setSnackbar({ open: true, message: 'Failed to copy error details', severity: 'error' })
                );
            }}
          >
            Copy
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default Task;
