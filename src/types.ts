import { encodingFields } from './utils/encodingFields';
import { TargetLayout } from './utils/targetLayout';
import { TargetLength, samplingStep } from './utils/sampling';
import yaml from 'js-yaml';

// Folder chain type for file navigation
export type FolderChain = Array<{ name: string }>;

// Task
export interface Task {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "queued";
  progress: number;
  phase?: 'queued' | 'validating' | 'designing' | 'validation_failed' | null;
  created_at: string;
  updated_at: string;
  genome: string;
  parameters: Record<string, any>;
  result_url?: string;
  yaml_content?: string;
  error_message?: string;
  no_filtered_probes?: boolean;
  raw_file?: string;
}

export const statusColors = {
  pending: "blue",
  running: "green",
  completed: "success",
  failed: "error",
  paused: "warning",
};

// genome
export interface FileItem {
  id: number;
  name: string;
  type: string;
  date: string;
  progress: number;
  isUploading: boolean;
}

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
}

// API response types
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Genome related types
export interface Genome {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

export interface GenomeMetadata {
  id: string;
  genomeId: string;
  species: string;
  assembly: string;
  version: string;
  source: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenomeFile {
  id: string;
  genomeId: string;
  name: string;
  type: string;
  size: number;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProbeConfig {
  template: string;
  parts: Record<string, {
    expr: string;
    attributes?: Record<string, any>;
  }>;
  attributes?: Record<string, any>;
}

export interface WorkflowFilter {
  condition?: string;
  type?: 'sequence_pattern';
  target?: string;
  exclude_patterns?: string[];
}

export interface CustomProbeType {
  description?: string;
  extraFilters?: Record<string, WorkflowFilter>;
  sortDefaults?: { category: string; field: string; order: 'asc' | 'desc' }[];
  id: string;
  name: string;
  type: string;
  yamlContent: string;
  createdAt: Date;
  updatedAt: Date;
  barcodeCount: number;
  targetLength?: TargetLength;
  step?: number;
  overlap?: number;
  targetConfig?: {
    source: string;
    sequence: string;
    length: TargetLength;
    step?: number;
    layout?: TargetLayout;
    attributes?: Record<string, any>;
  };
  barcodeConfig?: {
    count: number;
    default_length?: number;
    barcodes: Record<string, {
      name: string;
      length?: number;
      description?: string;
    }>;
  };
  probes?: Record<string, ProbeConfig>;
}

export const parseYamlContent = (yamlContent: string) => {
  try {
    const parsed = yaml.load(yamlContent) as any;
    return parsed;
  } catch (e) {
    console.error('Error parsing YAML:', e);
    return null;
  }
};

// Add this function to extract parameters from YAML
export const extractParametersFromYaml = (yamlContent: string) => {
  const parsed = parseYamlContent(yamlContent);
  if (!parsed) return null;

  const parameters: any = {};
  
  // Extract target sequence information
  if (parsed.target_sequence) {
    parameters.target_sequence = {
      ...parsed.target_sequence,
      source: parsed.target_sequence.source,
      sequence: parsed.target_sequence.sequence,
      length: parsed.target_sequence.length,
      attributes: parsed.target_sequence.attributes || {}
    };
    // Also set targetLength for backward compatibility
    parameters.targetLength = parsed.target_sequence.length;
  }
  
  // Extract target length from YAML (fallback)
  if (!parameters.targetLength && parsed.target_sequence_length) {
    parameters.targetLength = parsed.target_sequence_length;
  }

  // Resolve declared and expression-based encoding keys consistently.
  const fields = encodingFields(parsed);
  if (parsed.barcode_config) parameters.barcodeConfig = parsed.barcode_config;
  else if (Object.keys(fields).length) parameters.barcodeConfig = {
    count: Math.max(...Object.keys(fields).map(key => Number(key.slice(7)))),
    default_length: parsed.barcodes?.default_length,
    barcodes: fields
  };

  const region = parsed.extracts?.target_region || parsed.target_sequence;
  if (region?.length !== undefined) {
    parameters.targetLength = region.length;
    parameters.step = samplingStep(region);
    parameters.target_sequence ||= { ...region, sequence: '', attributes: {} };
  }

  // Extract probe names and their parts
  if (parsed.probes) {
    parameters.probeNames = Object.keys(parsed.probes);
    parameters.probes = parsed.probes;
    
    // Extract barcode count from probes
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

    Object.values(parsed.probes).forEach((probe: any) => {
      findBarcodes(probe);
    });
    
    parameters.barcodeCount = parameters.barcodeConfig?.count || barcodeSet.size;
    
    // Extract part lengths for RCA probes
    if (parsed.probes.circle_probe && parsed.probes.circle_probe.parts) {
      parameters.partLengths = {
        part1: parsed.probes.circle_probe.parts.part1?.length || 0,
        part2: parsed.probes.circle_probe.parts.part2?.length || 0,
        part3: parsed.probes.circle_probe.parts.part3?.length || 0
      };
    }
  }

  return parameters;
};
