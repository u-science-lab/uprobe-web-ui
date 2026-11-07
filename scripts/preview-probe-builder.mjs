import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const server = await createServer({
  configFile: false,
  plugins: [react(), { name: 'builder-verification-entry', configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url?.startsWith('/design/') || req.url === '/task') req.url = '/tests/probe-builder.html';
      next();
    });
  } }],
  server: { host: '127.0.0.1', port: 18009, strictPort: true },
});
await server.listen();
console.log('Isolated Custom Probe verification ready on port 18009.');
