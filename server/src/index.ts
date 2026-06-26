import express from 'express';
import cors from 'cors';
import { initDB } from './db';
import { seed } from './seed';
import { usersRouter } from './routes/users';
import { projectsRouter } from './routes/projects';
import { rowsRouter } from './routes/rows';
import { referencesRouter } from './routes/references';
import { constantsRouter } from './routes/constants';

initDB();
seed();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/users',       usersRouter);
app.use('/api/projects',    projectsRouter);
app.use('/api/rows',        rowsRouter);
app.use('/api/references',  referencesRouter);
app.use('/api/constants',   constantsRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
