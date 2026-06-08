import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const jobsPath = path.join(rootDir, 'data', 'jobs.json');

function isFakeGmailSplitJob(job = {}) {
  const source = String(job.source || '');
  const title = String(job.title || '');

  return /Gmail/i.test(source) && /·\s*(AllJobs|Drushim|Indeed|LinkedIn)\s*#/i.test(title);
}

try {
  const raw = await fs.readFile(jobsPath, 'utf8');
  const jobs = JSON.parse(raw);

  if (!Array.isArray(jobs)) {
    throw new Error('data/jobs.json is not an array');
  }

  const before = jobs.length;
  const cleaned = jobs.filter((job) => !isFakeGmailSplitJob(job));
  const removed = before - cleaned.length;

  const backupPath = path.join(
    rootDir,
    'data',
    `jobs.backup-before-gmail-digest-clean-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );

  await fs.writeFile(backupPath, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8');
  await fs.writeFile(jobsPath, `${JSON.stringify(cleaned, null, 2)}\n`, 'utf8');

  console.log(`Backup written: ${backupPath}`);
  console.log(`Cleaned jobs.json: ${before} -> ${cleaned.length}`);
  console.log(`Removed fake Gmail split jobs: ${removed}`);
} catch (error) {
  console.error(`Failed to clean Gmail fake split jobs: ${error.message}`);
  process.exit(1);
}
