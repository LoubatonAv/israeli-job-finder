import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { FEEDBACK_FILE, JOBS_FILE, KEYWORDS_FILE, PROFILE_FILE } from './paths.js';
import { readJson, writeJson } from './fileStore.js';
import { findJobs } from './findJobs.js';
import { createFeedbackEntry } from './learning.js';

const app = express();
const port = Number(process.env.PORT || 4000);

const ALLOWED_STATUSES = new Set(['found', 'saved', 'applied', 'interview', 'rejected', 'skipped']);
const FEEDBACK_STATUSES = new Set(['saved', 'applied', 'interview', 'rejected', 'skipped']);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

async function appendFeedback(job, action, metadata = {}) {
  const feedback = await readJson(FEEDBACK_FILE, []);
  feedback.push(createFeedbackEntry(job, action, metadata));
  await writeJson(FEEDBACK_FILE, feedback.slice(-1000));
}

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

    const currentJob = jobs[index];
    const patch = {};

    if ('status' in req.body) {
      const status = String(req.body.status || '').trim();
      if (!ALLOWED_STATUSES.has(status)) {
        res.status(400).json({ error: `Invalid status: ${status}` });
        return;
      }
      patch.status = status;
    }

    if ('notes' in req.body) {
      patch.notes = String(req.body.notes || '').slice(0, 2000);
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No supported fields to update' });
      return;
    }

    const updatedJob = {
      ...currentJob,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    jobs[index] = updatedJob;
    await writeJson(JOBS_FILE, jobs);

    if (patch.status && patch.status !== currentJob.status && FEEDBACK_STATUSES.has(patch.status)) {
      await appendFeedback(updatedJob, patch.status);
    }

    res.json(updatedJob);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/jobs/:id', async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const jobToDelete = jobs.find((job) => job.id === req.params.id);

    if (!jobToDelete) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const filtered = jobs.filter((job) => job.id !== req.params.id);
    await writeJson(JOBS_FILE, filtered);
    await appendFeedback(jobToDelete, 'deleted', {
      rejectionReason: req.body?.rejectionReason || req.body?.reason,
    });

    res.json({ ok: true, removed: 1 });
  } catch (error) {
    next(error);
  }
});

app.get('/api/feedback', async (req, res, next) => {
  try {
    res.json(await readJson(FEEDBACK_FILE, []));
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
