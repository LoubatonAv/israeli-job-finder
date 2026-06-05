import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const jobsPath = path.join(rootDir, 'data', 'jobs.json');

const archivedDays = Number.parseInt(process.env.CLEANUP_ARCHIVED_DAYS || '30', 10);
const appliedDays = Number.parseInt(process.env.CLEANUP_APPLIED_DAYS || '180', 10);
const dryRun = String(process.env.CLEANUP_DRY_RUN || '').toLowerCase() === 'true';

function isValidDays(value) {
  return Number.isFinite(value) && value >= 0;
}

function cutoffDate(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function getJobTime(job = {}) {
  const value = job.archivedAt || job.updatedAt || job.foundAt || job.createdAt;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shouldRemove(job = {}) {
  const status = String(job.status || 'found');
  const time = getJobTime(job);

  if (status === 'archived') {
    return isValidDays(archivedDays) && time < cutoffDate(archivedDays);
  }

  if (status === 'applied' || status === 'interview') {
    return isValidDays(appliedDays) && time < cutoffDate(appliedDays);
  }

  return false;
}

const raw = await fs.readFile(jobsPath, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '[]';
  throw error;
});

const jobs = JSON.parse(raw || '[]');
const kept = [];
const removed = [];

for (const job of jobs) {
  if (shouldRemove(job)) removed.push(job);
  else kept.push(job);
}

console.log(`Jobs before cleanup: ${jobs.length}`);
console.log(`Will keep: ${kept.length}`);
console.log(`Will remove: ${removed.length}`);
console.log(`Archived cleanup after days: ${archivedDays}`);
console.log(`Applied cleanup after days: ${appliedDays}`);

if (removed.length) {
  console.table(
    removed.slice(0, 20).map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      status: job.status,
      updatedAt: job.updatedAt || job.archivedAt || job.foundAt,
    })),
  );
}

if (dryRun) {
  console.log('Dry run only. Nothing was changed.');
  process.exit(0);
}

const backupPath = path.join(
  rootDir,
  'data',
  `jobs.backup-before-cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);

await fs.writeFile(backupPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
await fs.writeFile(jobsPath, `${JSON.stringify(kept, null, 2)}\n`, 'utf8');

console.log(`Backup written: ${backupPath}`);
console.log(`Updated jobs.json: ${jobs.length} -> ${kept.length}`);
