import fs from "node:fs";
import path from "node:path";
import { JOBS_FILE, DATA_DIR } from "./src/paths.js";

const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));

const backupFile = path.join(
  DATA_DIR,
  `jobs.backup-before-gmail-alljobs-dedupe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
);

fs.writeFileSync(backupFile, JSON.stringify(jobs, null, 2), "utf8");

const handledStatuses = new Set([
  "applied",
  "saved",
  "interview",
  "archived",
  "rejected",
  "skipped",
]);

const result = [];
const byKey = new Map();

for (const job of jobs) {
  const isAllJobsGmail =
    job.source === "Gmail · AllJobs" ||
    job.gmailDigestProvider === "alljobs";

  if (!isAllJobsGmail || handledStatuses.has(String(job.status || ""))) {
    result.push(job);
    continue;
  }

  const key = [
    job.title,
    job.company,
    job.location,
    job.gmailMessageId,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  if (!key) {
    result.push(job);
    continue;
  }

  const existingIndex = byKey.get(key);

  if (existingIndex === undefined) {
    byKey.set(key, result.length);
    result.push(job);
    continue;
  }

  const existing = result[existingIndex];

  const shouldReplace =
    (!existing.url && job.url) ||
    (
      Boolean(existing.url) === Boolean(job.url) &&
      String(job.description || "").length > String(existing.description || "").length
    );

  if (shouldReplace) {
    result[existingIndex] = job;
  }
}

fs.writeFileSync(JOBS_FILE, JSON.stringify(result, null, 2), "utf8");

console.log(`Backup: ${backupFile}`);
console.log(`Before: ${jobs.length}`);
console.log(`After: ${result.length}`);
console.log(`Removed: ${jobs.length - result.length}`);
