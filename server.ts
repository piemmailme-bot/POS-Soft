import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createApiApp } from './src/server/createApiApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApiApp({
    enableDailyBackupTimer: true,
    includeApi404: true,
  });

  // Dynamic port with fallback to 3000
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  const distDir = path.join(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
  const serveProductionDist = process.env.NODE_ENV !== 'development' && hasDist;

  if (serveProductionDist) {
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
    console.log('Serving production build from dist');
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
