import "dotenv/config";
import { findJobs } from "./findJobs.js";

try {
  const result = await findJobs({ useMock: false });

  if (result.added?.length) {
    console.log("");
    console.log("==============================");
    console.log("NEW JOBS");
    console.log("==============================");

    for (const job of result.added.slice(0, 10)) {
      console.log(
        `- [${job.fitScore}] ${job.title} — ${job.company} — ${job.location}`,
      );
      console.log(`  ${job.url}`);
    }

    if (result.added.length > 10) {
      console.log(`...and ${result.added.length - 10} more new jobs`);
    }

    console.log("==============================");
    console.log("");
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
