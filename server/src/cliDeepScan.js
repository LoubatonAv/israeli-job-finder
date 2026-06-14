import "dotenv/config";

process.env.SEARCH_PROVIDERS = "alljobs,drushim,jobmaster";
process.env.SEARCH_PROVIDER = "alljobs,drushim,jobmaster";

process.env.SCAN_MAX_QUERIES = "8";
process.env.SCAN_BATCH_SIZE = "6";

process.env.ALLJOBS_MAX_PAGES = "8";
process.env.ALLJOBS_MAX_RESULTS = "180";
process.env.ALLJOBS_FETCH_DETAILS = "true";
process.env.ALLJOBS_DETAIL_LIMIT = "80";
process.env.ALLJOBS_DETAIL_DELAY_MS = "100";

process.env.DRUSHIM_MAX_RESULTS = "60";
process.env.JOBMASTER_MAX_RESULTS = "60";

console.log("Running DEEP job scan...");
await import("./cliFindJobs.js");
