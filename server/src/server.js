import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { JOBS_FILE, KEYWORDS_FILE, PROFILE_FILE } from './paths.js';
import { readJson, writeJson } from './fileStore.js';
import { findJobs } from './findJobs.js';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'israel-job-finder' });
});

app.get('/api/jobs', async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

app.post('/api/jobs/find', async (req, res, next) => {
  try {
    const result = await findJobs({ useMock: false });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/jobs/mock', async (req, res, next) => {
  try {
    const result = await findJobs({ useMock: true });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/jobs/:id', async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const index = jobs.findIndex((job) => job.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    jobs[index] = {
      ...jobs[index],
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    await writeJson(JOBS_FILE, jobs);
    res.json(jobs[index]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/jobs/:id', async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const filtered = jobs.filter((job) => job.id !== req.params.id);
    await writeJson(JOBS_FILE, filtered);
    res.json({ ok: true, removed: jobs.length - filtered.length });
  } catch (error) {
    next(error);
  }
});

app.get('/api/profile', async (req, res, next) => {
  try {
    res.json(await readJson(PROFILE_FILE, {}));
  } catch (error) {
    next(error);
  }
});

app.get('/api/keywords', async (req, res, next) => {
  try {
    res.json(await readJson(KEYWORDS_FILE, {}));
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Server error' });
});

app.listen(port, () => {
  console.log(`Israel Job Finder server running on http://localhost:${port}`);
});
