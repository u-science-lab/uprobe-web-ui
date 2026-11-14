import { samplingStep } from './sampling';
import { parseAttributeFilter } from './attributeFilters';
export const attributeType = (name: string) => ({gcContent:'gc_content',foldScore:'fold_score',tm:'annealing_temperature',selfMatch:'self_match',mappedGenes:'mapped_genes',kmerCount:'kmer_count',mappedSites:'mapped_sites'} as Record<string,string>)[name] || (name === 'tm' ? 'annealing_temperature' : name);
export function restoreTemplate(config: any) {
  const probes = JSON.parse(JSON.stringify(config.probes || {}));
  const region = config.extracts?.target_region || config.target_sequence || {};
  const targetConfig = { ...region, source: region.source || 'exon', sequence: region.sequence || '', attributes: { ...(region.attributes || {}) } };
  if (region.length !== undefined) { targetConfig.step = samplingStep(region); delete targetConfig.overlap; }
  const filters = config.post_process?.filters || {};
  const used = new Set<string>();
  const aliases: Record<string,{category:string;field:string}> = {n_trans:{category:'Sequence Metadata',field:'n_trans'}};
  const hydrate = (attrs: any, target: string) => Object.fromEntries(Object.entries(attrs || {}).map(([name, data]) => {
    const attr = data as any;
    const originalName = attr.originalName || (target === 'target_region' ? 'target' : target.replace(/\./g, '_')) + '_' + (name === 'tm' ? 'tm' : attributeType(name));
    const rule = filters[originalName];
    if (rule) used.add(originalName);
    aliases[originalName] = {category: target === 'target_region' ? 'Target Sequence' : target.includes('.') ? 'Part Attributes' : 'Probe Attributes', field:originalName};
    return [name,{...attr,enabled:attr.enabled !== false, ...(rule?.condition !== undefined ? parseAttributeFilter(originalName, attributeType(name), rule.condition) : {}), originalName}];
  }));
  targetConfig.attributes = hydrate(targetConfig.attributes, 'target_region');
  const hydrateNodes = (nodes: any, prefix = '') => {
    for (const [name, data] of Object.entries(nodes)) {
      const node = data as any, path = prefix ? `${prefix}.${name}` : name;
      node.attributes = hydrate(node.attributes, path);
      if (node.parts) hydrateNodes(node.parts, path);
    }
  };
  hydrateNodes(probes);
  for (const [name, data] of Object.entries(config.attributes || {})) {
    const attr = data as any;
    const target = attr.target?.replace(/:/g,'.');
    if (!target) continue;
    if (target.startsWith('target_parts.')) {
      if (!targetConfig.layout?.parts?.[target.slice('target_parts.'.length)]) throw new Error(`Attribute ${name} references missing target part ${target}`);
      continue;
    }
    const value = {...attr,...parseAttributeFilter(name,attr.type,filters[name]?.condition),enabled:true,originalType:attr.type};
    const path = target.split('.');
    const scope = target === 'target_region' ? targetConfig : path.slice(1).reduce((node: any, key: string) => node?.parts?.[key], probes[path[0]]);
    if (!scope) throw new Error(`Attribute ${name} references missing sequence ${target}`);
    scope.attributes ||= {};
    const uiName = Object.entries({gcContent:'gc_content',foldScore:'fold_score',tm:'annealing_temperature',selfMatch:'self_match',mappedGenes:'mapped_genes',kmerCount:'kmer_count',mappedSites:'mapped_sites'}).find(([,type]) => type===attr.type)?.[0] || attr.type;
    const existing = Object.keys(scope.attributes).find(key => scope.attributes[key].originalName === name);
    scope.attributes[existing || (scope.attributes[uiName] ? name : uiName)] = { ...(existing ? scope.attributes[existing] : {}), ...value };
    used.add(name); aliases[name]={category:target==='target_region'?'Target Sequence':target.includes('.')?'Part Attributes':'Probe Attributes',field:name};
  }
  const sortDefaults:any[]=[];
  for (const [key,order] of [['is_ascending','asc'],['is_descending','desc']]) {
    const fields=config.post_process?.sorts?.[key];
    for (const field of typeof fields==='string'?[fields]:fields || []) if (!sortDefaults.some(x=>x.field===field)) sortDefaults.push({...aliases[field] || {category:'Sequence Metadata',field},order});
  }
  return {probes,targetConfig,sortDefaults,extraFilters:Object.fromEntries(Object.entries(filters).filter(([key])=>!used.has(key))) as Record<string, any>};
}
export function exportAttribute(value: any, name: string, target: string) {
  const type = value.originalType || attributeType(name);
  const uiFields = new Set(['enabled','originalName','originalType','filterEnabled','filterExpression','min','max','minInclusive','maxInclusive']);
  const result: any = { ...Object.fromEntries(Object.entries(value).filter(([key]) => !uiFields.has(key))), target, type };
  for (const key of ['min_mapq','kmer_len','threads','size','temperature','sodium','magnesium','dntp','dna_conc']) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  if (value.aligner) result.aligner = value.aligner.toLowerCase();
  if (type === 'mapped_genes' && result.min_mapq === undefined && value.aligner) result.min_mapq = 30;
  if (type === 'kmer_count') { result.threads ??= 10; result.size ??= '1G'; }
  return result;
}
