import 'dotenv/config';
import { findJobs } from './findJobs.js';

try {
  const result = await findJobs({ useMock: false });
  console.log(`Scanned: ${result.scanned}`);
  console.log(`New jobs: ${result.newJobs}`);
  console.log(`Total saved: ${result.totalJobs}`);
  for (const job of result.added.slice(0, 10)) {
    console.log(`- [${job.fitScore}] ${job.title} — ${job.company} — ${job.location}`);
    console.log(`  ${job.url}`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
