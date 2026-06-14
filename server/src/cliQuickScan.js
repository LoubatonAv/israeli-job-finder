import "dotenv/config";

process.env.SEARCH_PROVIDERS = "alljobs,drushim";
process.env.SEARCH_PROVIDER = "alljobs,drushim";

process.env.SCAN_MAX_QUERIES = "2";
process.env.SCAN_BATCH_SIZE = "4";

process.env.ALLJOBS_MAX_PAGES = "3";
process.env.ALLJOBS_MAX_RESULTS = "60";
process.env.ALLJOBS_FETCH_DETAILS = "true";
process.env.ALLJOBS_DETAIL_LIMIT = "20";
process.env.ALLJOBS_DETAIL_DELAY_MS = "100";

process.env.DRUSHIM_MAX_RESULTS = "30";

console.log("Running QUICK job scan...");
await import("./cliFindJobs.js");
