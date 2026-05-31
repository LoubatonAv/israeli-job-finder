import fs from "node:fs/promises";
import { uniqueById } from "./server/src/utils.js";

const jobs = JSON.parse(await fs.readFile("./data/jobs.json", "utf8"));
const deduped = uniqueById(jobs);

await fs.writeFile("./data/jobs.json", JSON.stringify(deduped, null, 2), "utf8");

console.log(`Updated jobs.json: ${jobs.length} -> ${deduped.length}`);
