import express from 'express';
import cors from 'cors';
import { initDB } from './db';
import { seed } from './seed';
import { usersRouter } from './routes/users';
import { projectsRouter } from './routes/projects';
import { rowsRouter } from './routes/rows';
import { referencesRouter } from './routes/references';
import { constantsRouter } from './routes/constants';
import { briefingsRouter } from './routes/briefings';
import { catalogRouter } from './routes/catalog';
import { UPLOADS_DIR, DB_PATH, DATA_DIR, ensureDataDirs } from './paths';
import { db } from './db';
import fs from 'fs';

initDB();
seed();

ensureDataDirs();

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  let counts: Record<string, number> = {};
  try {
    counts = {
      projects: (db.prepare(`SELECT COUNT(*) as c FROM projects`).get() as { c: number }).c,
      briefings: (db.prepare(`SELECT COUNT(*) as c FROM briefings`).get() as { c: number }).c,
      hypotheses: (db.prepare(`SELECT COUNT(*) as c FROM hypotheses`).get() as { c: number }).c,
      industries: (db.prepare(`SELECT COUNT(*) as c FROM industries`).get() as { c: number }).c,
    };
  } catch {
    counts = {};
  }
  res.json({
    ok: true,
    dataDir: DATA_DIR,
    dbPath: DB_PATH,
    dbSize: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0,
    counts,
  });
});

app.use('/api/uploads', express.static(UPLOADS_DIR));

app.use('/api/users',       usersRouter);
app.use('/api/projects',    projectsRouter);
app.use('/api/rows',        rowsRouter);
app.use('/api/references',  referencesRouter);
app.use('/api/constants',   constantsRouter);
app.use('/api/briefings',   briefingsRouter);
app.use('/api/catalog',     catalogRouter);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads: ${UPLOADS_DIR}`);
});
