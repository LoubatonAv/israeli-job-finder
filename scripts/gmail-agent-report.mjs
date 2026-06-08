import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const dataDir = path.join(rootDir, 'data');

async function readJson(fileName, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, fileName), 'utf8'));
  } catch {
    return fallback;
  }
}

function isGmailJob(job = {}) {
  return /Gmail/i.test(String(job.source || ''));
}

function isActive(job = {}) {
  return !['applied', 'interview', 'saved', 'archived', 'rejected', 'skipped'].includes(String(job.status || 'found'));
}

function countBy(list, getKey) {
  return list.reduce((acc, item) => {
    const key = getKey(item) || 'לא ידוע';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

const [jobs, gmailImports, feedback, state, trustedSenders] = await Promise.all([
  readJson('jobs.json', []),
  readJson('gmail-imports.json', []),
  readJson('feedback.json', []),
  readJson('gmail-agent-state.json', {}),
  readJson('trustedJobSenders.json', []),
]);

const gmailJobs = jobs.filter(isGmailJob);
const active = gmailJobs.filter(isActive);
const review = gmailJobs.filter((job) => job.recommendation === 'review');
const applied = gmailJobs.filter((job) => ['applied', 'interview'].includes(String(job.status || '')));
const fakeSplits = gmailJobs.filter((job) => /·\s*(AllJobs|Drushim|Indeed|LinkedIn)\s*#/i.test(String(job.title || '')));

console.log('==============================');
console.log('GMAIL AGENT REPORT');
console.log('==============================');
console.log(`Raw Gmail emails:     ${gmailImports.length}`);
console.log(`Gmail jobs in app:    ${gmailJobs.length}`);
console.log(`Active Gmail jobs:    ${active.length}`);
console.log(`Review Gmail jobs:    ${review.length}`);
console.log(`Applied Gmail jobs:   ${applied.length}`);
console.log(`Fake split jobs:      ${fakeSplits.length}`);
console.log(`Trusted senders:      ${trustedSenders.length}`);
console.log(`Processed messages:   ${(state.processedMessageIds || []).length}`);
console.log(`Feedback events:      ${feedback.length}`);
console.log('------------------------------');
console.log('By source:');
console.table(countBy(gmailJobs, (job) => job.source));
console.log('------------------------------');
console.log('Top active Gmail jobs:');
console.table(
  active
    .sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0))
    .slice(0, 15)
    .map((job) => ({
      title: String(job.title || '').slice(0, 70),
      source: job.source,
      score: job.fitScore,
      recommendation: job.recommendation,
      status: job.status || 'found',
    })),
);
