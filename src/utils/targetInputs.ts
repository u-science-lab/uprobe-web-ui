// Keep identifier cleanup aligned with the backend; preserve gene-name case.
export function normalizeTargetName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Target names must be strings.');
  const name = value.replace(/^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu, '');
  if (!name) throw new Error('Target name cannot be empty or contain only whitespace.');
  if (/[\s\p{C}]/u.test(name)) throw new Error(`Target ${JSON.stringify(name)} contains internal whitespace or invisible/control characters. Enter one identifier per target.`);
  return name;
}

export function normalizeTargetInputs(data: any): any {
  const result = structuredClone(data);
  if (!Array.isArray(result.targets) || !result.targets.length) throw new Error('Please add at least one target.');
  const seen = new Set<string>();
  result.targets = result.targets.map((entry: any) => {
    const direct = typeof entry === 'string';
    if (!direct && (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).length !== 1)) throw new Error('Each target must be a name or a single name-to-sequence mapping.');
    const raw = direct ? entry : Object.keys(entry)[0];
    const name = normalizeTargetName(raw);
    if (seen.has(name)) throw new Error(`Duplicate target after whitespace cleanup: ${name}`);
    seen.add(name);
    return direct ? name : { [name]: entry[raw] };
  });
  const cleanMapping = (mapping: any) => {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('Target configuration must be a mapping.');
    const entries = Object.entries(mapping).map(([key, value]) => [normalizeTargetName(key), value] as const);
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('Duplicate target in configuration after whitespace cleanup.');
    return Object.fromEntries(entries);
  };
  if ('encoding' in result) result.encoding = cleanMapping(result.encoding);
  for (const field of ['avoid_otp', 'equal_space']) {
    if (result.post_process && field in result.post_process) result.post_process[field] = cleanMapping(result.post_process[field]);
  }
  return result;
}
