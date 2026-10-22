import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Tabs,
  Tab,
  Paper,
  Divider,
  Chip,
  Alert,
  AlertTitle,
  useTheme,
  useMediaQuery,
  Container,
  alpha,
} from '@mui/material';
import {
  RocketLaunch,
  FolderOpen,
  AutoAwesome,
  Build,
  Assignment,
  SmartToy,
  KeyboardArrowRight,
  GitHub,
  MenuBook,
  Article,
  Code,
  OpenInNew,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tutorial-tabpanel-${index}`}
      aria-labelledby={`tutorial-tab-${index}`}
      {...other}
      style={{ height: '100%', width: '100%' }}
    >
      {value === index && (
        <Box sx={{ p: { xs: 3, md: 5 }, height: '100%', overflowY: 'auto' }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Tutorial: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const CodeBlock = ({ children }: { children: React.ReactNode }) => (
    <Box
      component="pre"
      sx={{
        backgroundColor: theme.palette.mode === 'dark' ? '#0f172a' : '#f8fafc',
        color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#0f172a',
        p: 2.5,
        borderRadius: 2,
        overflowX: 'auto',
        fontSize: '0.875rem',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        border: `1px solid ${theme.palette.divider}`,
        my: 2,
        scrollbarColor: (theme.palette.mode === 'dark') ? '#475569 #1e293b' : undefined,
        '&::-webkit-scrollbar': { height: '8px' },
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
      {children}
    </Box>
  );

  return (
    <Box sx={{ 
      minHeight: 'calc(100vh - 64px)', 
      bgcolor: 'background.default',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Main Content Area */}
      <Container maxWidth={false} sx={{ flexGrow: 1, py: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column' }}>
        <Paper 
          elevation={0} 
          sx={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row', 
            flexGrow: 1,
            overflow: 'hidden', 
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper'
          }}
        >
          {/* Sidebar Navigation */}
          <Box sx={{ 
            borderRight: isMobile ? 0 : `1px solid ${theme.palette.divider}`, 
            borderBottom: isMobile ? `1px solid ${theme.palette.divider}` : 0, 
            minWidth: 0,
            width: isMobile ? '100%' : 280,
            flexShrink: 0,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Title inside sidebar */}
            <Box sx={{ p: 3, pb: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                Documentation
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                U-Probe User Guide
              </Typography>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
              <Tabs
                orientation={isMobile ? "horizontal" : "vertical"}
                variant="scrollable"
                value={activeTab}
                onChange={handleTabChange}
                sx={{
                  '& .MuiTabs-indicator': {
                    width: isMobile ? '100%' : 3,
                    borderRadius: 1,
                  },
                  '& .MuiTab-root': {
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    textTransform: 'none',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    py: 2.5,
                    px: 3,
                    minHeight: 64,
                    color: 'text.secondary',
                    transition: 'all 0.2s',
                    '&.Mui-selected': {
                      color: 'primary.main',
                      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                      fontWeight: 600,
                    },
                    '&:hover:not(.Mui-selected)': {
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    }
                  }
                }}
              >
                <Tab icon={<RocketLaunch sx={{ mr: 2, fontSize: 20 }} />} iconPosition="start" label="Quick Start" />
                <Tab icon={<FolderOpen sx={{ mr: 2, fontSize: 20 }} />} iconPosition="start" label="Genome Management" />
                <Tab icon={<AutoAwesome sx={{ mr: 2, fontSize: 20 }} />} iconPosition="start" label="Design Workflow" />
                <Tab icon={<Build sx={{ mr: 2, fontSize: 20 }} />} iconPosition="start" label="Custom Probes" />
                <Tab icon={<Assignment sx={{ mr: 2, fontSize: 20 }} />} iconPosition="start" label="Tasks & Results" />
                <Tab icon={<SmartToy sx={{ mr: 2, fontSize: 20 }} />} iconPosition="start" label="AI Assistant" />
              </Tabs>
            </Box>

            {/* External Links Section */}
            <Box sx={{ 
              p: 3, 
              borderTop: `1px solid ${theme.palette.divider}`,
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)'
            }}>
              <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, display: 'block' }}>
                RESOURCES
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button 
                  variant="text" 
                  startIcon={<MenuBook fontSize="small" />} 
                  endIcon={<OpenInNew sx={{ fontSize: 14, ml: 'auto', opacity: 0.5 }} />}
                  href="https://www.u-probe.org/docs/" 
                  target="_blank"
                  sx={{ justifyContent: 'flex-start', color: 'text.primary', '&:hover': { bgcolor: 'action.hover' }, px: 1, py: 0.5 }}
                >
                  Full Documentation
                </Button>
                <Button 
                  variant="text" 
                  startIcon={<GitHub fontSize="small" />} 
                  endIcon={<OpenInNew sx={{ fontSize: 14, ml: 'auto', opacity: 0.5 }} />}
                  href="https://github.com/UFISH-Team/U-Probe" 
                  target="_blank"
                  sx={{ justifyContent: 'flex-start', color: 'text.primary', '&:hover': { bgcolor: 'action.hover' }, px: 1, py: 0.5 }}
                >
                  GitHub Repository
                </Button>
                <Button 
                  variant="text" 
                  startIcon={<Code fontSize="small" />} 
                  endIcon={<OpenInNew sx={{ fontSize: 14, ml: 'auto', opacity: 0.5 }} />}
                  href="https://pypi.org/project/uprobe/" 
                  target="_blank"
                  sx={{ justifyContent: 'flex-start', color: 'text.primary', '&:hover': { bgcolor: 'action.hover' }, px: 1, py: 0.5 }}
                >
                  PyPI Package
                </Button>
                <Button 
                  variant="text" 
                  startIcon={<Article fontSize="small" />} 
                  endIcon={<OpenInNew sx={{ fontSize: 14, ml: 'auto', opacity: 0.5 }} />}
                  href="https://www.biorxiv.org/content/10.64898/2026.04.12.717982v1" 
                  target="_blank"
                  sx={{ justifyContent: 'flex-start', color: 'text.primary', '&:hover': { bgcolor: 'action.hover' }, px: 1, py: 0.5 }}
                >
                  Research Paper
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Content Area */}
          <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', bgcolor: 'background.paper' }}>
            {/* 1. Quick Start */}
            <TabPanel value={activeTab} index={0}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                Quick Start
              </Typography>
              <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary', mb: 4 }}>
                Welcome to U-Probe! Designing highly specific probes involves three main steps. Follow this standard path to get your first results within minutes.
              </Typography>

              <Grid container spacing={3} sx={{ mb: 5 }}>
                {[
                  { step: 1, title: 'Upload Genome', desc: 'Go to Genome Browser and upload your FASTA and GTF files.', path: '/genome' },
                  { step: 2, title: 'Run Workflow', desc: 'Go to Design Workflow, input your target genes, and submit.', path: '/design/designworkflow' },
                  { step: 3, title: 'View Results', desc: 'Go to Task Management to download your probe sequences and reports.', path: '/task' }
                ].map((item) => (
                  <Grid item xs={12} md={4} key={item.step}>
                    <Card 
                      elevation={0} 
                      sx={{ 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 2,
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: theme.shadows[4],
                          borderColor: 'primary.main'
                        }
                      }}
                    >
                      <CardContent sx={{ p: 3, flexGrow: 1 }}>
                        <Box sx={{ 
                          width: 32, 
                          height: 32, 
                          borderRadius: '8px', 
                          bgcolor: 'primary.main', 
                          color: 'primary.contrastText',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          mb: 2
                        }}>
                          {item.step}
                        </Box>
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{item.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>{item.desc}</Typography>
                      </CardContent>
                      <Box sx={{ p: 3, pt: 0 }}>
                        <Button 
                          variant="text" 
                          endIcon={<KeyboardArrowRight />} 
                          onClick={() => navigate(item.path)}
                          sx={{ px: 0, fontWeight: 600 }}
                        >
                          Go to {item.title}
                        </Button>
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              <Alert severity="info" sx={{ borderRadius: 2, '& .MuiAlert-message': { fontSize: '0.95rem' } }}>
                <AlertTitle sx={{ fontWeight: 600 }}>First time here?</AlertTitle>
                We recommend using the built-in <strong>Public Genomes</strong> (if available) to test the workflow before uploading your own massive datasets.
              </Alert>
            </TabPanel>

            {/* 2. Genome Management */}
            <TabPanel value={activeTab} index={1}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                Genome Management
              </Typography>
              <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary' }}>
                The Genome Browser is where you manage your reference sequences and annotations. U-Probe needs these files to extract target sequences and check for off-target binding.
              </Typography>

              <Typography variant="h5" sx={{ mt: 5, mb: 3, fontWeight: 600 }}>Required File Types</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: '100%' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>FASTA Files (.fa, .fasta, .fna)</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>Contains the raw nucleotide sequences of the genome. Essential for alignment and sequence extraction.</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: '100%' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'secondary.main', mb: 1 }}>Annotation Files (.gtf, .gff)</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>Defines the coordinates of genes, exons, and transcripts. Required if you want to target specific gene names (e.g., "CD4").</Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Typography variant="h5" sx={{ mt: 5, mb: 3, fontWeight: 600 }}>How to Add a Genome</Typography>
              <Box component="ol" sx={{ pl: 2, '& li': { mb: 1.5, color: 'text.secondary', lineHeight: 1.6 } }}>
                <li>Click the <strong>Add</strong> button next to the genome selector.</li>
                <li>Give your genome a recognizable name (e.g., <code>hg38_human</code> or <code>mm10_mouse</code>).</li>
                <li>Select your newly created genome from the dropdown.</li>
                <li>Click <strong>Upload FASTA / GTF</strong> and drag your files into the upload zone.</li>
              </Box>

              <Alert severity="warning" sx={{ mt: 4, borderRadius: 2 }}>
                <AlertTitle sx={{ fontWeight: 600 }}>Note on Indexing</AlertTitle>
                When you run a task for the first time on a new genome, U-Probe will automatically build alignment indices (like Bowtie2 and Jellyfish). This might take some time depending on the genome size.
              </Alert>
            </TabPanel>

            {/* 3. Design Workflow */}
            <TabPanel value={activeTab} index={2}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                Design Workflow
              </Typography>
              <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary', mb: 4 }}>
                The standard Design Workflow is the recommended path for most users. It automates the extraction, construction, and filtering of probes.
              </Typography>

              <Box sx={{ mb: 5 }}>
                <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>1. Select Parameters</Typography>
                <Box component="ul" sx={{ pl: 2, '& li': { mb: 1, color: 'text.secondary' } }}>
                  <li><strong>Species:</strong> Select the genome you prepared in the previous step.</li>
                  <li><strong>Probe Type:</strong> Choose a built-in protocol (e.g., mRNA-FISH, DNA-FISH) or a Custom Probe type you created.</li>
                </Box>
              </Box>

              <Divider sx={{ my: 4 }} />

              <Box sx={{ mb: 5 }}>
                <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>2. Target Input</Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight="700">Manual Input</Typography>
                        <Chip size="small" label="Good for 1-5 targets" sx={{ bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100' }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>Type the gene name (e.g., GAPDH) or paste a raw sequence directly into the interface.</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.primary.main}40`, bgcolor: theme.palette.mode === 'dark' ? 'rgba(37, 99, 235, 0.05)' : 'rgba(37, 99, 235, 0.02)', borderRadius: 2, height: '100%' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight="700" color="primary.main">CSV Upload</Typography>
                        <Chip size="small" label="Good for batch processing" color="primary" />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>Upload a CSV file with a <code>target</code> column. If your protocol requires barcodes, include columns like <code>barcode1</code>.</Typography>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>

              <Divider sx={{ my: 4 }} />

              <Box>
                <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>3. Post Processing (Filters & Sorting)</Typography>
                <Typography paragraph sx={{ color: 'text.secondary' }}>
                  U-Probe calculates various thermodynamic and specificity attributes. You can enable filters to discard bad probes:
                </Typography>
                <Box component="ul" sx={{ pl: 2, '& li': { mb: 1.5, color: 'text.secondary', lineHeight: 1.6 } }}>
                  <li><strong>GC Content (%):</strong> Ratio of G and C bases. Usually kept between 40% - 60%.</li>
                  <li><strong>Melting Temp (Tm):</strong> The temperature at which the probe binds. Ensure all probes in a multiplex assay have similar Tm.</li>
                  <li><strong>Off-target (Mapped Sites/Genes):</strong> Discards probes that map to too many unintended locations in the genome.</li>
                </Box>
              </Box>
            </TabPanel>

            {/* 4. Custom Probes */}
            <TabPanel value={activeTab} index={3}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                Custom Probe Design
              </Typography>
              <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary' }}>
                For advanced applications (like MERFISH, seqFISH, or RCA), you might need complex probe structures. The Custom Probe tool uses a <strong>Directed Acyclic Graph (DAG)</strong> architecture to let you build probes modularly.
              </Typography>

              <Typography variant="h5" sx={{ mt: 5, mb: 2, fontWeight: 600 }}>Understanding Probe Parts</Typography>
              <Typography paragraph sx={{ color: 'text.secondary' }}>A probe is constructed by concatenating multiple "Parts". A Part can be:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 4 }}>
                <Chip label="Target Sequence" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.mode === 'dark' ? '#93c5fd' : '#1d4ed8', fontWeight: 600, border: 'none' }} />
                <Chip label="Barcode / Readout" sx={{ bgcolor: 'rgba(147, 51, 234, 0.12)', color: theme.palette.mode === 'dark' ? '#d8b4fe' : '#7e22ce', fontWeight: 600, border: 'none' }} />
                <Chip label="Fixed Sequence (e.g. Primer)" sx={{ bgcolor: 'rgba(234, 88, 12, 0.12)', color: theme.palette.mode === 'dark' ? '#fdba74' : '#c2410c', fontWeight: 600, border: 'none' }} />
                <Chip label="Another Probe (Nested)" sx={{ bgcolor: 'rgba(22, 163, 74, 0.12)', color: theme.palette.mode === 'dark' ? '#86efac' : '#15803d', fontWeight: 600, border: 'none' }} />
              </Box>

              <Typography variant="h5" sx={{ mt: 5, mb: 2, fontWeight: 600 }}>The DAG Architecture</Typography>
              <Typography paragraph sx={{ color: 'text.secondary' }}>
                Because of the DAG structure, you can define <code>Probe 1</code>, and then define <code>Probe 2</code> that uses <code>Probe 1</code> as its template but applies a reverse complement.
              </Typography>

              <Paper elevation={0} sx={{ my: 4, p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Example: Padlock Probe for RCA</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  A padlock probe typically consists of two target-binding arms separated by a backbone (containing a barcode).
                </Typography>
                <CodeBlock>
{`Probe 1 (Padlock):
  Part 1: Target [1:20] (Reverse Complement)
  Part 2: Fixed Backbone "TGCGTCTATTT"
  Part 3: Barcode "BC1"
  Part 4: Target [21:40] (Reverse Complement)`}
                </CodeBlock>
              </Paper>

              <Alert severity="success" sx={{ borderRadius: 2 }}>
                <AlertTitle sx={{ fontWeight: 600 }}>Integration</AlertTitle>
                Once you save a Custom Probe group, it will appear in the <strong>Probe Type</strong> dropdown in the standard Design Workflow!
              </Alert>
            </TabPanel>

            {/* 5. Tasks & Results */}
            <TabPanel value={activeTab} index={4}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                Tasks & Results
              </Typography>
              <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary', mb: 4 }}>
                Probe design can be computationally intensive, especially when aligning against large genomes. The Task Management page allows you to monitor asynchronous jobs.
              </Typography>

              <Typography variant="h5" sx={{ mt: 5, mb: 3, fontWeight: 600 }}>Task Statuses</Typography>
              <Grid container spacing={2} sx={{ mb: 5 }}>
                {[
                  { status: 'Queued', desc: 'Waiting for server resources.', color: 'default' },
                  { status: 'Running', desc: 'Actively computing (extracting, folding, aligning).', color: 'primary' },
                  { status: 'Completed', desc: 'Done! Results are ready for download.', color: 'success' },
                  { status: 'Failed', desc: 'An error occurred. Click "View Error" for logs.', color: 'error' },
                ].map((s) => (
                  <Grid item xs={12} sm={6} md={3} key={s.status}>
                    <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: '100%', textAlign: 'center' }}>
                      <Chip label={s.status} color={s.color as any} sx={{ mb: 2, fontWeight: 600 }} />
                      <Typography variant="body2" color="text.secondary">{s.desc}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Typography variant="h5" sx={{ mt: 5, mb: 2, fontWeight: 600 }}>Interpreting Results</Typography>
              <Typography paragraph sx={{ color: 'text.secondary' }}>When a task is completed, you can:</Typography>
              <Box component="ul" sx={{ pl: 2, '& li': { mb: 1.5, color: 'text.secondary', lineHeight: 1.6 } }}>
                <li><strong>Download ZIP:</strong> Contains XLSX result tables and HTML reports. Raw XLSX tables contain unfiltered candidates and their calculated attributes.</li>
                <li><strong>View Report:</strong> Opens an interactive HTML dashboard with distribution plots (e.g., GC content vs. Tm scatter plots) to help you visually select the best probes.</li>
              </Box>
            </TabPanel>

            {/* 6. AI Assistant */}
            <TabPanel value={activeTab} index={5}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
                AI Assistant
              </Typography>
              <Typography paragraph sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary', mb: 4 }}>
                U-Probe comes with a built-in AI Agent powered by Large Language Models. It acts as your personal bioinformatics consultant.
              </Typography>

              <Grid container spacing={3} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                  <Paper elevation={0} sx={{ p: 4, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>What can it do?</Typography>
                    <Box component="ul" sx={{ pl: 2, m: 0, '& li': { mb: 1.5, color: 'text.secondary', lineHeight: 1.6 } }}>
                      <li>Recommend optimal Tm and GC content ranges for specific experiments (e.g., "What's the best Tm for RNA-FISH?").</li>
                      <li>Explain complex bioinformatics concepts (e.g., "What does k-mer count mean for specificity?").</li>
                      <li>Help troubleshoot failed tasks by analyzing error logs.</li>
                      <li>Write custom Python scripts to parse your downloaded XLSX results.</li>
                    </Box>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper elevation={0} sx={{ p: 4, border: `1px solid ${theme.palette.primary.main}40`, bgcolor: theme.palette.mode === 'dark' ? 'rgba(37, 99, 235, 0.05)' : 'rgba(37, 99, 235, 0.02)', borderRadius: 2, height: '100%' }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: 'primary.main' }}>Configuration</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 3 }}>
                      Before using the Agent, click the <strong>Settings (Gear)</strong> icon in the Chat sidebar to configure your API key.
                    </Typography>
                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                      Your API key is stored <strong>locally in your browser</strong> and is never saved to our database.
                    </Alert>
                  </Paper>
                </Grid>
              </Grid>
            </TabPanel>

          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default Tutorial;
