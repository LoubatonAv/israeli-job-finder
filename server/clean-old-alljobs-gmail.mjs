import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, JOBS_FILE } from "./src/paths.js";

const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));

const backupFile = path.join(
  DATA_DIR,
  `jobs.backup-before-clean-alljobs-gmail-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
);

fs.writeFileSync(backupFile, JSON.stringify(jobs, null, 2), "utf8");

const protectedStatuses = new Set(["applied", "saved", "archived", "rejected"]);

const cleaned = jobs.filter((job) => {
  const isAllJobsGmail =
    job.source === "Gmail · AllJobs" ||
    job.sourceQuery === "Gmail import · AllJobs digest split" ||
    job.gmailDigestProvider === "alljobs";

  const isImportedFromGmail = Boolean(job.gmailMessageId);

  const userAlreadyHandled = protectedStatuses.has(job.status);

  // Keep jobs you already handled manually.
  if (userAlreadyHandled) return true;

  // Remove unhandled AllJobs Gmail jobs, both old summaries and split jobs.
  // They will be rebuilt by the Gmail import.
  if (isAllJobsGmail && isImportedFromGmail) return false;

  return true;
});

fs.writeFileSync(JOBS_FILE, JSON.stringify(cleaned, null, 2), "utf8");

console.log(`Backup: ${backupFile}`);
console.log(`Jobs file: ${JOBS_FILE}`);
console.log(`Before: ${jobs.length}`);
console.log(`After: ${cleaned.length}`);
console.log(`Removed: ${jobs.length - cleaned.length}`);
