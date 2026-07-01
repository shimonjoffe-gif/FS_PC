import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDB } from './db';
import { seed } from './seed';
import { usersRouter } from './routes/users';
import { projectsRouter } from './routes/projects';
import { rowsRouter } from './routes/rows';
import { referencesRouter } from './routes/references';
import { constantsRouter } from './routes/constants';
import { briefingsRouter } from './routes/briefings';
import { catalogRouter } from './routes/catalog';

initDB();
seed();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const UPLOADS_DIR = path.join(process.cwd(), '..', 'data', 'uploads');
app.use('/api/uploads', express.static(UPLOADS_DIR));

app.use('/api/users',       usersRouter);
app.use('/api/projects',    projectsRouter);
app.use('/api/rows',        rowsRouter);
app.use('/api/references',  referencesRouter);
app.use('/api/constants',   constantsRouter);
app.use('/api/briefings',   briefingsRouter);
app.use('/api/catalog',     catalogRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
