import fs from "node:fs/promises";
import { uniqueById } from "./server/src/utils.js";

const jobs = JSON.parse(await fs.readFile("./data/jobs.json", "utf8"));
const deduped = uniqueById(jobs);

console.log("Before:", jobs.length);
console.log("After:", deduped.length);
console.log("Removed:", jobs.length - deduped.length);

console.log("");
console.log("21062 matches after dedupe:");
console.table(
  deduped
    .filter((job) => String(job.title || "").includes("21062"))
    .map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      source: job.source,
      fitScore: job.fitScore,
      recommendation: job.recommendation,
      url: job.url,
    })),
);

await fs.writeFile(
  "./data/jobs.deduped-test.json",
  JSON.stringify(deduped, null, 2),
  "utf8",
);

console.log("");
console.log("Wrote test file: data/jobs.deduped-test.json");
