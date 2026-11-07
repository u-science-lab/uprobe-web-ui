import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const result = await build({ entryPoints: ['tests/probeBuilder.test.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
