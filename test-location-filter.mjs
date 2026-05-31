import fs from "node:fs/promises";

const jobs = JSON.parse(await fs.readFile("./data/jobs.json", "utf8"));

const allowed = new Set([
  "haifa",
  "krayot",
  "yokneam",
  "north",
  "remote",
  "nesher",
  "tirat_carmel",
  "nahariya",
  "acre",
  "karmiel",
]);

const kept = jobs.filter((job) => allowed.has(job.locationKey));
const removed = jobs.filter((job) => !allowed.has(job.locationKey));

console.log("Before:", jobs.length);
console.log("After location filter:", kept.length);
console.log("Would remove:", removed.length);

console.log("");
console.log("Removed preview:");
console.table(
  removed.map((job) => ({
    title: job.title,
    location: job.location,
    locationKey: job.locationKey,
    source: job.source,
    fitScore: job.fitScore,
    recommendation: job.recommendation,
  })),
);
