import fs from "node:fs/promises";
import { uniqueById } from "./server/src/utils.js";

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

const jobs = JSON.parse(await fs.readFile("./data/jobs.json", "utf8"));

const deduped = uniqueById(jobs);
const cleaned = deduped.filter((job) => allowed.has(job.locationKey));

await fs.writeFile("./data/jobs.json", JSON.stringify(cleaned, null, 2), "utf8");

console.log(`Updated jobs.json: ${jobs.length} -> ${deduped.length} after dedupe -> ${cleaned.length} after location filter`);
