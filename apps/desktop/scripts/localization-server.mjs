/** Serves only local regression fixtures. Never boots Electron or contacts an API. */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const fonts = ['inter', 'jetbrains-mono'].map(name => dirname(require.resolve(`@fontsource-variable/${name}/package.json`)));
let failed = false;
const writes = [];
const server = await createServer({
  configFile: false, root: desktop,
  cacheDir: resolve(desktop, 'output/playwright/localization-vite-cache'),
  resolve: { alias: { '@renderer': resolve(desktop, 'src/renderer'), '@shared': resolve(desktop, 'src/shared') } },
  plugins: [react(), { name: 'localization-fixture-api', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (!request.url?.startsWith('/api/') && !request.url?.startsWith('/fixture/')) return next();
      const reply = (status, body) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
      if (request.url === '/fixture/writes') return reply(200, writes);
      if (request.url === '/fixture/fail') { failed = true; return reply(200, {}); }
      let raw = ''; for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      if (request.method === 'PATCH' && request.url === '/api/v1/users/@me/settings') {
        writes.push(body);
        if (failed) { failed = false; return reply(503, { message: 'Synthetic unavailable', code: 0 }); }
        return reply(200, { default_delivery_mode: 'standard', ...body });
      }
      if (request.url === '/api/v1/users/@me/applications' || request.url === '/api/v1/users/@me/applications/authorizations') return reply(200, []);
      return reply(404, { message: 'Unknown fixture endpoint', code: 0 });
    });
  } }],
  server: { host: '127.0.0.1', port: 39764, strictPort: true, fs: { allow: [resolve(desktop, '../..'), ...fonts] } }, worker: { format: 'es' },
});
await server.listen();
