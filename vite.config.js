import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function createApiMiddleware(mode, rootDir) {
  const env = loadEnv(mode, rootDir, '');
  if (env.GROQ_API_KEY && !process.env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = env.GROQ_API_KEY;
  }

  return async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/parse')) {
      return next();
    }

    const apiPath = path.resolve(rootDir, 'api/parse.js');
    if (!fs.existsSync(apiPath)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'API handler not found' }));
      return;
    }

    try {
      const rawBody = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });

      let parsedBody = {};
      if (rawBody && rawBody.trim()) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON request body' }));
          return;
        }
      }

      req.body = parsedBody;

      const vercelRes = {
        statusCode: 200,
        headers: {},
        setHeader(name, value) {
          res.setHeader(name, value);
          return this;
        },
        status(code) {
          this.statusCode = code;
          res.statusCode = code;
          return this;
        },
        json(payload) {
          if (!res.headersSent) {
            res.statusCode = this.statusCode;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          res.end(JSON.stringify(payload));
          return this;
        },
        send(payload) {
          if (!res.headersSent) {
            res.statusCode = this.statusCode;
          }
          res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
          return this;
        },
      };

      const fileUrl = `${pathToFileURL(apiPath).href}?t=${Date.now()}`;
      const mod = await import(fileUrl);
      await mod.default(req, vercelRes);
    } catch (err) {
      console.error('[vite-api-middleware] Error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
      }
    }
  };
}

function localVercelApiPlugin() {
  return {
    name: 'local-vercel-api',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware(server.config.mode, server.config.root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware(server.config.mode, server.config.root));
    },
  };
}

export default defineConfig({
  plugins: [react(), localVercelApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
