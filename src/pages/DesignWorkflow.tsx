import TargetLayoutEditor from '../components/TargetLayoutEditor';
import TargetLengthEditor from '../components/TargetLengthEditor';
import { editProbePart, rewritePartReferences } from '../utils/structureEditing';
import { validateTargetLayout } from '../utils/targetLayout';
import { formatTargetLength, parseTargetLength, samplingStep } from '../utils/sampling';
import React, { useEffect, useRef, useState } from 'react';
import { createTheme, ThemeProvider, useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { 
  Autocomplete,
  Snackbar, 
  Alert, 
  TextField, 
  Box, 
  Typography, 
  Button, 
  Select, 
  MenuItem,
  Menu,
  InputLabel, 
  FormControl, 
  Grid, 
  IconButton, 
  LinearProgress, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  List, 
  ListItem, 
  ListItemText,
  ListItemSecondaryAction,
  Stepper,
  Step,
  StepLabel,
  StepButton,
  Card,
  CardContent,
  CardHeader,
  Collapse,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  InputAdornment,
  DialogActions,
  Tooltip,
  FormHelperText,
  CircularProgress,
  Switch,
  FormControlLabel,
  Paper,
  Stack,
  Container
} from '@mui/material';

import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DownloadIcon from '@mui/icons-material/Download';
import Papa from 'papaparse';
import useDesignStore from '../store/designStore';
import ApiService from '../api';
import { CustomProbeType, WorkflowFilter, extractParametersFromYaml } from '../types';
import SequenceFilters from '../components/SequenceFilters';
import AttributeTable from '../components/AttributeTable';

import YAML from 'yaml';
import { restoreTemplate, exportAttribute } from '../utils/probeConfig';
import { useDraftState } from '../utils/useDraftState';
import { AttributeFilter, parseAttributeFilter, buildAttributeFilter } from '../utils/attributeFilters';


interface AttributeValue extends AttributeFilter {
  name: string;
  min?: number;
  max?: number;
  threshold?: number;
  kmer_len?: number;
  aligner?: 'blast' | 'bowtie2' | 'mmseqs2' | 'jellyfish';
  enabled: boolean;
}

interface SortOption {
  category: string;
  field: string;
  order: 'asc' | 'desc';
}

interface SortField {
  value: string;
  label: string;
}

interface SortCategory {
  category: string;
  icon: string;
  fields: SortField[];
}

interface Target {
  target: string;
  sequence?: string;  // Optional sequence field
  [key: string]: string | number | undefined;  // Allow dynamic barcode fields
}

const GENOME_DISPLAY_MAP: Record<string, string> = {
  hg38:   'Homo sapiens (Human): hg38',
  hg19:   'Homo sapiens (Human): hg19',
  GRCm39: 'Mus musculus (Mouse): GRCm39',
  mm10:   'Mus musculus (Mouse): mm10',
  dog:    'Canis lupus familiaris (Dog): dog',
};

const getGenomeLabel = (id: string) => GENOME_DISPLAY_MAP[id] ?? id;

// Helper function to get probe structure (DNA/RNA)
const getProbeType = (customType?: CustomProbeType | null): 'DNA' | 'RNA' => {
  if (!customType) return 'RNA'; // Default for built-in types
  
  const probeSource = customType.targetConfig?.source;
  return probeSource === 'genome' ? 'DNA' : 'RNA';
};

const DesignWorkflow: React.FC = () => {
  const inheritedTheme = useTheme();
  const workflowTheme = React.useMemo(() => createTheme(inheritedTheme, {
    components: {
      MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: 12, boxShadow: 'none' } } },
      MuiCardHeader: { styleOverrides: { root: { padding: '20px 24px 12px' }, title: { fontSize: '1.05rem', fontWeight: 600 }, subheader: { fontSize: '0.8rem', marginTop: 4 }, action: { marginTop: 0 } } },
      MuiCardContent: { styleOverrides: { root: { padding: '12px 24px 20px', '&:last-child': { paddingBottom: 20 } } } },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiFormControl: { defaultProps: { size: 'small' } },
      MuiButton: { defaultProps: { disableElevation: true, size: 'small' }, styleOverrides: { root: { textTransform: 'none', borderRadius: 8, fontWeight: 600 } } },
      MuiAccordion: { defaultProps: { disableGutters: true, elevation: 0 }, styleOverrides: { root: { border: '1px solid', borderColor: inheritedTheme.palette.divider, borderRadius: '8px !important', '&:before': { display: 'none' } } } },
      MuiAccordionSummary: { styleOverrides: { root: { minHeight: 48 }, content: { margin: '10px 0', '& .MuiBox-root': { marginBottom: 0 } } } },
      MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.1rem', fontWeight: 600 } } },
    }
  }), [inheritedTheme]);
  const [speciesOptions, setSpeciesOptions] = useState<string[]>([]);
  const [barcodeLibrary, setBarcodeLibrary] = useState<{ name: string; sequence: string }[]>([]);
  const [activeSection, setActiveSection] = useState('species');
  const [showValidation, setShowValidation] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>();
  const workflowScroll = useRef<HTMLDivElement>(null);
  const [barcodeMenuAnchor, setBarcodeMenuAnchor] = useState<HTMLElement | null>(null);

  // Helper functions to format probe and part names for display
  const formatProbeName = (probeName: string): string => {
    // Convert "probe_1" to "Probe_1", "probe_2" to "Probe_2", etc.
    if (probeName.startsWith('probe_')) {
      return probeName.replace('probe_', 'Probe_');
    }
    // Handle pure numbers like "0", "1", "2" -> "Probe_1", "Probe_2", "Probe_3"
    if (/^\d+$/.test(probeName)) {
      return `Probe_${parseInt(probeName) + 1}`;
    }
    return probeName;
  };


  const formatPartName = (partName: string): string => {
    // Convert "part1" to "Part_1", "part2" to "Part_2", etc.
    const match = partName.match(/^part(\d+)$/);
    if (match) {
      return `Part_${match[1]}`;
    }
    // Handle pure numbers like "0", "1", "2" -> "Part_1", "Part_2", "Part_3"
    if (/^\d+$/.test(partName)) {
      return `Part_${parseInt(partName) + 1}`;
    }
    return partName;
  };

  const [customProbeTypes, setCustomProbeTypes] = useState<CustomProbeType[]>([]);
  const [builtinProbeTypes, setBuiltinProbeTypes] = useState<CustomProbeType[]>([]);
  const [isLoadingCustomTypes, setIsLoadingCustomTypes] = useState(true);
  const [showCustomProbeTypes, setShowCustomProbeTypes] = useState(false);
  const [expandedProbes, setExpandedProbes] = useState<Record<string, boolean>>({});

  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    taskName: true,
    species: true,
    probeType: true,
    targetParams: true,
    geneMap: true
  });
  const [showAttributeDialog, setShowAttributeDialog] = useState(false);
  const [showEditAttributeDialog, setShowEditAttributeDialog] = useState(false);

  const [currentAttributeType, setCurrentAttributeType] = useState<'target' | 'probe' | 'part'>('target');
  const [currentProbeName, setCurrentProbeName] = useState<string>('');
  const [currentPartName, setCurrentPartName] = useState<string>('');
  const [editingAttribute, setEditingAttribute] = useState<AttributeValue | null>(null);
  const [sortOptions, setSortOptions] = useDraftState<SortOption[]>("workflow.sortOptions", []);
  const [showPostProcess, setShowPostProcess] = useState(true);
  const [overlapThreshold, setOverlapThreshold] = useDraftState("workflow.overlapThreshold", 0);

  
  // Post-processing feature states
  const [enableBasicFilter, setEnableBasicFilter] = useDraftState("workflow.enableBasicFilter", true);
  const [enableAvoidOtp, setEnableAvoidOtp] = useDraftState("workflow.enableAvoidOtp", false);
  const [enableEqualSpace, setEnableEqualSpace] = useDraftState("workflow.enableEqualSpace", false);
  const [enableRemoveOverlap, setEnableRemoveOverlap] = useDraftState("workflow.enableRemoveOverlap", false);
  const [enableSorting, setEnableSorting] = useDraftState("workflow.enableSorting", true);
  
  // avoid_otp configuration interface
  interface AvoidOtpConfig {
    [targetName: string]: {
      target_regions: string;
      density_thresh: number;
    };
  }
  const [avoidOtpConfig, setAvoidOtpConfig] = useDraftState<AvoidOtpConfig>("workflow.avoidOtpConfig", {});
  
  // equal_space configuration interface
  interface EqualSpaceConfig {
    [targetName: string]: {
      number_desired: number;
    };
  }
  const [equalSpaceConfig, setEqualSpaceConfig] = useDraftState<EqualSpaceConfig>("workflow.equalSpaceConfig", {});
  
  // Helper function to check if current probe structure is DNA
  const isCurrentProbeDna = (): boolean => {
    return selectedCustomType ? getProbeType(selectedCustomType) === 'DNA' : false;
  };
  
  // Helper function to check if OTP and Equal Space should be enabled for current probe structure
  const shouldEnableDnaFeatures = (): boolean => {
    return isCurrentProbeDna();
  };
  
  // Helper function: get current target list
  const getCurrentTargets = () => {
    return targetList.map(item => item.target).filter(target => target.trim() !== '');
  };
  
  // Helper function: initialize avoid_otp configuration
  const initializeAvoidOtpConfig = () => {
    const targets = getCurrentTargets();
    const newConfig: AvoidOtpConfig = {};
    targets.forEach(target => {
      if (!avoidOtpConfig[target]) {
        newConfig[target] = {
          target_regions: target, // Default to target name
          density_thresh: 1e-5
        };
      } else {
        newConfig[target] = avoidOtpConfig[target];
      }
    });
    setAvoidOtpConfig(newConfig);
  };
  
  // Helper function: initialize equal_space configuration
  const initializeEqualSpaceConfig = () => {
    const targets = getCurrentTargets();
    const newConfig: EqualSpaceConfig = {};
    targets.forEach(target => {
      if (!equalSpaceConfig[target]) {
        newConfig[target] = {
          number_desired: 1000
        };
      } else {
        newConfig[target] = equalSpaceConfig[target];
      }
    });
    setEqualSpaceConfig(newConfig);
  };
  
  // Function to validate barcode length
  const validateBarcodeLength = (barcode: string, expectedLength: number): boolean => {
    return barcode.length === expectedLength;
  };

  // Function to auto-generate barcode based on config with length validation
  const generateBarcode = async (expectedLength: number, generationType: 'quick' | 'pcr' | 'sequencing' = 'quick'): Promise<string> => {

    try {

      let generatedBarcode = '';
      
      // Call appropriate API based on generation type
      switch (generationType) {
        case 'quick':
          const quickResult = await ApiService.generateQuickBarcode({
            num_barcodes: 1,
            length: expectedLength,
            alphabet: 'ACTG',
            rc_free: true,
            gc_limits: [40, 60]
          });
          generatedBarcode = quickResult[0];
          break;
          
        case 'pcr':
          const pcrResult = await ApiService.generatePcrBarcode({
            num_barcodes: 1,
            length: expectedLength
          });
          generatedBarcode = pcrResult[0];
          break;
          
        case 'sequencing':
          const seqResult = await ApiService.generateSequencingBarcode({
            num_barcodes: 1,
            length: expectedLength
          });
          generatedBarcode = seqResult[0];
          break;
          
        default:
          throw new Error(`Unsupported generation type: ${generationType}`);
      }

      // Validate barcode length
      if (!validateBarcodeLength(generatedBarcode, expectedLength)) {
        throw new Error(`Generated barcode length (${generatedBarcode.length}) does not match expected length (${expectedLength})`);
      }

      return generatedBarcode;
    } catch (error) {
      console.error('Failed to generate barcode via API:', error);
      
      // Show error to user with option to retry
      setAlert(true, `Barcode generation failed: ${error instanceof Error ? error.message : String(error)}。Please regenerate or input manually。`, 'error');
      
      // Fallback to local generation if API fails
      const bases = ['A', 'T', 'G', 'C'];
      // Use the same expectedLength calculation as above for consistency
      let fallbackLength = expectedLength;
      let sequence = '';
      for (let i = 0; i < fallbackLength; i++) {
        sequence += bases[Math.floor(Math.random() * bases.length)];
      }
      
      // Validate fallback barcode
      if (!validateBarcodeLength(sequence, fallbackLength)) {
        setAlert(true, `Fallback barcode length validation failed. Please manually enter barcode of length ${fallbackLength}.`, 'error');
        return '';
      }
      
      return sequence;
    }
  };

  // Add loading state for barcode generation
  const [generatingBarcodes, setGeneratingBarcodes] = useState<{[key: string]: boolean}>({});
  const [barcodeGeneration, setBarcodeGeneration] = useState<{ itemIndex: number; barcodeKey: string } | null>(null);
  const [generationLength, setGenerationLength] = useState('12');

  const openBarcodeGeneration = (itemIndex: number, barcodeKey: string) => {
    setGenerationLength(String(getExpectedBarcodeLength(barcodeKey) ?? 12));
    setBarcodeGeneration({ itemIndex, barcodeKey });
  };

  // Function to auto-generate barcode for specific item
  const autoGenerateBarcodeForItem = async (itemIndex: number, barcodeKey: string, length: number) => {
    const loadingKey = `target_${itemIndex}_${barcodeKey}`;
    setGeneratingBarcodes(prev => ({ ...prev, [loadingKey]: true }));
    
    try {
      const newBarcode = await generateBarcode(length, 'quick');
      
      if (newBarcode) {
        updateTarget(itemIndex, barcodeKey as keyof Target, newBarcode);
        setAlert(true, 'Barcode generated successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to generate barcode:', error);
      setAlert(true, `Barcode generated failed. Please try again or manually input.`, 'error');
    } finally {
      setGeneratingBarcodes(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const validateManualBarcode = (barcode: string, barcodeKey: string): boolean => {
    const length = getExpectedBarcodeLength(barcodeKey);
    return /^[ACGT]+$/.test(barcode) && (length === undefined || barcode.length === length);
  };

  const importBarcodeLibrary = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: header => header.replace(/^\uFEFF/, '').trim(),
      complete: results => {
        try {
          if (results.errors.length) throw new Error(results.errors[0].message);
          const fields = results.meta.fields || [];
          if (fields.length !== 2 || !fields.includes('name') || !fields.includes('sequence')) {
            throw new Error('CSV must contain exactly two columns: name,sequence');
          }
          if (!results.data.length) throw new Error('Barcode library is empty');
          const names = new Set<string>();
          const entries = results.data.map((row, index) => {
            const name = row.name.trim();
            const sequence = row.sequence.trim().toUpperCase();
            if (!name || !/^[ACGT]+$/.test(sequence)) throw new Error(`Row ${index + 2}: name and a valid A/C/G/T sequence are required`);
            if (names.has(name)) throw new Error(`Row ${index + 2}: duplicate name "${name}"`);
            names.add(name);
            return { name, sequence };
          });
          setBarcodeLibrary(entries);
          setAlert(true, `Imported ${entries.length} barcodes. Existing target values are preserved.`, 'success');
        } catch (error) {
          setAlert(true, error instanceof Error ? error.message : 'Could not import barcode library', 'error');
        }
      },
      error: error => setAlert(true, error.message, 'error')
    });
  };

  const downloadBarcodeTemplate = () => {
    const url = URL.createObjectURL(new Blob(['name,sequence\nBC001,ATCGATCGATCG\nBC002,TGCATGCATGCA\n'], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'barcode-library-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper function to get expected barcode length
  const getExpectedBarcodeLength = (barcodeKey: string): number | undefined => {
    const config = selectedCustomType?.barcodeConfig;
    const length = config?.barcodes?.[barcodeKey]?.length ?? config?.default_length;
    return typeof length === 'number' && Number.isInteger(length) && length > 0 ? length : undefined;
  };

  const {
    // State
    taskName,
    probeType,
    species,
    targetList,
    minLength,
    step,
    selectedCustomType,
    isSubmitting,
    progress,
    alertOpen,
    alertMessage,
    alertSeverity,
    
    // Actions
    setTaskName,
    setProbeType,
    setSpecies,
    setTargetList,
    addTarget,
    removeTarget,
    updateTarget,
    setMinLength,
    setStep,
    setSelectedCustomType,
    setAlert,
    setSubmitting,
    setProgress,
  } = useDesignStore();

  const navigate = useNavigate();
  const handoffConsumed = useRef(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('template');
    if (requested) setProbeType(requested);
  }, [setProbeType]);




  // Fetch species options on mount
  useEffect(() => {
    const fetchSpeciesOptions = async () => {
      try {
        const speciesResponse = await ApiService.getSpeciesOptions();
        setSpeciesOptions(speciesResponse);
      } catch (error) {
        console.error('Error fetching species options:', error);
      }
    };
    fetchSpeciesOptions();
  }, []);

  const loadCustomProbeTypes = async () => {
    setIsLoadingCustomTypes(true);
    try {
      // Load custom types from API
      const savedGroups = await ApiService.getCustomProbes();
      const customTypes = savedGroups
        .filter((group: any) => group.type === 'custom')
        .map((group: any) => {
          const parameters = extractParametersFromYaml(group.yamlContent);
          
          let targetConfig: any = undefined;
          if (parameters?.target_sequence) {
            targetConfig = {
              source: parameters.target_sequence.source,
              sequence: parameters.target_sequence.sequence,
              length: parameters.target_sequence.length,
              layout: parameters.target_sequence.layout,
              attributes: parameters.target_sequence.attributes || {}
            };
          }

          return {
            id: group.id,
            name: group.name,
            type: 'custom',
            yamlContent: group.yamlContent,
            createdAt: new Date(group.createdAt),
            updatedAt: new Date(group.updatedAt),
            barcodeCount: group.barcodeCount,
            targetLength: group.targetLength,
            step: parameters?.step ?? group.step,
            probes: group.probes || {},
            targetConfig: targetConfig,
          };
        });
      setCustomProbeTypes(customTypes);

      // Load builtin types from API
      try {
        const builtinData = await ApiService.getBuiltinProbes();
        const builtinTypes: CustomProbeType[] = [];
        
        for (const [name, config] of Object.entries(builtinData)) {
          const typedConfig = config as any;
          
          // Parse target config
          const targetLength = typedConfig.extracts?.target_region?.length || 100;
          const step = samplingStep(typedConfig.extracts?.target_region || { length: targetLength });
          const source = typedConfig.extracts?.target_region?.source || 'exon';
          
          const targetConfig: any = {
            source: source,
            sequence: '',
            length: targetLength,
            layout: typedConfig.extracts?.target_region?.layout,
            attributes: {}
          };
          
          // Parse probes
          const probes = JSON.parse(JSON.stringify(typedConfig.probes || {}));
          
          // Parse attributes and distribute them
          const attributes = JSON.parse(JSON.stringify(typedConfig.attributes || {}));
          
          const filters: Record<string, WorkflowFilter> = typedConfig.post_process?.filters || {};
          const filterValues: Record<string, AttributeFilter> = {};
          for (const [name, attr] of Object.entries(attributes)) {
            filterValues[name] = parseAttributeFilter(name, (attr as any).type, filters[name]?.condition);
          }
          const defaultValues: Record<string, Partial<AttributeValue>> = {
            mappedGenes: { aligner: 'bowtie2', enabled: true },
            kmerCount: { kmer_len: 35, aligner: 'jellyfish', enabled: true },
            mappedSites: { aligner: 'bowtie2', enabled: true }
          };

          const typeToNameMapping: Record<string, string> = {
            'gc_content': 'gcContent',
            'fold_score': 'foldScore',
            'annealing_temperature': 'tm',
            'self_match': 'selfMatch',
            'mapped_genes': 'mappedGenes',
            'kmer_count': 'kmerCount',
            'mapped_sites': 'mappedSites'
          };

          const sortFieldAliases: Record<string, { category: string; field: string }> = {
            n_trans: { category: 'Sequence Metadata', field: 'n_trans' }
          };

          for (const [attrKey, attrVal] of Object.entries(attributes)) {
            const typedAttrVal = attrVal as any;
            const target = typedAttrVal.target;
            const attrType = typedAttrVal.type;
            const uiAttrName = typeToNameMapping[attrType] || attrType;
            sortFieldAliases[attrKey] = {
              category: target === 'target_region' ? 'Target Sequence' : target.includes('.') ? 'Part Attributes' : 'Probe Attributes',
              field: attrKey
            };
            
            const attrObj = {
              ...defaultValues[uiAttrName],
              ...typedAttrVal,
              ...filterValues[attrKey],
              enabled: true
            };
            delete attrObj.target;
            delete attrObj.type;

            if (target === 'target_region') {
              targetConfig.attributes[uiAttrName] = attrObj;
            } else if (target.includes('.')) {
              // Part attribute (e.g. mRNA.part1)
              const [probeName, partName] = target.split('.');
              if (probes[probeName] && probes[probeName].parts && probes[probeName].parts[partName]) {
                if (!probes[probeName].parts[partName].attributes) {
                  probes[probeName].parts[partName].attributes = {};
                }
                probes[probeName].parts[partName].attributes[uiAttrName] = attrObj;
              }
            } else {
              // Probe attribute (e.g. pad_probe)
              if (probes[target]) {
                if (!probes[target].attributes) {
                  probes[target].attributes = {};
                }
                probes[target].attributes[uiAttrName] = attrObj;
              }
            }
          }

          // Calculate barcode count
          let barcodeCount = 0;
          const barcodeSet = new Set<string>();
          
          const findBarcodes = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            
            if (obj.expr && typeof obj.expr === 'string' && obj.expr.includes('encoding')) {
              const barcodeMatch = obj.expr.match(/\['([^']+)'\]/);
              if (barcodeMatch) {
                barcodeSet.add(barcodeMatch[1]);
              }
            }
            
            if (obj.parts) {
              Object.values(obj.parts).forEach(part => findBarcodes(part));
            }
          };

          Object.values(probes).forEach((probe: any) => {
            findBarcodes(probe);
          });
          
          barcodeCount = barcodeSet.size;

          // Generate dummy YAML content for submission compatibility
          const yamlObj = {
            name: name,
            extracts: typedConfig.extracts,
            probes: typedConfig.probes,
            attributes: typedConfig.attributes,
            post_process: typedConfig.post_process
          };
          const yamlContent = YAML.stringify(yamlObj);

          const sortDefaults: SortOption[] = [];
          const seenSortFields = new Set<string>();
          for (const [key, order] of [['is_ascending', 'asc'], ['is_descending', 'desc']] as const) {
            const configured = typedConfig.post_process?.sorts?.[key];
            const fields = typeof configured === 'string' ? [configured] : configured;
            if (!Array.isArray(fields)) continue;
            for (const name of fields) {
              if (typeof name !== 'string') continue;
              const resolved = sortFieldAliases[name] || Object.values(sortFieldAliases).find(item => item.field === name);
              if (!resolved || seenSortFields.has(resolved.field)) continue;
              seenSortFields.add(resolved.field);
              sortDefaults.push({ ...resolved, order });
            }
          }

          builtinTypes.push({
            id: `builtin_${name}`,
            name: name,
            type: 'builtin',
            sortDefaults,
            extraFilters: Object.fromEntries(Object.entries(filters).filter(([key]) => !(key in attributes) || String(attributes[key]?.target || '').startsWith('target_parts.'))),
            barcodeConfig: extractParametersFromYaml(YAML.stringify(typedConfig))?.barcodeConfig,
            yamlContent: yamlContent,
            createdAt: new Date(),
            updatedAt: new Date(),
            barcodeCount: barcodeCount,
            targetLength: targetLength,
            step: step,
            probes: probes,
            targetConfig: targetConfig,
          });
        }
        setBuiltinProbeTypes(builtinTypes);
      } catch (err) {
        console.error('Error loading builtin probe structures:', err);
      }

    } catch (error) {
      console.error('Error loading custom probe structures:', error);
    } finally {
      setIsLoadingCustomTypes(false);
    }
  };

  const [partEditor, setPartEditor] = useState<{ probe: string; before?: string; name: string; expr: string } | null>(null);
  const [partEditError, setPartEditError] = useState('');
  const savePartEdit = () => {
    if (!partEditor || !selectedCustomType?.probes) return;
    try {
      const { probe, before, name, expr } = partEditor;
      const probes = editProbePart(selectedCustomType.probes, probe, before, name, expr);
      const seed = YAML.parse(selectedCustomType.yamlContent);
      const updatedSeed = before && before !== name ? rewritePartReferences(seed, probe, before, name) : seed;
      updatedSeed.probes = probes;
      setSelectedCustomType({ ...selectedCustomType, probes, yamlContent: YAML.stringify(updatedSeed) });
      setPartEditor(null); setPartEditError('');
    } catch (error) { setPartEditError(String(error)); }
  };
  const [lengthInput, setLengthInput] = useState('40');
  useEffect(() => { setLengthInput(formatTargetLength(minLength)); }, [minLength]);

  // Add this useEffect to load custom probe structures
  useEffect(() => {
    loadCustomProbeTypes();
  }, []);

  const selectTemplate = (type: CustomProbeType) => {
    const parsed = YAML.parse(type.yamlContent);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid probe template');
    const restored = type.type === 'builtin' ? type : { ...type, ...restoreTemplate(parsed), barcodeConfig: extractParametersFromYaml(type.yamlContent)?.barcodeConfig };
    setSelectedCustomType(restored);
    setMinLength(restored.targetConfig?.length ?? restored.targetLength ?? 100);
    setStep(samplingStep({ ...(parsed.extracts?.target_region || parsed.target_sequence || {}), length: restored.targetConfig?.length ?? restored.targetLength ?? 100, step: restored.step }));
  };
  useEffect(() => {
    if (isLoadingCustomTypes || !probeType) return;
    const type = [...builtinProbeTypes, ...customProbeTypes].find(item => item.name === probeType);
    const handoff = new URLSearchParams(window.location.search).get('template');
    if (type && (selectedCustomType?.id !== type.id || (handoff === type.name && !handoffConsumed.current))) {
      try { selectTemplate(type); handoffConsumed.current = true; } catch (error) { setAlert(true, String(error), 'error'); }
    }
  }, [isLoadingCustomTypes, probeType, customProbeTypes, builtinProbeTypes]);

  useEffect(() => {
    if (selectedCustomType?.probes) {
      const allProbesExpanded: Record<string, boolean> = {};
      for (const probeName of Object.keys(selectedCustomType.probes)) {
        allProbesExpanded[probeName] = true;
      }
      setExpandedProbes(allProbesExpanded);
    }
  }, [selectedCustomType?.id]);

  const handleResetTargetList = () => {
    setTargetList([{ target: '', sequence: '' }]);


    setGeneratingBarcodes({});
    setAlert(true, 'Target list has been reset', 'success');
  };

  const handleTargetCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Reset file input
      event.target.value = '';
      
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true, // omit blank lines when parsing CSV
        complete: (results: Papa.ParseResult<Record<string, string>>) => {
          try {
            if (results.data.length === 0) {
              throw new Error('File is empty');
            }

            // Get all column names from the first row
            const headers = Object.keys(results.data[0]);
            const barcodeColumns = headers.filter(h => h.startsWith('barcode'));
            
            const parsedData = results.data.map((row, index) => {
              // Validate required fields
              if (!row['target']) {
                throw new Error(`Row ${index + 2}: Missing required field 'target'`);
              }

              // Create the target object with target name
              const targetObj: any = { target: row['target'] };
              
              // Add sequence field if exists
              if (row['sequence']) {
                targetObj.sequence = row['sequence'];
              }
              
              // Add barcode fields
              if (selectedCustomType?.barcodeCount) {
                for (let i = 1; i <= selectedCustomType.barcodeCount; i++) {
                  const barcodeKey = `barcode${i}`;
                  // Check if the barcode exists in the file
                  if (barcodeColumns.includes(barcodeKey)) {
                    targetObj[barcodeKey] = row[barcodeKey] || '';
                  } else {
                    targetObj[barcodeKey] = '';
                  }
                }
              }

              return targetObj;
            });
            setTargetList(parsedData);
            setAlert(true, 'Target list uploaded successfully', 'success');
          } catch (error) {
            setAlert(true, error instanceof Error ? error.message : 'Error parsing target list file', 'error');
          }
        },
        error: (error: Error) => {
          setAlert(true, `Error parsing file: ${error.message}`, 'error');
        }
      });
    }
  };



  const handleAlertClose = (_?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setAlert(false, '', 'success');
  };

  // Modify the handleProbeTypeSelect function
  const handleProbeTypeSelect = (type: string) => {
    setProbeType(type);
    setShowCustomProbeTypes(false);
    
    // Reset barcode modes when changing probe structure


    setGeneratingBarcodes({});
    
    // The selection effect loads both built-in and custom templates.
    if (![...builtinProbeTypes, ...customProbeTypes].some(item => item.name === type)) setSelectedCustomType(null);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Function to handle downloading YAML content
  const handleDownload = (type: CustomProbeType) => {
    const blob = new Blob([type.yamlContent], { type: 'text/yaml' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type.name}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Function to handle deleting a custom probe structure
  const handleDelete = async (typeId: string) => {
    try {
      await ApiService.deleteCustomProbe(typeId);
      loadCustomProbeTypes();
      setAlert(true, 'Custom probe structure deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete custom probe:', error);
      setAlert(true, 'Failed to delete custom probe structure', 'error');
    }
  };

  // Add new function to handle attribute editing
  const handleEditAttribute = (attribute: Partial<AttributeValue>) => {
    const updatedAttribute: AttributeValue = {
      name: attribute.name || '',
      min: attribute.min || 0,
      max: attribute.max || 100,
      threshold: attribute.threshold,
      aligner: attribute.aligner as 'blast' | 'bowtie2' | 'mmseqs2' | 'jellyfish' | undefined,
      enabled: true
    };
    setEditingAttribute(updatedAttribute);
    setShowEditAttributeDialog(true);
  };

  // Add new function to save edited attribute
  const handleSaveAttribute = () => {
    if (!editingAttribute) return;

    const updatedType = { ...selectedCustomType };
    if (currentAttributeType === 'target') {
      if (!updatedType.targetConfig) {
        updatedType.targetConfig = {
          source: '',
          sequence: '',
          length: updatedType.targetLength || 0,
          attributes: {}
        };
      }
      if (!updatedType.targetConfig.attributes) {
        updatedType.targetConfig.attributes = {};
      }
      updatedType.targetConfig.attributes[editingAttribute.name] = {
        ...editingAttribute,
        enabled: true
      };
    } else if (currentAttributeType === 'probe') {
      if (!updatedType.probes?.[currentProbeName]?.attributes) {
        if (!updatedType.probes) updatedType.probes = {};
        if (!updatedType.probes[currentProbeName]) updatedType.probes[currentProbeName] = { 
          template: '',
          parts: {} 
        };
        updatedType.probes[currentProbeName].attributes = {};
      }
      updatedType.probes[currentProbeName].attributes![editingAttribute.name] = {
        ...editingAttribute,
        enabled: true
      };
    } else if (currentAttributeType === 'part') {
      if (!updatedType.probes?.[currentProbeName]?.parts?.[currentPartName]?.attributes) {
        if (!updatedType.probes) updatedType.probes = {};
        if (!updatedType.probes[currentProbeName]) updatedType.probes[currentProbeName] = { 
          template: '',
          parts: {} 
        };
        if (!updatedType.probes[currentProbeName].parts) updatedType.probes[currentProbeName].parts = {};
        if (!updatedType.probes[currentProbeName].parts[currentPartName]) {
          updatedType.probes[currentProbeName].parts[currentPartName] = { 
            expr: '',
            attributes: {} 
          };
        }
        updatedType.probes[currentProbeName].parts[currentPartName].attributes = {};
      }
      updatedType.probes[currentProbeName].parts[currentPartName].attributes![editingAttribute.name] = {
        ...editingAttribute,
        enabled: true
      };
    }

    setSelectedCustomType(updatedType as CustomProbeType);
    setShowEditAttributeDialog(false);
    setEditingAttribute(null);
  };

  // Modify the handleAddAttribute function
  const handleAddAttribute = (attributeId: string) => {
    const defaultValues: Record<string, Partial<AttributeValue>> = {
      length: { enabled: true, filterEnabled: false },
      gcContent: { min: 40, max: 60, enabled: true },
      foldScore: { max: 40, enabled: true },
      tm: { min: 60, max: 75, enabled: true },
      selfMatch: { max: 4, enabled: true },
      mappedGenes: { max: 5, aligner: 'bowtie2', enabled: true },
      kmerCount: { kmer_len: 35, aligner: 'jellyfish', enabled: true },
      mappedSites: { aligner: 'bowtie2', enabled: true }
    };

    const attributeValue = defaultValues[attributeId];
    setEditingAttribute({
      name: attributeId,
      ...attributeValue,
      enabled: true
    } as AttributeValue);
    setShowAttributeDialog(false);
    setShowEditAttributeDialog(true);
  };



  // Add new function to handle attribute click
  const handleAttributeClick = (probeName: string, partName: string | null, attrName: string, attrValue: any) => {
    setCurrentProbeName(probeName);
    if (partName) {
      setCurrentPartName(partName);
      setCurrentAttributeType('part');
    } else {
      setCurrentAttributeType('probe');
    }
    handleEditAttribute({
      name: attrName,
      ...attrValue
    });
  };

  const renderAttributeTable = (scope: 'target' | 'probe' | 'part', attributes: Record<string, any>, probeName = '', partName = '') => <AttributeTable
    attributes={attributes}
    onChange={(name, value) => {
      if (!selectedCustomType) return;
      if (scope === 'target') {
        setSelectedCustomType({ ...selectedCustomType, targetConfig: { ...selectedCustomType.targetConfig!, attributes: { ...attributes, [name]: value } } });
      } else {
        const probe = selectedCustomType.probes![probeName];
        const updated = scope === 'probe' ? { ...probe, attributes: { ...attributes, [name]: value } } :
          { ...probe, parts: { ...probe.parts, [partName]: { ...probe.parts![partName], attributes: { ...attributes, [name]: value } } } };
        setSelectedCustomType({ ...selectedCustomType, probes: { ...selectedCustomType.probes, [probeName]: updated } });
      }
    }}
    onEdit={(name, value) => {
      if (scope === 'target') { setCurrentAttributeType('target'); handleEditAttribute({ name, ...value }); }
      else handleAttributeClick(probeName, scope === 'part' ? partName : null, name, value);
    }}
    onDelete={name => handleDeleteAttribute(scope, name, probeName, partName)}
  />;

  const handleAddSortOption = () => {
    setSortOptions([...sortOptions, { category: '', field: '', order: 'asc' }]);
  };

  const handleRemoveSortOption = (index: number) => {
    const newOptions = [...sortOptions];
    newOptions.splice(index, 1);
    setSortOptions(newOptions);
  };

  const handleSortOptionChange = (index: number, field: string, order: 'asc' | 'desc') => {
    const newOptions = [...sortOptions];
    newOptions[index] = { ...newOptions[index], field, order };
    setSortOptions(newOptions);
  };

  const handleOverlapThresholdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOverlapThreshold(Number(event.target.value));
  };

  const getAvailableSortFields = (): SortCategory[] => {
    if (!selectedCustomType) return [];

    const categories: SortCategory[] = [{
      category: 'Sequence Metadata', icon: '📋',
      fields: [{ value: 'n_trans', label: 'Transcript Count' }]
    }];
    
    if (selectedCustomType.targetConfig?.attributes) {
      const targetFields: SortField[] = [];
      Object.entries(selectedCustomType.targetConfig.attributes).forEach(([key, value]) => {
        if (value.enabled) {
          const fieldLabel = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
          targetFields.push({
            value: value.originalName || `target_${getSnakeCaseAttrName(key)}`,
            label: fieldLabel
          });
        }
      });
      if (targetFields.length > 0) {
        categories.push({
          category: 'Target Sequence',
          icon: '🎯',
          fields: targetFields
        });
      }
    }

    // Add probe attributes
    if (selectedCustomType.probes) {
      const probeFields: SortField[] = [];
      Object.entries(selectedCustomType.probes).forEach(([probeName, probe]) => {
        const formattedProbeName = /^\d+$/.test(probeName) ? `probe${parseInt(probeName) + 1}` : probeName;
        
        if (probe.attributes) {
          Object.entries(probe.attributes).forEach(([key, value]) => {
            if (value.enabled) {
              const fieldLabel = `${formatProbeName(probeName)} - ${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}`;
              probeFields.push({
                value: value.originalName || `${formattedProbeName}_${getSnakeCaseAttrName(key)}`,
                label: fieldLabel
              });
            }
          });
        }
      });
      if (probeFields.length > 0) {
        categories.push({
          category: 'Probe Attributes',
          icon: '🧬',
          fields: probeFields
        });
      }

      // Add probe part attributes
      const partFields: SortField[] = [];
      Object.entries(selectedCustomType.probes).forEach(([probeName, probe]) => {
        const formattedProbeName = /^\d+$/.test(probeName) ? `probe${parseInt(probeName) + 1}` : probeName;
        
        if (probe.parts) {
          Object.entries(probe.parts).forEach(([partName, part]) => {
            const formattedPartName = /^\d+$/.test(partName) ? `part${parseInt(partName) + 1}` : partName;
            
            if (part.attributes) {
              Object.entries(part.attributes).forEach(([key, value]) => {
                if (value.enabled) {
                  const fieldLabel = `${formatProbeName(probeName)} - ${formatPartName(partName)} - ${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}`;
                  partFields.push({
                    value: value.originalName || `${formattedProbeName}_${formattedPartName}_${getSnakeCaseAttrName(key)}`,
                    label: fieldLabel
                  });
                }
              });
            }
          });
        }
      });
      if (partFields.length > 0) {
        categories.push({
          category: 'Part Attributes',
          icon: '🔬',
          fields: partFields
        });
      }
    }

    return categories;
  };

  const [draftTemplateId, setDraftTemplateId] = useDraftState<string | undefined>('workflow.templateId', undefined);
  const defaultsTemplate = useRef(draftTemplateId);
  // Load defaults only when the type changes, preserving subsequent user edits.
  useEffect(() => {
    if (defaultsTemplate.current === selectedCustomType?.id) return;
    const defaults = selectedCustomType?.sortDefaults || [];
    setSortOptions(defaults.map(option => ({ ...option })));
    setEnableSorting(defaults.length > 0);
    setBarcodeGeneration(null);
  }, [selectedCustomType?.id, selectedCustomType?.sortDefaults]);

  // Missing remove_overlap means disabled, matching the backend configuration.
  useEffect(() => {
    if (defaultsTemplate.current === selectedCustomType?.id) return;
    const config = selectedCustomType?.yamlContent ? YAML.parse(selectedCustomType.yamlContent) : null;
    const removeOverlap = config?.post_process?.remove_overlap;
    setEnableRemoveOverlap(!!removeOverlap && typeof removeOverlap === 'object');
    if (typeof removeOverlap?.location_interval === 'number') {
      setOverlapThreshold(removeOverlap.location_interval);
    }
  }, [selectedCustomType?.id]);

  // when probe structure changes, update DNA-specific features
  useEffect(() => {
    if (defaultsTemplate.current === selectedCustomType?.id) return;
    defaultsTemplate.current = selectedCustomType?.id;
    setDraftTemplateId(selectedCustomType?.id);
    const isDnaProbe = shouldEnableDnaFeatures();
    if (isDnaProbe) {
      // DNA probe: enable OTP and Equal Space by default
      setEnableAvoidOtp(true);
      setEnableEqualSpace(true);
    } else {
      // RNA probe: disable OTP and Equal Space
      setEnableAvoidOtp(false);
      setEnableEqualSpace(false);
    }
  }, [selectedCustomType?.id]);

  const getActiveSteps = () => {
    const errors = validateForm();
    const targetErrors = errors.filter(error => error.startsWith('please add at least') || error.startsWith('some target barcodes'));
    const parameterErrors = errors.filter(error => !targetErrors.includes(error) && error !== 'please select species' && error !== 'please select probe structure');
    return [
      { id: 'species', label: 'Species', summary: species || 'Select a genome', completed: !!species, optional: false },
      { id: 'probeType', label: 'Probe Structure', summary: selectedCustomType?.name || probeType || 'Select a probe structure', completed: !!probeType, optional: false },
      ...(selectedCustomType ? [{ id: 'parameters', label: 'Probe Parameters', summary: parameterErrors.length ? 'Configuration needed' : `${formatTargetLength(minLength)} bp · step ${step}`, completed: !parameterErrors.length, optional: false }] : []),
      { id: 'geneMap', label: 'Targets', summary: `${targetList.filter(target => target.target.trim()).length} targets${targetErrors.length ? ' · incomplete' : ''}`, completed: !targetErrors.length, optional: false },
      { id: 'postProcessing', label: 'Post Processing', summary: [enableBasicFilter && 'Filtering', enableAvoidOtp && 'Avoid OTP', enableEqualSpace && 'Equal spacing'].filter(Boolean).join(' · ') || 'Default', completed: true, optional: true },
      { id: 'taskName', label: 'Task Name', summary: taskName.trim() || 'Auto-generated', completed: true, optional: true }
    ];
  };

  const jumpToSection = (id: string) => {
    setActiveSection(id);
    setExpandedSections(previous => ({ ...previous, [id === 'parameters' ? 'probeType' : id]: true }));
    if (id === 'postProcessing') setShowPostProcess(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      document.getElementById(`design-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }, 350);
  };

  // Helper function to filter out disabled attributes
  const removeDisabledAttributes = (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const filtered: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && 'enabled' in value) {
        if (value.enabled) {
          const { enabled, ...rest } = value;
          filtered[key] = rest;
        }
      } else {
        filtered[key] = removeDisabledAttributes(value);
      }
    }
    return filtered;
  };

  // Helper function to remove attributes recursively
  const removeAttributes = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => removeAttributes(item));
    }
    
    const filtered: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'attributes' && key !== 'target_sequence' && key !== 'barcodes') {
        filtered[key] = removeAttributes(value);
      }
    }
    return filtered;
  };

  const extractAttributes = (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const filtered: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip the fields we want to remove
      if (key === 'id' || key === 'sequence' || key === 'source' ||
          key === 'isReverseComplement' || key === 'sourceProbeId' ||
          key === 'sourceStartPos' || key === 'sourceEndPos' ||
          key === 'isComplete' || key ==='startPos' || key ==='endPos') {
        continue;
      }
      
      // Recursively process nested objects
      if (typeof value === 'object' && value !== null) {
        filtered[key] = extractAttributes(value);
      } else {
        filtered[key] = value;
      }
    }
    return filtered;
  };

  // Function to convert probe/part keys to match the YAML format
  const convertToYamlFormat = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      let newKey = key;
      
      // Convert probe names: "0", "1", "2" -> "probe_1", "probe_2", "probe_3"
      if (/^\d+$/.test(key) && value && typeof value === 'object' && 'parts' in value) {
        newKey = `probe_${parseInt(key) + 1}`;
      }
      
      // Process nested objects
      if (typeof value === 'object' && value !== null) {
        const convertedValue: any = {};
        
        // Handle probe object with parts
        if ('parts' in value && value.parts) {
          convertedValue.parts = {};
          for (const [partKey, partValue] of Object.entries(value.parts as any)) {
            // Convert part names: "0", "1", "2" -> "part1", "part2", "part3"
            const newPartKey = /^\d+$/.test(partKey) ? `part${parseInt(partKey) + 1}` : partKey;
            convertedValue.parts[newPartKey] = convertToYamlFormat(partValue);
          }
          
          // Handle other probe properties
          for (const [propKey, propValue] of Object.entries(value)) {
            if (propKey !== 'parts') {
              convertedValue[propKey] = convertToYamlFormat(propValue);
            }
          }
        } else {
          // Regular nested object
          Object.assign(convertedValue, convertToYamlFormat(value));
        }
        
        converted[newKey] = convertedValue;
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  };

  // Helper function to map attribute names to types

  const getSnakeCaseAttrName = (attrName: string): string => {
    const mapping: Record<string, string> = {
      'gcContent': 'gc_content',
      'foldScore': 'fold_score',
      'tm': 'tm',
      'selfMatch': 'self_match',
      'mappedGenes': 'mapped_genes',
      'kmerCount': 'kmer_count',
      'mappedSites': 'mapped_sites'
    };
    return mapping[attrName] || attrName;
  };

  const getEditingFilterName = () => {
    if (editingAttribute?.originalName) return editingAttribute.originalName;
    const attribute = getSnakeCaseAttrName(editingAttribute?.name || 'attribute');
    if (currentAttributeType === 'target') return `target_${attribute}`;
    const probe = /^\d+$/.test(currentProbeName) ? `probe${parseInt(currentProbeName) + 1}` : currentProbeName;
    if (currentAttributeType === 'probe') return `${probe}_${attribute}`;
    const part = /^\d+$/.test(currentPartName) ? `part${parseInt(currentPartName) + 1}` : currentPartName;
    return `${probe}_${part}_${attribute}`;
  };

  // Helper function to generate automatic task name
  const generateAutoTaskName = () => {
    const probeName = selectedCustomType?.name || probeType || 'probe';
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    return `${probeName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')}_${timestamp}`;
  };

  // Helper function to validate form before submission
  const validateForm = () => {
    const errors: string[] = [];
    
    if (!species) {
      errors.push('please select species');
    }
    
    if (!probeType) {
      errors.push('please select probe structure');
    }
    
    const hasValidTargets = targetList.some(item => item.target.trim() !== '');
    if (!hasValidTargets) {
      errors.push('please add at least one target');
    }
    
    if (!selectedCustomType?.targetConfig?.source) {
      errors.push('please select a Source Type for the Target Sequence in the custom probe configuration');
    }

    if (!Number.isSafeInteger(step) || step <= 0) {
      errors.push('please specify a positive integer Step for the Target Sequence Configuration');
    }

    try { parseTargetLength(lengthInput); } catch (error) { errors.push(String(error)); }

    const layoutError = validateTargetLayout(selectedCustomType?.targetConfig?.layout, minLength);
    if (layoutError) errors.push(layoutError);

    // Check if barcode fields are filled and have correct length when required
    if (selectedCustomType?.barcodeCount) {
      const targetsWithInvalidBarcodes = targetList.filter(item => {
        if (item.target.trim() === '') return false;
        
        for (let i = 1; i <= selectedCustomType.barcodeCount; i++) {
          const barcodeKey = `barcode${i}`;
          const barcodeValue = (item as any)[barcodeKey];
          
          // Check if barcode is missing when required
          if (!barcodeValue) {
            return true;
          }
          
          // Check barcode length validation for non-builtin modes
          if (barcodeValue && !validateManualBarcode(barcodeValue, barcodeKey)) {
            return true;
          }
        }
        return false;
      });
      
      if (targetsWithInvalidBarcodes.length > 0) {
        errors.push('some target barcodes are missing or have incorrect length, please check the barcode configuration');
      }
    }
    
    // Validate attributes
    if (selectedCustomType) {
      const validateAttrs = (attrs: any, context: string) => {
        if (!attrs) return;
        Object.entries(attrs).forEach(([attrName, attrValue]: [string, any]) => {
          if (attrValue.enabled) {
            if (attrValue.filterEnabled !== false && attrValue.filterExpression === undefined) {
              for (const bound of ['min', 'max']) {
                if (attrValue[bound] !== undefined && !Number.isFinite(Number(attrValue[bound]))) {
                  errors.push(`${context}: ${attrName} has an invalid ${bound}.`);
                }
              }
              if (attrValue.min !== undefined && attrValue.max !== undefined && Number(attrValue.min) > Number(attrValue.max)) {
                errors.push(`${context}: ${attrName} minimum exceeds maximum.`);
              }
            }
            if (((attrName === 'kmerCount' || attrName === 'kmer_count') || attrName === 'kmer_count') && (!Number.isInteger(Number(attrValue.kmer_len)) || Number(attrValue.kmer_len) < 1)) {
              errors.push(`${context}: ${attrName} requires a positive k-mer length.`);
            }

            if ((attrName === 'mappedGenes' || attrName === 'mapped_genes') || attrName === 'mapped_genes' || (attrName === 'kmerCount' || attrName === 'kmer_count') || attrName === 'kmer_count' || (attrName === 'mappedSites' || attrName === 'mapped_sites') || attrName === 'mapped_sites') {
              if (!attrValue.aligner) {
                errors.push(`${context}: ${attrName} requires an aligner.`);
              }
            }
          }
        });
      };

      validateAttrs(selectedCustomType.targetConfig?.attributes, 'Target Sequence');
      
      if (selectedCustomType.probes) {
        Object.entries(selectedCustomType.probes).forEach(([probeName, probeConfig]) => {
          validateAttrs(probeConfig.attributes, formatProbeName(probeName));
          if (probeConfig.parts) {
            Object.entries(probeConfig.parts).forEach(([partName, partConfig]) => {
              validateAttrs(partConfig.attributes, `${formatProbeName(probeName)} - ${formatPartName(partName)}`);
            });
          }
        });
      }
    }
    
    return errors;
  };

  const generateTaskConfig = () => {
    const probeName = selectedCustomType?.name || probeType;
    const finalTaskName = taskName.trim() || generateAutoTaskName();
    
    // Basic config - ordered by expected format
    const config: any = {
      name: finalTaskName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'),
      description: `Protocol for designing ${probeName} probes from species ${species}`,
      genome: species,
      targets: targetList
        .filter(item => item.target.trim() !== '')
        .map(item => {
          if (item.sequence && typeof item.sequence === 'string' && item.sequence.trim() !== '') {
            // Return as object with sequence: {targetName: 'sequence'}
            return { [item.target]: item.sequence.trim() };
          } else {
            // Return as simple string
            return item.target;
          }
        })
    };

    // Encoding config (barcode mapping)
    const targetEncoding: any = {};
    targetList.forEach(item => {
      if (item.target.trim() !== '' && selectedCustomType?.barcodeCount) {
        const targetBarcodes: any = {};
        for (let i = 1; i <= selectedCustomType.barcodeCount; i++) {
          const barcodeKey = `barcode${i}`;
          const bcKey = `BC${i}`;
          if ((item as any)[barcodeKey]) {
            targetBarcodes[bcKey] = (item as any)[barcodeKey];
          }
        }
        if (Object.keys(targetBarcodes).length > 0) {
          targetEncoding[item.target] = targetBarcodes;
        }
      }
    });
    
    
    config.encoding = targetEncoding;

    // Extraction config
    config.extracts = {
      target_region: {
        source: selectedCustomType?.targetConfig?.source || 
                (probeType === 'RCA' ? 'exon' : 
                 probeType === 'DNA-FISH' ? 'genome' : 'exon'),
        length: minLength,
        step: step,
        ...(selectedCustomType?.targetConfig?.layout ? { layout: selectedCustomType.targetConfig.layout } : {})
      }
    };
    
    // Add custom probe structure parameters if selected (probes section - third from last)
    if (selectedCustomType) {
      // Extract only the actual probe configurations from yamlContent
      const yamlContent = selectedCustomType.yamlContent;
      const yamlObj = YAML.parse(yamlContent);
      
      // Find the probes section and extract only probe configurations (probe_1, probe_2, etc.)
      let probesConfig: any = {};
      
      if (yamlObj.probes) {
        // Extract probe configurations from the probes section
        Object.entries(selectedCustomType.probes || yamlObj.probes).forEach(([key, value]) => {
          // Include all probe configurations, skip barcodes and other configs if any
          if (key !== 'barcodes' && key !== 'attributes' && key !== 'probes') {
            probesConfig[key] = removeAttributes(value);
          }
        });
      } else {
        // If no probes section, look for probe configurations at the top level
        Object.entries(yamlObj).forEach(([key, value]) => {
          if (key !== 'barcodes' && key !== 'attributes' && key !== 'extracts' && key !== 'target_sequence' && key !== 'name' && key !== 'description' && key !== 'probes') {
            probesConfig[key] = removeAttributes(value);
          }
        });
      }
      
      // Only add probes config if we found actual probe configurations
      if (Object.keys(probesConfig).length > 0) {
        config.probes = probesConfig;
      }
    }

    // Attribute config - use expected naming format
    if (selectedCustomType) {
      const attributes: any = Object.fromEntries(Object.entries(YAML.parse(selectedCustomType.yamlContent || '{}')?.attributes || {}).filter(([, value]) => String((value as any).target || '').startsWith('target_parts.')));
      
      // Target region attributes
      if (selectedCustomType.targetConfig?.attributes) {
        Object.entries(selectedCustomType.targetConfig.attributes).forEach(([attrName, attrValue]) => {
          if (attrValue.enabled) {
            const attributeKey = attrValue.originalName || `target_${getSnakeCaseAttrName(attrName)}`;
            attributes[attributeKey] = exportAttribute(attrValue, attrName, 'target_region');
          }
        });
      }
      
      // Probe attributes - use expected naming format (probe1 instead of probe_1)
      if (selectedCustomType.probes) {
        Object.entries(selectedCustomType.probes).forEach(([probeName, probeConfig]) => {
          const formattedProbeName = /^\d+$/.test(probeName) ? `probe${parseInt(probeName) + 1}` : probeName;
          
          // Probe level attributes
          if (probeConfig.attributes) {
            Object.entries(probeConfig.attributes).forEach(([attrName, attrValue]) => {
              if (attrValue.enabled) {
                const attributeKey = attrValue.originalName || `${formattedProbeName}_${getSnakeCaseAttrName(attrName)}`;
                attributes[attributeKey] = exportAttribute(attrValue, attrName, probeName);
              }
            });
          }
          
          // Part level attributes - use dot separator
          if (probeConfig.parts) {
            Object.entries(probeConfig.parts).forEach(([partName, partConfig]) => {
              const formattedPartName = /^\d+$/.test(partName) ? `part${parseInt(partName) + 1}` : partName;
              
              if (partConfig.attributes) {
                Object.entries(partConfig.attributes).forEach(([attrName, attrValue]) => {
                  if (attrValue.enabled) {
                    const attributeKey = attrValue.originalName || `${formattedProbeName}_${formattedPartName}_${getSnakeCaseAttrName(attrName)}`;
                    attributes[attributeKey] = exportAttribute(attrValue, attrName, `${probeName}.${partName}`);
                  }
                });
              }
            });
          }
        });
      }
      
      if (Object.keys(attributes).length > 0) {
        config.attributes = attributes;
      }
    }

    // Post-processing config
    const post_process: any = {};
    
    // 1. Filters
    if (enableBasicFilter && selectedCustomType) {
      const filters: any = Object.fromEntries(Object.entries(selectedCustomType.extraFilters || {}).map(([name, rule]) => [name, { ...rule }]));
      for (const rule of Object.values(filters) as WorkflowFilter[]) {
        if (rule.type !== 'sequence_pattern') continue;
        rule.exclude_patterns = rule.exclude_patterns?.map(pattern => pattern.trim()).filter(Boolean);
        if (!rule.target || !rule.exclude_patterns?.length) throw new Error('Sequence exclusions require a target and at least one pattern.');
        // Expressions are interpreted by the backend Python regex engine.
      }
      
      // Target region filtering
      if (selectedCustomType.targetConfig?.attributes) {
        Object.entries(selectedCustomType.targetConfig.attributes).forEach(([attrName, attrValue]) => {
          if (attrValue.enabled) {
            const filterName = attrValue.originalName || `target_${getSnakeCaseAttrName(attrName)}`;
            const condition = buildAttributeFilter(attrValue, filterName, attrName === 'gcContent' || attrName === 'gc_content');
            if (condition) {
              filters[filterName] = { condition };
            }
          }
        });
      }
      
      // Probe and part filtering - use expected naming format
      if (selectedCustomType.probes) {
        Object.entries(selectedCustomType.probes).forEach(([probeName, probeConfig]) => {
          const formattedProbeName = /^\d+$/.test(probeName) ? `probe${parseInt(probeName) + 1}` : probeName;
          
          if (probeConfig.attributes) {
            Object.entries(probeConfig.attributes).forEach(([attrName, attrValue]) => {
              if (attrValue.enabled) {
                const filterName = attrValue.originalName || `${formattedProbeName}_${getSnakeCaseAttrName(attrName)}`;
                const condition = buildAttributeFilter(attrValue, filterName, attrName === 'gcContent' || attrName === 'gc_content');
                if (condition) {
                  filters[filterName] = { condition };
                }
              }
            });
          }
          
          if (probeConfig.parts) {
            Object.entries(probeConfig.parts).forEach(([partName, partConfig]) => {
              const formattedPartName = /^\d+$/.test(partName) ? `part${parseInt(partName) + 1}` : partName;
              
              if (partConfig.attributes) {
                Object.entries(partConfig.attributes).forEach(([attrName, attrValue]) => {
                  if (attrValue.enabled) {
                    const filterName = attrValue.originalName || `${formattedProbeName}_${formattedPartName}_${getSnakeCaseAttrName(attrName)}`;
                    const condition = buildAttributeFilter(attrValue, filterName, attrName === 'gcContent' || attrName === 'gc_content');
                    if (condition) {
                      filters[filterName] = { condition };
                    }
                  }
                });
              }
            });
          }
        });
      }
      
      if (Object.keys(filters).length > 0) {
        post_process.filters = filters;
      }
    }
    
    // 2. Avoid off-target - modified to array format
    if (enableAvoidOtp && Object.keys(avoidOtpConfig).length > 0) {
      const avoid_otp: any = {};
      Object.entries(avoidOtpConfig).forEach(([target, config]) => {
        avoid_otp[target] = {
          target_regions: [config.target_regions], // Convert to array format
          density_thresh: config.density_thresh
        };
      });
      post_process.avoid_otp = avoid_otp;
    }
    
    // 3. Equal spacing
    if (enableEqualSpace && Object.keys(equalSpaceConfig).length > 0) {
      post_process.equal_space = equalSpaceConfig;
    }
    
    // 4. Remove overlap
    if (enableRemoveOverlap) {
      post_process.remove_overlap = {
        location_interval: overlapThreshold
      };
    }
    
    // 5. Sorting
    if (enableSorting && sortOptions.length > 0) {
      const ascFields = sortOptions.filter(opt => opt.field && opt.order === 'asc').map(opt => opt.field);
      const descFields = sortOptions.filter(opt => opt.field && opt.order === 'desc').map(opt => opt.field);
      
      if (ascFields.length > 0 || descFields.length > 0) {
        post_process.sorts = {};
        if (ascFields.length > 0) post_process.sorts.is_ascending = ascFields;
        if (descFields.length > 0) post_process.sorts.is_descending = descFields;
      }
    }
    
    config.post_process = post_process;

    // Add report config
    const summaryConfig: any = {};
    
    // Determine probe structure: DNA (source is genome) or RNA (source is not genome)
    const probeSource = selectedCustomType?.targetConfig?.source || 
                       (probeType === 'DNA-FISH' ? 'genome' : 'exon');
    const isDnaProbe = probeSource === 'genome';
    summaryConfig.report_name = isDnaProbe ? 'dna_report' : 'rna_report';
    
    // Dynamically collect all enabled attributes
    const summaryAttributes: string[] = [];
    
    // Collect target region attributes
    if (selectedCustomType?.targetConfig?.attributes) {
      Object.entries(selectedCustomType.targetConfig.attributes).forEach(([attrName, attrValue]) => {
        if (attrValue.enabled) {
          summaryAttributes.push(attrValue.originalName || `target_${getSnakeCaseAttrName(attrName)}`);
        }
      });
    }
    
    // Collect probe attributes
    if (selectedCustomType?.probes) {
      Object.entries(selectedCustomType.probes).forEach(([probeName, probeConfig]) => {
        const formattedProbeName = /^\d+$/.test(probeName) ? `probe${parseInt(probeName) + 1}` : probeName;
        
        if (probeConfig.attributes) {
          Object.entries(probeConfig.attributes).forEach(([attrName, attrValue]) => {
            if (attrValue.enabled) {
              summaryAttributes.push(attrValue.originalName || `${formattedProbeName}_${getSnakeCaseAttrName(attrName)}`);
            }
          });
        }
        
        // Collect part attributes
        if (probeConfig.parts) {
          Object.entries(probeConfig.parts).forEach(([partName, partConfig]) => {
            const formattedPartName = /^\d+$/.test(partName) ? `part${parseInt(partName) + 1}` : partName;
            
            if (partConfig.attributes) {
              Object.entries(partConfig.attributes).forEach(([attrName, attrValue]) => {
                if (attrValue.enabled) {
                  summaryAttributes.push(attrValue.originalName || `${formattedProbeName}_${formattedPartName}_${getSnakeCaseAttrName(attrName)}`);
                }
              });
            }
          });
        }
      });
    }
    
    if (summaryAttributes.length > 0) {
      summaryConfig.attributes = summaryAttributes;
    }
    
    config.summary = summaryConfig;

    return config;
  };

  const handleSubmitTask = async () => {
    try {
      // Validate form before submission
      const validationErrors = validateForm();
      if (validationErrors.length > 0) {
        setShowValidation(true);
        jumpToSection(getActiveSteps().find(step => !step.completed)?.id || 'probeType');
        setAlert(true, `please complete the following information:\n${validationErrors.join('\n')}`, 'error');
        return;
      }

      setSubmitting(true);
      setProgress(0);

      // Generate the complete task configuration
      const taskConfig = generateTaskConfig();

      // Submit the task and get the new task's ID
      const response = await ApiService.submitTask(taskConfig);
      const newTaskId = response.data?.job_id || (response as any).job_id || (response as any).id;

      // Automatically start the task
      if (newTaskId) {
        await ApiService.runTask(newTaskId);
        setAlert(true, 'Task submitted and started successfully!', 'success');
      } else {
        setAlert(true, 'Task submitted successfully! You can start it manually.', 'success');
      }
      
      setProgress(100);
      
      // Navigate to tasks page immediately
      navigate('/task');
    } catch (error) {
      console.error('Failed to submit task:', error);
      setAlert(true, 'Failed to submit task. Please try again.', 'error');
      setProgress(0);
    } finally {
      setSubmitting(false);
    }
  };

  // Function to handle attribute deletion
  const handleDeleteAttribute = (
    type: 'target' | 'probe' | 'part',
    attrName: string,
    probeName?: string,
    partName?: string
  ) => {
    if (!selectedCustomType) return;
    
    // Use deep copy to avoid state mutation
    const newType = JSON.parse(JSON.stringify(selectedCustomType));

    if (type === 'target') {
      if (newType.targetConfig?.attributes?.[attrName]) {
        delete newType.targetConfig.attributes[attrName];
      }
    } else if (type === 'probe' && probeName) {
      if (newType.probes?.[probeName]?.attributes?.[attrName]) {
        delete newType.probes[probeName].attributes[attrName];
      }
    } else if (type === 'part' && probeName && partName) {
      if (newType.probes?.[probeName]?.parts?.[partName]?.attributes?.[attrName]) {
        delete newType.probes[probeName].parts[partName].attributes[attrName];
      }
    }

    setSelectedCustomType(newType);
  };

  const handleToggleProbeAccordion = (probeName: string) => {
    setExpandedProbes(prev => ({
      ...prev,
      [probeName]: !prev[probeName],
    }));
  };

  // Get all attribute options (always show all, but some may be disabled)
  const getAllAttributeOptions = () => {
    return [
      { id: 'length', label: 'Length', icon: '📏', type: 'common' },
      { id: 'gcContent', label: 'GC Content', icon: '🧬', type: 'common' },
      { id: 'foldScore', label: 'Fold Score', icon: '📊', type: 'common' },
      { id: 'tm', label: 'Melting Temperature', icon: '🌡️', type: 'common' },
      { id: 'selfMatch', label: 'Self Match', icon: '🔍', type: 'common' },
      { id: 'mappedGenes', label: 'Mapped Genes', icon: '🧬', type: 'rna' },
      { id: 'mappedSites', label: 'Mapped Sites', icon: '📍', type: 'dna' },
      { id: 'kmerCount', label: 'K-mer Count', icon: '🔢', type: 'dna' }
    ];
  };

  // Check if an attribute option should be disabled
  const isAttributeOptionDisabled = (optionType: string) => {
    if (!selectedCustomType || optionType === 'common') return false;
    const isDna = isCurrentProbeDna();
    return (optionType === 'dna' && !isDna) || (optionType === 'rna' && isDna);
  };


  useEffect(() => {
    const ids = ['species', 'probeType', ...(selectedCustomType && expandedSections.probeType ? ['parameters'] : []), 'geneMap', 'postProcessing', 'taskName'];
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = ids[0];
        for (const id of ids) {
          const element = document.getElementById(`design-${id}`);
          if (element && element.getBoundingClientRect().top <= (workflowScroll.current?.getBoundingClientRect().top || 0) + 56) current = id;
        }
        setActiveSection(current);
      });
    };
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
      clearTimeout(scrollTimer.current);
    };
  }, [selectedCustomType, expandedSections.probeType]);

  return (
    <ThemeProvider theme={workflowTheme}>
    <Container
      maxWidth={false}
      sx={{ 
        width: '100%',
        px: { xs: 1.5, sm: 3, md: 4 },
        py: 2,
        height: { xs: 'calc(100dvh - 56px)', sm: 'calc(100dvh - 60px)' },
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      }}>

      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: { md: 3, lg: 4 }, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Box component="nav" aria-label="Workflow stages" sx={{ display: { xs: 'none', md: 'block' }, width: 188, flexShrink: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
          <Typography variant="overline" color="text.secondary" sx={{ pl: 1.5 }}>Workflow stages</Typography>
          <Stepper nonLinear orientation="vertical" activeStep={getActiveSteps().findIndex(step => step.id === activeSection)} sx={{ mt: 1,
            '& .MuiStepConnector-line': { borderColor: 'divider', minHeight: 16 },
            '& .MuiStepIcon-root': { fontSize: 22 },
            '& .MuiStepButton-root': { m: 0, px: 1.5, py: 1, width: '100%', borderRadius: 1.5 },
            '& .MuiStepConnector-root': { ml: '22px' },
            '& .MuiStepLabel-root': { minWidth: 0, width: '100%' },
            '& .MuiStepLabel-labelContainer': { minWidth: 0 },
            '& .MuiStepLabel-label': { overflowWrap: 'anywhere' }
          }}>
            {getActiveSteps().map(step => (
              <Step key={step.id} completed={step.completed && !step.optional}>
                <StepButton onClick={() => jumpToSection(step.id)} aria-current={activeSection === step.id ? 'location' : undefined}
                  sx={{ bgcolor: activeSection === step.id ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}>
                  <StepLabel error={showValidation && !step.completed}>
                    <Typography variant="body2" sx={{ fontWeight: activeSection === step.id ? 600 : 500 }}>{step.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 144, overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.summary}</Typography>
                  </StepLabel>
                </StepButton>
              </Step>
            ))}
          </Stepper>
        </Box>
        <Box ref={workflowScroll} sx={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: 1, pb: 3, overscrollBehavior: 'contain' }}>
      <Box sx={{ mb: 3, flexShrink: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 24 }} gutterBottom>
          Design Probes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose a genome and probe structure, add targets, then review your filters.
        </Typography>
      </Box>

          <FormControl size="small" fullWidth sx={{ display: { xs: 'flex', md: 'none' }, mb: 2, position: 'sticky', top: 8, zIndex: 5, bgcolor: 'background.paper', borderRadius: 1 }}>
            <InputLabel id="workflow-stage-label">Workflow stage</InputLabel>
            <Select labelId="workflow-stage-label" label="Workflow stage" value={getActiveSteps().some(step => step.id === activeSection) ? activeSection : 'species'} onChange={event => jumpToSection(event.target.value)}>
              {getActiveSteps().map(step => <MenuItem key={step.id} value={step.id}>{step.label}{showValidation && !step.completed ? ' · needs attention' : ''}</MenuItem>)}
            </Select>
          </FormControl>

      {/* Species Option */}
      <Card id="design-species" sx={{ mb: 3, scrollMarginTop: 16 }}>
        <CardHeader 
          title="Genome" 
          subheader={species ? getGenomeLabel(species) : "Select the reference genome"}
          action={
            <IconButton onClick={() => toggleSection('species')}>
              {expandedSections.species ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
        <Collapse in={expandedSections.species}>
          <CardContent>
            <FormControl fullWidth>
              <InputLabel id="species-select-label">Species</InputLabel>
              <Select
                labelId="species-select-label"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
              >
                {speciesOptions.map((speciesOption) => (
                  <MenuItem key={speciesOption} value={speciesOption}>
                    {getGenomeLabel(speciesOption)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Collapse>
      </Card>

      {/* Probe Structure */}
      <Card id="design-probeType" sx={{ mb: 3, scrollMarginTop: 16 }}>
        <CardHeader 
          title="Probe structure" 
          subheader={probeType || "Select a built-in or saved design"}
          action={
            <IconButton onClick={() => toggleSection('probeType')}>
              {expandedSections.probeType ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
        <Collapse in={expandedSections.probeType}>
          <CardContent>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
              <FormControl fullWidth>
                <InputLabel id="probe-type-label">Probe Structure</InputLabel>
                <Select
                  labelId="probe-type-label"
                  value={probeType}
                  onChange={(e) => handleProbeTypeSelect(e.target.value)}
                  disabled={isLoadingCustomTypes}
                >
                  {isLoadingCustomTypes ? (
                    <MenuItem disabled>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={20} />
                        <Typography>Loading custom types...</Typography>
                      </Box>
                    </MenuItem>
                  ) : (
                    [...builtinProbeTypes, ...customProbeTypes].map((type) => (
                      <MenuItem key={type.id} value={type.name}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Typography>{type.name}</Typography>
                          <Chip 
                            size="small" 
                            label={type.type === 'builtin' ? 'Built-in' : getProbeType(type)} 
                            color={type.type === 'builtin' ? 'default' : (getProbeType(type) === 'DNA' ? 'primary' : 'secondary')}
                            sx={{ fontSize: '0.7rem', height: 20 }}
                          />
                        </Box>
                      </MenuItem>
                    ))
                  )}
                </Select>
                {isLoadingCustomTypes && (
                  <FormHelperText>
                    Loading custom probe structures...
                  </FormHelperText>
                )}
              </FormControl>
              
              <Button
                variant="outlined"
                onClick={() => setShowCustomProbeTypes(true)}
                disabled={isLoadingCustomTypes}
              >
                Saved structures
              </Button>
            </Box>

            {selectedCustomType && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {selectedCustomType.type === 'builtin' ? 'Built-in template' : 'Saved template'} · Changes apply to this task; the saved template remains unchanged.
            </Typography>}
            {/* Custom Probe Parameters Section */}
            {selectedCustomType && (
              <Box id="design-parameters" sx={{ mt: 3, scrollMarginTop: 16 }}>
                <Card variant="outlined" sx={{ 
                  backgroundColor: 'background.paper',
                  boxShadow: 'none'
                }}>
                  <CardHeader
                    title="Probe parameters"
                    subheader="Sequence structure and attribute conditions"
                  />
                  <CardContent>
                    {/* Target Sequence Configuration */}
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                          Target sequence
                        </Typography>
                        <Tooltip title="Add target sequence attributes">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentAttributeType('target');
                              setShowAttributeDialog(true);
                            }}
                            sx={{ 
                              border: '1px solid',
                              borderColor: 'divider',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              }
                            }}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6}>
                          <TargetLengthEditor value={lengthInput} onChange={text => {
                            setLengthInput(text);
                            try {
                              const length = parseTargetLength(text);
                              setSelectedCustomType({ ...selectedCustomType, targetLength: length, targetConfig: selectedCustomType.targetConfig ? { ...selectedCustomType.targetConfig, length } : undefined });
                              setMinLength(length);
                            } catch { /* Keep incomplete text editable. */ }
                          }} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Candidate step"
                            type="number"
                            value={step}
                            onChange={(e) => {
                              const updatedType = {
                                ...selectedCustomType,
                                step: Number(e.target.value)
                              };
                              setSelectedCustomType(updatedType);
                              setStep(Number(e.target.value));
                            }}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">bp</InputAdornment>,
                            }}
                            variant="outlined"
                            size="small"
                          />
                        </Grid>
                      </Grid>

                      <TargetLayoutEditor value={selectedCustomType.targetConfig?.layout} length={minLength} onChange={layout => setSelectedCustomType({ ...selectedCustomType, targetConfig: { ...selectedCustomType.targetConfig!, layout } })} onRename={(layout, before, after) => {
                        const updated = rewritePartReferences(selectedCustomType, 'target_parts', before, after);
                        const seed = rewritePartReferences(YAML.parse(selectedCustomType.yamlContent), 'target_parts', before, after);
                        setSelectedCustomType({ ...updated, yamlContent: YAML.stringify(seed), targetConfig: { ...updated.targetConfig!, layout } });
                      }} />

                      {selectedCustomType.targetConfig?.attributes && renderAttributeTable('target', selectedCustomType.targetConfig.attributes)}

                    </Box>

                    {/* Probe Configuration */}
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                          Probe sequences
                        </Typography>
                      </Box>

                      {(() => {
                        console.log('Debug - Rendering probes:', selectedCustomType.probes);
                        return selectedCustomType.probes && Object.keys(selectedCustomType.probes).length > 0 ? (
                          Object.entries(selectedCustomType.probes).map(([probeName, probeConfig]) => (
                        <Accordion 
                          key={probeName} 
                          sx={{ mb: 2 }}
                          expanded={expandedProbes[probeName] ?? true}
                          onChange={() => handleToggleProbeAccordion(probeName)}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                                {formatProbeName(probeName)}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentProbeName(probeName);
                                  setCurrentAttributeType('probe');
                                  setShowAttributeDialog(true);
                                }}
                                sx={{ 
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  '&:hover': {
                                    backgroundColor: 'action.hover',
                                  }
                                }}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails>
                            {/* Probe-level attributes */}
                            <Typography variant="overline" color="text.secondary">Complete probe attributes</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                              {probeConfig.attributes && renderAttributeTable('probe', probeConfig.attributes, probeName)}
                              {!probeConfig.attributes && (
                                <Typography variant="caption" color="text.secondary">
                                  No attributes configured
                                </Typography>
                              )}
                            </Box>

                            <Button startIcon={<AddIcon />} size="small" onClick={() => {
                              let n = 1; while (probeConfig.parts?.[`part${n}`]) n++;
                              setPartEditError(''); setPartEditor({ probe: probeName, name: `part${n}`, expr: '' });
                            }}>Add probe part</Button>
                            {/* Part-level attributes */}
                            {probeConfig.parts && Object.entries(probeConfig.parts).map(([partName, partConfig]) => (
                              <Box key={partName} sx={{ mb: 3 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                  <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                                      {formatPartName(partName)}
                                    </Typography>
                                    <Button size="small" onClick={() => { setPartEditError(''); setPartEditor({ probe: probeName, before: partName, name: partName, expr: partConfig.expr }); }}>Edit part</Button>
                                    <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{partConfig.expr}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Part of {formatProbeName(probeName)}
                                    </Typography>
                                  </Box>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCurrentProbeName(probeName);
                                      setCurrentPartName(partName);
                                      setCurrentAttributeType('part');
                                      setShowAttributeDialog(true);
                                    }}
                                    sx={{ 
                                      border: '1px solid',
                                      borderColor: 'divider',
                                      '&:hover': {
                                        backgroundColor: 'action.hover',
                                      }
                                    }}
                                  >
                                    <AddIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                                {partConfig.attributes && (
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {renderAttributeTable('part', partConfig.attributes, probeName, partName)}

                                  </Box>
                                )}
                              </Box>
                            ))}
                          </AccordionDetails>
                        </Accordion>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                        No probes configured
                      </Typography>
                    );
                  })()}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}
          </CardContent>
        </Collapse>
      </Card>

      {/* Targets */}
      <Card id="design-geneMap" sx={{ mb: 3, scrollMarginTop: 16 }}>
        <CardHeader 
          title="Targets" 
          subheader={`${targetList.filter(item => item.target.trim()).length} targets · Enter directly or import a CSV file`}
          action={
            <IconButton onClick={() => toggleSection('geneMap')}>
              {expandedSections.geneMap ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
        <Collapse in={expandedSections.geneMap}>
          <CardContent>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<AddIcon />}
              >
                Import CSV
                <input
                  type="file"
                  hidden
                  accept=".csv"
                  onChange={handleTargetCsvUpload}
                />
              </Button>
              <Button
                variant="text"
                color="inherit"
                startIcon={<DeleteIcon />}
                onClick={handleResetTargetList}
              >
                Clear targets
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              <strong>CSV Format Required:</strong> The first row must be a header. <code>target</code> is required, <code>sequence</code> is optional.<br />
              {selectedCustomType?.barcodeCount ? 
                `Header format: target,sequence${Array.from({ length: selectedCustomType.barcodeCount }, (_, i) => `,barcode${i + 1}`).join('')}` :
                'Header format: target,sequence'}<br />
              <em>Note: You can leave sequence or barcodes empty in the CSV and configure them later in the UI.</em>
            </Typography>

            {!!selectedCustomType?.barcodeCount && (
              <Box sx={{ mb: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Barcodes</Typography>
                  <Typography variant="caption" color="text.secondary">
                    · {barcodeLibrary.length ? `${barcodeLibrary.length} available` : 'No library imported'}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}>
                  <Tooltip title="Click a BC cell to type a sequence, use the arrow to select from the library, or ↻ to generate. Changes are saved automatically." arrow>
                    <IconButton size="small" aria-label="Barcode configuration help" sx={{ color: 'text.secondary' }}>
                      <HelpOutlineIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  <Button size="small" component="label" startIcon={<FileUploadOutlinedIcon sx={{ fontSize: 18 }} />}
                    sx={{ px: 1.5, py: 0.5, borderRadius: 1.5, textTransform: 'none', fontWeight: 600, backgroundColor: 'action.hover', '&:hover': { backgroundColor: 'action.selected' } }}>
                    Import library
                    <input type="file" hidden accept=".csv" onChange={importBarcodeLibrary} />
                  </Button>
                  <Tooltip title="More barcode options">
                    <IconButton size="small" aria-label="More barcode options" aria-haspopup="menu"
                      aria-controls={barcodeMenuAnchor ? 'barcode-library-menu' : undefined}
                      aria-expanded={Boolean(barcodeMenuAnchor)}
                      onClick={event => setBarcodeMenuAnchor(event.currentTarget)} sx={{ color: 'text.secondary' }}>
                      <MoreHorizIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Menu id="barcode-library-menu" anchorEl={barcodeMenuAnchor} open={Boolean(barcodeMenuAnchor)} onClose={() => setBarcodeMenuAnchor(null)}>
                    <MenuItem onClick={() => { downloadBarcodeTemplate(); setBarcodeMenuAnchor(null); }}>
                      <DownloadIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> Download CSV template
                    </MenuItem>
                  </Menu>
                </Stack>
              </Box>
            )}

            {/* Keep floating labels inside the scroll container's clipping boundary. */}
            <Box sx={{ overflowX: 'auto', pt: 1.5, pb: 1 }}>
            <Box sx={{ minWidth: { xs: 0, lg: selectedCustomType?.barcodeCount ? 620 + selectedCustomType.barcodeCount * 240 : 600 } }}>
            {targetList.map((item, index) => (
                  <Grid container spacing={2} key={index} alignItems="center" sx={{ mb: 1 }}>
                    <Grid item xs={12} sm={6} lg sx={{ minWidth: 0 }}>
                      <TextField
                        fullWidth
                        label={`Target ${index + 1}`}
                        value={item.target}
                        onChange={(e) => updateTarget(index, 'target', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} lg sx={{ minWidth: 0 }}>
                      <TextField
                        fullWidth
                        label="Sequence (Optional)"
                        value={item.sequence || ''}
                        onChange={(e) => updateTarget(index, 'sequence', e.target.value)}
                        placeholder="ATCGATCGATCG..."
                        inputProps={{ 
                          style: { fontFamily: 'monospace', fontSize: '0.875rem' } 
                        }}
                      />
                    </Grid>

                    {selectedCustomType?.barcodeCount ? (
                      Array.from({ length: selectedCustomType.barcodeCount }).map((_, barcodeIndex) => {
                        const barcodeKey = `barcode${barcodeIndex + 1}`;
                        const value = String(item[barcodeKey] || '');
                        const invalid = value.length > 0 && !validateManualBarcode(value, barcodeKey);
                        const expectedLength = getExpectedBarcodeLength(barcodeKey);
                        const barcodeLabel = `BC${barcodeIndex + 1}${expectedLength === undefined ? '' : ` · ${expectedLength} bp`}`;
                        const options = barcodeLibrary.filter(entry => expectedLength === undefined || entry.sequence.length === expectedLength);
                        return (
                          <Grid item key={barcodeIndex} xs={12} sm={6} lg="auto" sx={{ width: { lg: 240 }, minWidth: 0, flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Autocomplete
                                  freeSolo forcePopupIcon fullWidth size="small" options={options}
                                  inputValue={value}
                                  onInputChange={(_, text, reason) => {
                                    if (reason === 'input' || reason === 'clear') {
                                      updateTarget(index, barcodeKey as keyof Target, text.trim().toUpperCase());
                                    }
                                  }}
                                  value={options.find(entry => entry.sequence === value) || (value ? { name: '', sequence: value } : null)}
                                  getOptionLabel={entry => typeof entry === 'string' ? entry : entry.sequence}
                                  filterOptions={(entries, state) => entries.filter(entry => `${entry.name} ${entry.sequence}`.toLowerCase().includes(state.inputValue.toLowerCase()))}
                                  renderOption={(props, entry) => <li {...props} key={entry.name}>{entry.name} · {entry.sequence}</li>}
                                  isOptionEqualToValue={(option, selected) => option.sequence === selected.sequence}
                                  onChange={(_, entry) => updateTarget(index, barcodeKey as keyof Target, (typeof entry === 'string' ? entry : entry?.sequence || '').trim().toUpperCase())}
                                  noOptionsText={barcodeLibrary.length ? 'No barcodes with matching length' : 'Import a barcode library first'}
                                  renderInput={params => (
                                    <TextField {...params}
                                      label={barcodeLabel}
                                      placeholder="Type or select a barcode"
                                      error={invalid}
                                      helperText={invalid ? (expectedLength === undefined ? 'Use A/C/G/T bases' : `Use ${expectedLength} A/C/G/T bases`) : ''}
                                      inputProps={{ ...params.inputProps, style: { fontFamily: 'monospace' } }}
                                    />
                                  )}
                                />
                              <Tooltip title="Generate barcode for this cell">
                                <span><IconButton size="small" aria-label={`Generate BC${barcodeIndex + 1} for target ${index + 1}`}
                                  disabled={generatingBarcodes[`target_${index}_${barcodeKey}`]}
                                  onClick={() => openBarcodeGeneration(index, barcodeKey)}>
                                  {generatingBarcodes[`target_${index}_${barcodeKey}`] ? <CircularProgress size={16} /> : <AutorenewIcon fontSize="small" />}
                                </IconButton></span>
                              </Tooltip>
                            </Box>
                          </Grid>
                        );
                      })
                    ) : null}

                    <Grid item sx={{ width: 48 }}>
                      <IconButton onClick={() => { setBarcodeGeneration(null); removeTarget(index); }}>
                        <DeleteIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
            </Box>
            </Box>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={addTarget}
                  sx={{ mt: 2 }}
                >
                  Add Target
                </Button>
          </CardContent>
        </Collapse>
      </Card>

      {/* Post Processing Step */}
      <Card id="design-postProcessing" sx={{ mb: 3, scrollMarginTop: 16 }}>
        <CardHeader
          title="Post Processing"
          subheader="Filter candidates, define priority and select probes"
          action={
            <IconButton onClick={() => setShowPostProcess(!showPostProcess)}>
              {showPostProcess ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
        <Collapse in={showPostProcess}>
          <CardContent>
            <Stack spacing={3}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 1, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                {[
                  { label: 'Basic Filtering', checked: enableBasicFilter, change: setEnableBasicFilter },
                  { label: 'Sorting', checked: enableSorting, change: setEnableSorting },
                  { label: 'Remove Overlap', checked: enableRemoveOverlap, change: setEnableRemoveOverlap },
                  ...(shouldEnableDnaFeatures() ? [
                    { label: 'Avoid Off-Target', checked: enableAvoidOtp, change: (value: boolean) => { setEnableAvoidOtp(value); if (value) initializeAvoidOtpConfig(); } },
                    { label: 'Equal Spacing', checked: enableEqualSpace, change: (value: boolean) => { setEnableEqualSpace(value); if (value) initializeEqualSpaceConfig(); } },
                  ] : [])
                ].map(option => <Box key={option.label} sx={{ px: 1.5, py: 0.5, borderRadius: 1.5, bgcolor: option.checked ? 'background.paper' : 'transparent', boxShadow: option.checked ? '0 1px 4px rgba(15,23,42,0.08)' : 'none' }}>
                  <FormControlLabel sx={{ m: 0, gap: 1 }} label={<Typography variant="body2" fontWeight={option.checked ? 600 : 400} color={option.checked ? 'text.primary' : 'text.secondary'}>{option.label}</Typography>} labelPlacement="start"
                    control={<Switch size="small" checked={option.checked} onChange={event => option.change(event.target.checked)} />} />
                </Box>)}
              </Box>

              {/* Basic filtering: sequence patterns */}
              {enableBasicFilter && selectedCustomType && <SequenceFilters
                targets={['target_region', ...Object.entries(selectedCustomType.probes || {}).flatMap(([name, probe]) => {
                  const target = /^\d+$/.test(name) ? `probe${Number(name) + 1}` : name;
                  return [target, ...Object.keys(probe.parts || {}).map(part => `${target}.${/^\d+$/.test(part) ? `part${Number(part) + 1}` : part}`)];
                })]}
                filters={selectedCustomType.extraFilters || {}}
                onChange={extraFilters => setSelectedCustomType({ ...selectedCustomType, extraFilters })}
              />}

              {/* Configuration Sections */}
              {/* Avoid OTP Configuration */}
              <Collapse in={enableAvoidOtp}>
                <Paper variant="outlined" sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Off-target avoidance
                  </Typography>
                  {getCurrentTargets().length > 0 ? (
                    <Grid container spacing={2}>
                      {getCurrentTargets().map((target) => (
                        <Grid item xs={12} md={6} key={target}>
                          <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 500 }}>
                              {target}
                            </Typography>
                            <Stack spacing={2}>
                              <TextField
                                fullWidth
                                label="Target Regions"
                                value={avoidOtpConfig[target]?.target_regions || target}
                                onChange={(e) => {
                                  setAvoidOtpConfig(prev => ({
                                    ...prev,
                                    [target]: {
                                      ...prev[target],
                                      target_regions: e.target.value
                                    }
                                  }));
                                }}
                                size="small"
                              />
                              <TextField
                                fullWidth
                                label="Density Threshold"
                                type="number"
                                value={avoidOtpConfig[target]?.density_thresh || 1e-5}
                                onChange={(e) => {
                                  setAvoidOtpConfig(prev => ({
                                    ...prev,
                                    [target]: {
                                      ...prev[target],
                                      density_thresh: parseFloat(e.target.value)
                                    }
                                  }));
                                }}
                                inputProps={{ step: "0.00001" }}
                                size="small"
                              />
                            </Stack>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No targets available. Please add targets first.
                    </Typography>
                  )}
                </Paper>
              </Collapse>

              {/* Equal Space Configuration */}
              <Collapse in={enableEqualSpace}>
                <Paper variant="outlined" sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Equal spacing 
                  </Typography>
                  {getCurrentTargets().length > 0 ? (
                    <Grid container spacing={2}>
                      {getCurrentTargets().map((target) => (
                        <Grid item xs={12} sm={6} md={4} key={target}>
                          <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 500 }}>
                              {target}
                            </Typography>
                            <TextField
                              fullWidth
                              label="Number Desired"
                              type="number"
                              value={equalSpaceConfig[target]?.number_desired || 1000}
                              onChange={(e) => {
                                setEqualSpaceConfig(prev => ({
                                  ...prev,
                                  [target]: {
                                    number_desired: parseInt(e.target.value)
                                  }
                                }));
                              }}
                              size="small"
                            />
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No targets available. Please add targets first.
                    </Typography>
                  )}
                </Paper>
              </Collapse>

              {/* Remove Overlap Configuration */}
              <Collapse in={enableRemoveOverlap}>
                <Paper variant="outlined" sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Overlap removal
                  </Typography>
                  <Box sx={{ maxWidth: 300 }}>
                    <TextField
                      fullWidth
                      label="Overlap Threshold"
                      type="number"
                      value={overlapThreshold}
                      onChange={handleOverlapThresholdChange}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">bp</InputAdornment>,
                      }}
                      size="small"
                    />
                  </Box>
                </Paper>
              </Collapse>

              {/* Sorting Configuration */}
              <Collapse in={enableSorting}>
                <Paper variant="outlined" sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Sorting priority
                  </Typography>
                  <Stack spacing={2}>
                    {sortOptions.map((option, index) => (
                      <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Category</InputLabel>
                              <Select
                                value={option.category}
                                onChange={(e) => {
                                  const category = e.target.value;
                                  const newOptions = [...sortOptions];
                                  newOptions[index] = { ...option, category, field: '' };
                                  setSortOptions(newOptions);
                                }}
                              >
                                {getAvailableSortFields().map((cat) => (
                                  <MenuItem key={cat.category} value={cat.category}>
                                    {cat.icon} {cat.category}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Sort Field</InputLabel>
                              <Select
                                value={option.field}
                                onChange={(e) => handleSortOptionChange(index, e.target.value, option.order)}
                                disabled={!option.category}
                              >
                                {option.category && getAvailableSortFields()
                                  .find(cat => cat.category === option.category)
                                  ?.fields.map((field) => {
                                    const isSelected = sortOptions.some((opt, i) => i !== index && opt.field === field.value);
                                    return (
                                      <MenuItem 
                                        key={field.value} 
                                        value={field.value}
                                        disabled={isSelected}
                                      >
                                        {field.label} {isSelected && '(Selected)'}
                                      </MenuItem>
                                    );
                                  })}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Order</InputLabel>
                              <Select
                                value={option.order}
                                onChange={(e) => handleSortOptionChange(index, option.field, e.target.value as 'asc' | 'desc')}
                                disabled={!option.field}
                              >
                                <MenuItem value="asc">Ascending⬆️</MenuItem>
                                <MenuItem value="desc">Descending⬇️</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} sm={2}>
                            <IconButton 
                              onClick={() => handleRemoveSortOption(index)}
                              color="error"
                              size="small"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </Paper>
                    ))}
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleAddSortOption}
                      size="small"
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Add Sort Option
                    </Button>
                  </Stack>
                </Paper>
              </Collapse>
              <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="overline" color="text.secondary">Active configuration</Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
                  <Chip size="small" variant="outlined" label={`Basic filtering: ${enableBasicFilter ? 'On' : 'Off'}`} />
                  {enableBasicFilter && <Chip size="small" variant="outlined" label={`Sequence patterns: ${Object.values(selectedCustomType?.extraFilters || {}).filter(rule => rule.type === 'sequence_pattern').reduce((count, rule) => count + (rule.exclude_patterns || []).filter(Boolean).length, 0)}`} />}
                  <Chip size="small" variant="outlined" label={`Overlap removal: ${enableRemoveOverlap ? `${overlapThreshold} bp` : 'Off'}`} />
                  {enableSorting && sortOptions.filter(option => option.field).map((option, index) => <Chip key={option.field} size="small" color="primary" variant="outlined" label={`${index + 1}. ${option.field} ${option.order === 'asc' ? '↑' : '↓'}`} />)}
                  {!enableSorting && <Chip size="small" variant="outlined" label="Sorting: Off" />}
                  {shouldEnableDnaFeatures() && <Chip size="small" variant="outlined" label={`Off-target: ${enableAvoidOtp ? 'On' : 'Off'} · Spacing: ${enableEqualSpace ? 'On' : 'Off'}`} />}
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Collapse>
      </Card>

      {/* Task Name */}
      <Card id="design-taskName" sx={{ mb: 3, scrollMarginTop: 16 }}>
        <CardHeader 
          title="Task name" 
          subheader="Optional · A name is generated automatically"
          action={
            <IconButton onClick={() => toggleSection('taskName')}>
              {expandedSections.taskName ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          }
        />
        <Collapse in={expandedSections.taskName}>
          <CardContent>
            <TextField
              fullWidth
              label="Task Name (Optional)"
              placeholder={probeType ? `Auto-generated: ${generateAutoTaskName()}` : "Select probe structure first"}
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              helperText="Leave empty to auto-generate based on probe structure and timestamp"
            />
          </CardContent>
        </Collapse>
      </Card>

      {/* Submit button and progress bar */}
      <Box sx={{ position: 'sticky', bottom: 0, zIndex: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, boxShadow: '0 -4px 18px rgba(15,23,42,0.04)' }}>
        <Box>
          <Typography variant="body2" fontWeight={600}>{probeType || 'Select a probe structure'} · {targetList.filter(item => item.target.trim()).length} targets</Typography>
          <Typography variant="caption" color="text.secondary">{species ? getGenomeLabel(species) : 'Select a genome'} · Review your configuration before submitting</Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmitTask}
          disabled={isSubmitting}
          size="large"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Task'}
        </Button>
      </Box>

      {/* Progress bar */}
      {isSubmitting && (
        <Box sx={{ width: '100%', mt: 2 }}>
          <LinearProgress variant="determinate" value={progress} />
        </Box>
      )}
      

        </Box>
      </Box>

      {/* Alert */}
      <Snackbar open={alertOpen} autoHideDuration={6000} onClose={handleAlertClose}>
        <Alert onClose={handleAlertClose} severity={alertSeverity} sx={{ width: '100%', whiteSpace: 'pre-line' }}>
          {alertMessage}
        </Alert>
      </Snackbar>

      {/* Custom Probe Structures Dialog */}
      <Dialog open={!!partEditor} onClose={() => setPartEditor(null)} fullWidth maxWidth="sm">
        <DialogTitle>{partEditor?.before ? 'Edit probe part' : 'Add probe part'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Part name" value={partEditor?.name || ''} onChange={e => setPartEditor(prev => prev && ({ ...prev, name: e.target.value }))} />
            <TextField label="Sequence expression" multiline minRows={2} value={partEditor?.expr || ''} onChange={e => setPartEditor(prev => prev && ({ ...prev, expr: e.target.value }))} helperText="Examples: rc(target_parts['arm5']), encoding[target]['BC1'], 'ACGT'. New parts are appended to the probe." />
            {partEditError && <Alert severity="error">{partEditError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setPartEditor(null)}>Cancel</Button><Button variant="contained" onClick={savePartEdit}>Apply</Button></DialogActions>
      </Dialog>
      <Dialog
        open={showCustomProbeTypes}
        onClose={() => setShowCustomProbeTypes(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Custom Probe Structures</Typography>
            <IconButton onClick={() => setShowCustomProbeTypes(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {customProbeTypes.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
              No custom probe structures available
            </Typography>
          ) : (
            <List>
              {customProbeTypes.map((type) => (
                <ListItem
                  key={type.id}
                  divider
                  sx={{
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  <ListItemText
                    primary={type.name}
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        Created: {new Date(type.createdAt).toLocaleDateString()}<br />
                        Barcode Count: {type.barcodeCount}<br />
                        Target Length: {formatTargetLength(type.targetLength ?? 40)}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleDownload(type)}
                      title="Download YAML"
                      sx={{ mr: 1 }}
                    >
                      <DownloadIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleDelete(type.id)}
                      title="Delete"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

      {/* Attribute Selection Dialog */}
      <Dialog
        open={showAttributeDialog}
        onClose={() => setShowAttributeDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Add Attribute</Typography>
            <IconButton onClick={() => setShowAttributeDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
              {getAllAttributeOptions().map((option) => {
                const isDisabled = isAttributeOptionDisabled(option.type);
                return (
                  <Grid item xs={12} sm={6} key={option.id}>
                    <Button
                      fullWidth
                      variant="outlined"
                      onClick={() => handleAddAttribute(option.id)}
                      disabled={isDisabled}
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 2,
                        opacity: isDisabled ? 0.5 : 1
                      }}
                    >
                      <Typography variant="h4" sx={{ mb: 1 }}>{option.icon}</Typography>
                      <Typography variant="body1">{option.label}</Typography>
                      {isDisabled && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                          {option.type === 'dna' ? 'DNA only' : 'RNA only'}
                        </Typography>
                      )}
                    </Button>
                  </Grid>
                );
              })}
          </Grid>
        </DialogContent>
      </Dialog>

      {/* Edit Attribute Dialog */}
      <Dialog
        open={showEditAttributeDialog}
        onClose={() => setShowEditAttributeDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Edit Attribute</Typography>
            <IconButton onClick={() => setShowEditAttributeDialog(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              {(editingAttribute?.name === 'gcContent' || editingAttribute?.name === 'gc_content') && '🧬 GC Content'}
              {editingAttribute?.name && !['gcContent', 'gc_content', 'kmerCount', 'kmer_count', 'mappedSites', 'mapped_sites'].includes(editingAttribute.name) && editingAttribute.name}
              {(editingAttribute?.name === 'kmerCount' || editingAttribute?.name === 'kmer_count') && '🔢 K-mer Count'}
              {(editingAttribute?.name === 'mappedSites' || editingAttribute?.name === 'mapped_sites') && '📍 Mapped Sites'}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControlLabel label="Enable filtering" control={<Switch
                  checked={editingAttribute?.filterEnabled !== false}
                  onChange={(_, checked) => setEditingAttribute(prev => prev ? { ...prev, filterEnabled: checked } : null)}
                />} />
                <TextField fullWidth multiline margin="dense" label="Filter expression (advanced)"
                  disabled={editingAttribute?.filterEnabled === false}
                  value={editingAttribute ? buildAttributeFilter({ ...editingAttribute, filterEnabled: true }, getEditingFilterName(), ['gcContent', 'gc_content'].includes(editingAttribute.name)) : ''}
                  helperText="Conditions are preserved as written. GC values here use 0–1; the bounds below use percent."
                  onChange={event => setEditingAttribute(prev => prev ? {
                    ...prev, min: undefined, max: undefined,
                    ...parseAttributeFilter(getEditingFilterName(), ['gcContent', 'gc_content'].includes(prev.name) ? 'gc_content' : '', event.target.value),
                    filterEnabled: true
                  } : null)}
                />
              </Grid>
              {(editingAttribute?.name === 'length' || editingAttribute?.name === 'gcContent' || editingAttribute?.name === 'gc_content' || editingAttribute?.name === 'tm' || editingAttribute?.name === 'foldScore' || editingAttribute?.name === 'fold_score' || editingAttribute?.name === 'selfMatch' || editingAttribute?.name === 'self_match' || editingAttribute?.name === 'mappedGenes' || editingAttribute?.name === 'mapped_genes') && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Min"
                      type="number"
                      value={editingAttribute?.min ?? ''}
                      disabled={editingAttribute?.filterEnabled === false}
                      onChange={(e) => setEditingAttribute(prev => prev ? {
                        ...prev,
                        min: e.target.value === '' ? undefined : Number(e.target.value), filterExpression: undefined
                      } : null)}
                    />
                    <FormControlLabel label="Include minimum" control={<Switch
                      checked={editingAttribute?.minInclusive !== false}
                      onChange={(_, checked) => setEditingAttribute(prev => prev ? { ...prev, minInclusive: checked, filterExpression: undefined } : null)}
                    />} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Max"
                      type="number"
                      value={editingAttribute?.max ?? ''}
                      disabled={editingAttribute?.filterEnabled === false}
                      onChange={(e) => setEditingAttribute(prev => prev ? {
                        ...prev,
                        max: e.target.value === '' ? undefined : Number(e.target.value), filterExpression: undefined
                      } : null)}
                    />
                    <FormControlLabel label="Include maximum" control={<Switch
                      checked={editingAttribute?.maxInclusive !== false}
                      onChange={(_, checked) => setEditingAttribute(prev => prev ? { ...prev, maxInclusive: checked, filterExpression: undefined } : null)}
                    />} />
                  </Grid>
                </>
              )}
              {(editingAttribute?.name === 'kmerCount' || editingAttribute?.name === 'kmer_count') && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="K-mer Length"
                    type="number"
                    value={editingAttribute?.kmer_len}
                    onChange={(e) => setEditingAttribute(prev => prev ? {
                      ...prev,
                      kmer_len: Number(e.target.value)
                    } : null)}
                  />
                </Grid>
              )}
              {(editingAttribute?.name === 'mappedGenes' || editingAttribute?.name === 'mapped_genes' || 
                editingAttribute?.name === 'kmerCount' || editingAttribute?.name === 'kmer_count' || 
                editingAttribute?.name === 'mappedSites' || editingAttribute?.name === 'mapped_sites') && (
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Aligner</InputLabel>
                    <Select
                      value={editingAttribute?.aligner || 'BLAST'}
                      onChange={(e) =>                       setEditingAttribute(prev => prev ? {
                        ...prev,
                        aligner: e.target.value as 'blast' | 'bowtie2' | 'mmseqs2' | 'jellyfish'
                      } : null)}
                    >
                      {['kmerCount','kmer_count'].includes(editingAttribute.name) ? <MenuItem value="jellyfish">Jellyfish</MenuItem> : <MenuItem value="bowtie2">Bowtie2</MenuItem>}
                    </Select>
                  </FormControl>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEditAttributeDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveAttribute} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>


      <Dialog open={barcodeGeneration !== null} onClose={() => setBarcodeGeneration(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Generate barcode</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth margin="dense" label="Barcode length (bp)" type="number"
            value={generationLength} onChange={event => setGenerationLength(event.target.value)}
            inputProps={{ min: 1, step: 1 }}
            error={!Number.isSafeInteger(Number(generationLength)) || Number(generationLength) < 1}
            helperText="Enter a positive whole number."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBarcodeGeneration(null)}>Cancel</Button>
          <Button variant="contained"
            disabled={!Number.isSafeInteger(Number(generationLength)) || Number(generationLength) < 1}
            onClick={() => {
              if (!barcodeGeneration) return;
              const { itemIndex, barcodeKey } = barcodeGeneration;
              setBarcodeGeneration(null);
              void autoGenerateBarcodeForItem(itemIndex, barcodeKey, Number(generationLength));
            }}>
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
    </ThemeProvider>
  );
};

export default DesignWorkflow;
