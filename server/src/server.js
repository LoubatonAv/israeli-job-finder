import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  FEEDBACK_FILE,
  JOBS_FILE,
  KEYWORDS_FILE,
  PROFILE_FILE,
  ROLE_PROFILES_FILE,
  SCAN_AUDIT_FILE,
  SITE_SOURCES_FILE,
} from './paths.js';
import { readJson, writeJson } from './fileStore.js';
import { findJobs } from './findJobs.js';
import { createFeedbackEntry } from './learning.js';
import { createJobId, uniqueById } from './utils.js';
import {
  getGmailAuthUrl,
  getGmailConnectionStatus,
  saveGmailTokensFromCode,
} from './gmailAuth.js';
import { getImportedGmailJobs, importGmailJobEmails } from './gmailImport.js';

const app = express();
const port = Number(process.env.PORT || 4000);

const ALLOWED_STATUSES = new Set(['found', 'saved', 'applied', 'interview', 'archived', 'rejected', 'skipped']);
const FEEDBACK_STATUSES = new Set(['saved', 'applied', 'interview', 'rejected', 'skipped']);
const MAIN_LOCATION_KEYS = new Set([
  'haifa',
  'krayot',
  'yokneam',
  'north',
  'remote',
  'nesher',
  'tirat_carmel',
  'nahariya',
  'acre',
  'karmiel',
]);


function buildScanSummary(audit = {}, savedJobs = [], feedback = [], siteSources = []) {
  const jobs = Array.isArray(audit.jobs) ? audit.jobs : [];
  const bySource = jobs.reduce((acc, job) => {
    const source = job.source || 'מקור לא ידוע';
    if (!acc[source]) {
      acc[source] = { source, total: 0, kept: 0, filtered: 0, apply: 0, review: 0 };
    }

    acc[source].total += 1;
    if (job.kept) acc[source].kept += 1;
    else acc[source].filtered += 1;
    if (job.recommendation === 'apply') acc[source].apply += 1;
    if (job.recommendation === 'review') acc[source].review += 1;

    return acc;
  }, {});

  return {
    createdAt: audit.createdAt || null,
    totals: audit.totals || { incoming: 0, scored: 0, kept: savedJobs.length, filtered: 0 },
    savedJobs: savedJobs.length,
    feedbackEvents: feedback.length,
    activeSiteSources: siteSources.filter((source) => source && source.enabled !== false).length,
    bySource: Object.values(bySource).sort((a, b) => b.kept - a.kept || b.total - a.total),
  };
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

async function appendFeedback(job, action, metadata = {}) {
  const feedback = await readJson(FEEDBACK_FILE, []);
  feedback.push(createFeedbackEntry(job, action, metadata));
  await writeJson(FEEDBACK_FILE, feedback.slice(-1500));
}

function getReviewKey(job = {}) {
  const url = String(job.url || '');
  const allJobsId = url.match(/[?&]JobID=(\d+)/i)?.[1];
  if (allJobsId) return `alljobs:${allJobsId}`;

  const jobMasterKey = url.match(/jobmaster\.co\.il.*key=(\d+)/i)?.[1];
  if (jobMasterKey) return `jobmaster:${jobMasterKey}`;

  return [job.title, job.company, job.locationKey || job.location]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
}

function getReviewId(job = {}) {
  return Buffer.from(getReviewKey(job), 'utf8').toString('base64url');
}

function getFeedbackReviewKey(item = {}) {
  return item.reviewKey || getReviewKey(item);
}

function buildReviewJobs(audit = {}, savedJobs = [], feedback = []) {
  const savedKeys = new Set(savedJobs.map(getReviewKey));
  const handledReviewKeys = new Set(
    feedback
      .filter((item) => ['saved', 'applied', 'interview', 'deleted', 'rejected', 'skipped', 'not_relevant'].includes(item?.action))
      .map(getFeedbackReviewKey)
      .filter(Boolean),
  );
  const reviewMap = new Map();

  for (const job of audit.jobs || []) {
    const key = getReviewKey(job);
    if (!key || savedKeys.has(key) || handledReviewKeys.has(key) || job.kept) continue;
    if (!MAIN_LOCATION_KEYS.has(job.locationKey)) continue;

    const looksInteresting =
      job.decision === 'filtered_other' ||
      job.recommendation === 'apply' ||
      job.recommendation === 'review' ||
      Number(job.fitScore || 0) >= 50;

    if (!looksInteresting) continue;

    const existing = reviewMap.get(key);
    if (!existing || Number(job.fitScore || 0) > Number(existing.fitScore || 0)) {
      reviewMap.set(key, {
        ...job,
        id: getReviewId(job),
        reviewKey: key,
        status: 'found',
        fromManualReview: true,
      });
    }
  }

  return [...reviewMap.values()].sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0));
}

function findReviewJobById(audit = {}, savedJobs = [], feedback = [], reviewId = '') {
  return buildReviewJobs(audit, savedJobs, feedback).find((job) => job.id === reviewId);
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

app.get('/api/jobs/review', async (req, res, next) => {
  try {
    const [audit, savedJobs, feedback] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, { jobs: [] }),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
    ]);

    res.json(buildReviewJobs(audit, savedJobs, feedback));
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

app.post('/api/jobs/review/:id/promote', async (req, res, next) => {
  try {
    const status = String(req.body?.status || 'saved').trim();
    if (!['saved', 'applied', 'interview'].includes(status)) {
      res.status(400).json({ error: `סטטוס לא תקין: ${status}` });
      return;
    }

    const [audit, savedJobs, feedback] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, { jobs: [] }),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
    ]);

    const reviewJob = findReviewJobById(audit, savedJobs, feedback, req.params.id);
    if (!reviewJob) {
      res.status(404).json({ error: 'המשרה לבדיקה לא נמצאה או כבר טופלה' });
      return;
    }

    const now = new Date().toISOString();
    const promotedJob = {
      ...reviewJob,
      id: createJobId(reviewJob),
      status,
      promotedFromReview: true,
      updatedAt: now,
      foundAt: reviewJob.foundAt || now,
    };

    const reviewKey = getReviewKey(promotedJob);
    const existingIndex = savedJobs.findIndex(
      (job) => job.id === promotedJob.id || getReviewKey(job) === reviewKey,
    );

    if (existingIndex >= 0) {
      savedJobs[existingIndex] = {
        ...savedJobs[existingIndex],
        ...promotedJob,
        status,
        updatedAt: now,
      };
    } else {
      savedJobs.push(promotedJob);
    }

    const merged = uniqueById(savedJobs);
    await writeJson(JOBS_FILE, merged);
    await appendFeedback(promotedJob, status, {
      reviewKey,
      fromManualReview: true,
    });

    res.json(promotedJob);
  } catch (error) {
    next(error);
  }
});

app.post('/api/jobs/review/:id/reject', async (req, res, next) => {
  try {
    const [audit, savedJobs, feedback] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, { jobs: [] }),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
    ]);

    const reviewJob = findReviewJobById(audit, savedJobs, feedback, req.params.id);
    if (!reviewJob) {
      res.status(404).json({ error: 'המשרה לבדיקה לא נמצאה או כבר טופלה' });
      return;
    }

    await appendFeedback(
      { ...reviewJob, id: reviewJob.id || createJobId(reviewJob) },
      'deleted',
      {
        rejectionReason: req.body?.rejectionReason || req.body?.reason,
        reviewKey: getReviewKey(reviewJob),
        fromManualReview: true,
      },
    );

    res.json({ ok: true, removed: 1 });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/jobs/:id', async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const index = jobs.findIndex((job) => job.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: 'המשרה לא נמצאה' });
      return;
    }

    const currentJob = jobs[index];
    const patch = {};

    if ('status' in req.body) {
      const status = String(req.body.status || '').trim();
      if (!ALLOWED_STATUSES.has(status)) {
        res.status(400).json({ error: `סטטוס לא תקין: ${status}` });
        return;
      }
      patch.status = status;
    }

    if ('notes' in req.body) {
      patch.notes = String(req.body.notes || '').slice(0, 2000);
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'לא נשלח שדה לעדכון' });
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
    const index = jobs.findIndex((job) => job.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: 'המשרה לא נמצאה' });
      return;
    }

    const now = new Date().toISOString();
    const archivedJob = {
      ...jobs[index],
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
      archiveReason: req.body?.rejectionReason || req.body?.reason || 'other',
    };

    jobs[index] = archivedJob;
    await writeJson(JOBS_FILE, uniqueById(jobs));
    await appendFeedback(archivedJob, 'deleted', {
      rejectionReason: req.body?.rejectionReason || req.body?.reason,
    });

    res.json({ ok: true, archived: 1, job: archivedJob });
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

app.get('/api/role-profiles', async (req, res, next) => {
  try {
    res.json(await readJson(ROLE_PROFILES_FILE, []));
  } catch (error) {
    next(error);
  }
});

app.get('/api/sources', async (req, res, next) => {
  try {
    res.json(await readJson(SITE_SOURCES_FILE, []));
  } catch (error) {
    next(error);
  }
});


app.get('/api/gmail/status', async (req, res, next) => {
  try {
    res.json(await getGmailConnectionStatus());
  } catch (error) {
    next(error);
  }
});

app.get('/api/gmail/auth-url', async (req, res, next) => {
  try {
    res.json({ url: getGmailAuthUrl() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/gmail/oauth2callback', async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      res.status(400).send('Missing OAuth code');
      return;
    }

    await saveGmailTokensFromCode(code);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.send(`
      <html dir="rtl" lang="he">
        <head>
          <meta charset="utf-8" />
          <title>Gmail חובר</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 32px; background: #f8fafc; color: #0f172a;">
          <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 24px; padding: 28px; box-shadow: 0 18px 45px rgba(15,23,42,.12);">
            <h1 style="margin: 0 0 12px;">Gmail חובר בהצלחה</h1>
            <p style="font-size: 16px; line-height: 1.7;">אפשר לחזור לאפליקציה ולייבא מיילים רלוונטיים למשרות.</p>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = ${JSON.stringify(clientUrl)};
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Gmail OAuth callback failed:', error);
    res.status(500).send(`Gmail OAuth failed: ${error.message}`);
  }
});

app.post('/api/gmail/import', async (req, res, next) => {
  try {
    const days = Number.parseInt(req.body?.days || process.env.GMAIL_IMPORT_DAYS || '14', 10);
    const maxResults = Number.parseInt(
      req.body?.maxResults || process.env.GMAIL_IMPORT_MAX_RESULTS || '40',
      10,
    );

    res.json(await importGmailJobEmails({ days, maxResults }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/gmail/jobs', async (req, res, next) => {
  try {
    res.json(await getImportedGmailJobs());
  } catch (error) {
    next(error);
  }
});

app.get('/api/scan-summary', async (req, res, next) => {
  try {
    const [audit, jobs, feedback, siteSources] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, {}),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
      readJson(SITE_SOURCES_FILE, []),
    ]);

    res.json(buildScanSummary(audit, jobs, feedback, siteSources));
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'שגיאת שרת' });
});

app.listen(port, () => {
  console.log(`שרת חיפוש המשרות פעיל: http://localhost:${port}`);
});
