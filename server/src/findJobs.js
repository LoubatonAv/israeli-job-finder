import {
  FEEDBACK_FILE,
  JOBS_FILE,
  KEYWORDS_FILE,
  PROFILE_FILE,
  SCAN_AUDIT_FILE,
  SITE_SOURCES_FILE,
} from "./paths.js";
import { readJson, writeJson } from "./fileStore.js";
import { createJobId, getBestApplyLink, uniqueById } from "./utils.js";
import { scoreJob } from "./scoring.js";
import { searchGoogleOrganic } from "./googleSearch.js";
import { searchWithPlaywright } from "./playwrightCrawler.js";
import { searchDrushim } from "./drushimCrawler.js";
import { searchJobMaster } from "./jobmasterCrawler.js";
import { searchAllJobs } from "./alljobsCrawler.js";
import { searchMatrix } from "./matrixCrawler.js";
import { searchSiteSources } from "./siteSourcesCrawler.js";
import { enrichJob } from "./enrichJob.js";
import { shouldSkipBadJob } from "./jobGuards.js";
import { getRoleProfiles } from "./roleProfiles.js";

const scanStats = {};

const DEBUG_JOBS =
  String(process.env.DEBUG_JOBS || "").toLowerCase() === "true";
const DEBUG_DRY_RUN =
  String(process.env.DEBUG_DRY_RUN || "").toLowerCase() === "true";

const DEBUG_JOB_LIMIT = Number.parseInt(
  process.env.DEBUG_JOB_LIMIT || "10",
  10,
);

function limitDebugJobs(jobs) {
  if (!DEBUG_JOBS) return jobs;

  const safeLimit =
    Number.isFinite(DEBUG_JOB_LIMIT) && DEBUG_JOB_LIMIT > 0
      ? DEBUG_JOB_LIMIT
      : 10;

  return jobs.slice(0, safeLimit);
}

function printDebugJobPreview(jobs, label = "DEBUG JOBS") {
  if (!DEBUG_JOBS) return;

  console.log("");
  console.log("==============================");
  console.log(label);
  console.log("==============================");

  for (const [index, job] of jobs.entries()) {
    console.log(
      [
        `#${index + 1}`,
        job.title,
        `company: ${job.company || "?"}`,
        `location: ${job.location || "?"}`,
        `locationKey: ${job.locationKey || "?"}`,
        `role: ${job.roleFamily || "?"}/${job.roleType || "?"}`,
        `seniority: ${job.seniority || "?"}`,
        `score: ${job.fitScore ?? "not scored"}`,
        `status: ${job.status || "?"}`,
      ].join(" | "),
    );
  }

  console.log("==============================");
  console.log("");
}

function hasBadSeniorityForMainList(job = {}) {
  const text = [job.title, job.description, ...(job.warnings || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /ראש\s*צוות|ר["״]?צ|cto|מנהל\/ת|מנהל|בכיר|בכירה|team\s*lead|lead|manager|5-6\s*שנים|4\s*שנים|4\+|5\+|6\s*שנים|ניסיון\s*מוכח/i.test(
    text,
  );
}

function hasJunkBusinessModel(job = {}) {
  const text = [job.title, job.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /תיירות|חופשות|נופש|סוכני(?:\/ות)?\s*תיירות|רווחים\s*גבוהים|הכנסה\s*גבוהה|פנה(?:\/י)?\s*ללא\s*קו[״"]?ח/i.test(
    text,
  );
}

function hasAdminOrNonSoftwareNoise(job = {}) {
  const text = [job.title, job.company, job.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /פקיד|פקידת|בק\s*אופיס|back\s*office|לוגיסטיקה|מעבדה|פארמה|אצוות|מחסן|אדמיניסטרציה/i.test(
    text,
  );
}

function normalizeFingerprintText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\b\d{4,6}\s*-\s*/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStableJobKey(job = {}) {
  const url = String(job.url || job.link || "");

  const allJobsJobId = url.match(/[?&]JobID=(\d+)/i)?.[1];
  if (allJobsJobId) return `alljobs:${allJobsJobId}`;

  const drushimJobId = url.match(/drushim\.co\.il\/job\/([^/]+)/i)?.[1];
  if (drushimJobId) return `drushim:${drushimJobId}`;

  const jobMasterKey = url.match(/jobmaster\.co\.il.*key=(\d+)/i)?.[1];
  if (jobMasterKey) return `jobmaster:${jobMasterKey}`;

  return [
    String(job.title || "")
      .trim()
      .toLowerCase(),
    String(job.company || "")
      .trim()
      .toLowerCase(),
    String(job.location || "")
      .trim()
      .toLowerCase(),
  ]
    .filter(Boolean)
    .join("|");
}

function getJobFingerprint(job = {}) {
  const url = String(job.url || job.link || "");

  const allJobsJobId = url.match(/[?&]JobID=(\d+)/i)?.[1];

  if (job.source === "AllJobs" && allJobsJobId) {
    return `alljobs:${allJobsJobId}`;
  }

  const title = normalizeFingerprintText(job.title);
  const company = normalizeFingerprintText(job.company);
  const location = normalizeFingerprintText(job.locationKey || job.location);
  const role = normalizeFingerprintText(job.roleType || job.roleFamily);

  return [title, company, location, role].filter(Boolean).join("|");
}

function dedupeJobsByFingerprint(jobs = []) {
  const seen = new Map();

  for (const job of jobs) {
    const fingerprint = getJobFingerprint(job);

    if (!fingerprint) continue;

    const existing = seen.get(fingerprint);

    if (!existing) {
      seen.set(fingerprint, job);
      continue;
    }

    const existingScore = existing.fitScore ?? 0;
    const currentScore = job.fitScore ?? 0;

    // שומר את הגרסה הטובה יותר אם יש כפילות
    if (currentScore > existingScore) {
      seen.set(fingerprint, job);
    }
  }

  return [...seen.values()];
}

function isUsableJob(job = {}) {
  const score = Number(job.fitScore ?? 0);
  const source = String(job.source || "");
  const url = String(job.url || job.link || "");
  const locationKey = String(job.locationKey || "");
  const locationText = String(job.location || "");
  const recommendation = String(job.recommendation || "");
  const status = String(job.status || "");
  const roleFamily = String(job.roleFamily || "");

  const allowedMainLocationKeys = new Set([
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

  if (!allowedMainLocationKeys.has(locationKey)) {
    return false;
  }

  const blockedLocationText =
    /אור\s*יהודה|קיסריה|לוד|ראשון\s*לציון|חולון|רמת\s*גן|תל\s*אביב|ירושלים|באר\s*שבע|פתח\s*תקווה|ראש\s*העין|מרכז/i;

  const blockedLocationKeys = new Set([
    "or_yehuda",
    "caesarea",
    "kesariya",
    "lod",
    "rishon_lezion",
    "holon",
    "ramat_gan",
    "tel_aviv",
    "jerusalem",
    "beer_sheva",
    "petah_tikva",
    "center",
    "ראש_העין",
    "אור_יהודה",
    "קיסריה",
    "לוד",
  ]);

  if (
    blockedLocationKeys.has(locationKey) ||
    blockedLocationText.test(locationText) ||
    blockedLocationText.test(locationKey.replaceAll("_", " "))
  ) {
    return false;
  }

  if (status === "skipped") return false;
  if (recommendation === "skip") return false;
  if (score <= 0) return false;
  if (roleFamily === "irrelevant") return false;
  if (job.isRelevantRole === false) return false;
  if (hasJunkBusinessModel(job)) return false;
  if (hasAdminOrNonSoftwareNoise(job)) return false;

  const dynamicMinScore = Number(job.mainListMinScore || 55);

  if (source === "AllJobs") {
    if (!/JobID=\d+/i.test(url)) return false;

    if (
      /סוג_?משרה|היקף_?משרה|דרישות/i.test(locationKey) ||
      /סוג\s*משרה|היקף\s*משרה|דרישות/i.test(locationText)
    ) {
      return false;
    }

    if (hasBadSeniorityForMainList(job)) return false;

    if (job.roleProfileId) {
      return score >= Math.max(55, dynamicMinScore);
    }

    if (roleFamily === "qa" || roleFamily === "automation") {
      return score >= 50;
    }

    if (roleFamily === "information_systems") {
      return score >= 65;
    }

    if (roleFamily === "information") {
      return score >= 70;
    }

    if (roleFamily === "analysis" || roleFamily === "operations") {
      return score >= 60;
    }

    return false;
  }

  if (job.roleProfileId) {
    if (hasBadSeniorityForMainList(job)) return false;
    return score >= dynamicMinScore;
  }

  if (roleFamily === "qa" || roleFamily === "automation") {
    if (hasBadSeniorityForMainList(job)) return false;
    return score >= 25;
  }

  if (roleFamily === "information_systems") {
    if (hasBadSeniorityForMainList(job)) return false;
    return score >= 45;
  }

  if (roleFamily === "information") {
    if (hasBadSeniorityForMainList(job)) return false;
    return score >= 60;
  }

  if (roleFamily === "analysis" || roleFamily === "operations") {
    if (hasBadSeniorityForMainList(job)) return false;
    return score >= 55;
  }

  return score >= 70;
}
function getAuditDecision(job = {}, keptKeys = new Set(), keptIds = new Set()) {
  if (keptKeys.has(getStableJobKey(job)) || keptIds.has(job.id)) {
    return "kept_duplicate_or_saved";
  }

  if (job.status === "skipped") {
    return "filtered_status_skipped";
  }

  if (job.recommendation === "skip") {
    return "filtered_recommendation_skip";
  }

  if (job.roleFamily === "irrelevant") {
    return "filtered_irrelevant_role";
  }

  if ((job.fitScore ?? 0) < 40) {
    return "filtered_low_score";
  }

  return "filtered_other";
}

function buildScanAudit({
  incomingJobs = [],
  scoredIncoming = [],
  jobsForThisRun = [],
}) {
  const keptKeys = new Set(jobsForThisRun.map(getStableJobKey));
  const keptIds = new Set(jobsForThisRun.map((job) => job.id));

  return {
    createdAt: new Date().toISOString(),
    totals: {
      incoming: incomingJobs.length,
      scored: scoredIncoming.length,
      kept: jobsForThisRun.length,
      filtered: Math.max(scoredIncoming.length - jobsForThisRun.length, 0),
    },
    jobs: scoredIncoming.map((job) => {
      const stableKey = getStableJobKey(job);
      const kept = keptKeys.has(stableKey) || keptIds.has(job.id);

      return {
        decision: getAuditDecision(job, keptKeys, keptIds),
        kept,
        title: job.title,
        company: job.company,
        location: job.location,
        locationKey: job.locationKey,
        source: job.source,
        sourceQuery: job.sourceQuery,
        url: job.url,
        roleFamily: job.roleFamily,
        roleType: job.roleType,
        roleProfileId: job.roleProfileId,
        roleProfileName: job.roleProfileName,
        seniority: job.seniority,
        isRelevantRole: job.isRelevantRole,
        fitScore: job.fitScore,
        recommendation: job.recommendation,
        status: job.status,
        reasons: job.reasons || [],
        warnings: job.warnings || [],
      };
    }),
  };
}

async function writeScanAuditFile({
  incomingJobs,
  scoredIncoming,
  jobsForThisRun,
}) {
  const audit = buildScanAudit({
    incomingJobs,
    scoredIncoming,
    jobsForThisRun,
  });

  await writeJson(SCAN_AUDIT_FILE, audit);

  console.log(
    `Scan audit written: ${SCAN_AUDIT_FILE} | kept ${audit.totals.kept}/${audit.totals.scored}`,
  );
}

function resetScanStats() {
  for (const key of Object.keys(scanStats)) {
    delete scanStats[key];
  }
}

function initProviderStats(providerName) {
  if (!scanStats[providerName]) {
    scanStats[providerName] = {
      raw: 0,
      normalized: 0,
      scored: 0,
      errors: 0,
    };
  }
}

function addProviderStats(providerName, updates = {}) {
  initProviderStats(providerName);

  for (const [key, value] of Object.entries(updates)) {
    scanStats[providerName][key] = (scanStats[providerName][key] || 0) + value;
  }
}

function printScanSummary({ incomingJobs, newJobs, merged }) {
  console.log("");
  console.log("==============================");
  console.log("SCAN SUMMARY");
  console.log("==============================");

  const entries = Object.entries(scanStats);

  if (!entries.length) {
    console.log("No provider stats collected.");
  }

  for (const [provider, stats] of entries) {
    console.log(
      `${provider.padEnd(10)} raw: ${String(stats.raw).padStart(
        3,
      )} | normalized: ${String(stats.normalized).padStart(
        3,
      )} | scored: ${String(stats.scored).padStart(3)} | errors: ${
        stats.errors
      }`,
    );
  }

  console.log("------------------------------");
  console.log(`Incoming total: ${incomingJobs.length}`);
  console.log(`New jobs:       ${newJobs.length}`);
  console.log(`Saved total:    ${merged.length}`);
  console.log("==============================");
  console.log("");
}

function sortJobs(jobs) {
  return jobs.sort((a, b) => {
    const scoreDiff = (b.fitScore || 0) - (a.fitScore || 0);
    if (scoreDiff) return scoreDiff;

    return new Date(b.foundAt || 0) - new Date(a.foundAt || 0);
  });
}

function finalizeNormalizedJob(job) {
  const enrichedJob = enrichJob(job);

  if (shouldSkipBadJob(enrichedJob)) {
    return {
      id: createJobId(enrichedJob),
      ...enrichedJob,
      status: "skipped",
      fitScore: 0,
      recommendation: "skip",
      reasons: [],
      warnings: [
        ...(enrichedJob.warnings || []),
        "Skipped: likely search/category/page dump, not a real job card.",
      ],
    };
  }

  return {
    id: createJobId(enrichedJob),
    ...enrichedJob,
  };
}

function normalizeSerpJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.company_name || "Unknown company",
    location: result.location || "Israel",
    description: result.description || "",
    via: result.via || "",
    source: "SerpApi Google Jobs",
    sourceQuery,
    url: getBestApplyLink(result),
    jobIdFromSource: result.job_id || "",
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizeDrushimJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.company || "Drushim",
    location: result.location || "Israel",
    description: result.description || "",
    via: "Drushim Direct",
    source: "Drushim",
    sourceQuery,
    url: result.link,
    jobIdFromSource: result.link || "",
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizeAllJobsJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.company || "AllJobs",
    location: result.location || "Israel",
    description: result.description || "",
    via: "AllJobs Direct",
    source: "AllJobs",
    sourceQuery,
    url: result.link,
    jobIdFromSource: result.link || `${result.title}-${result.company}`,
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizeJobMasterJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.company || "JobMaster",
    location: result.location || "Israel",
    description: result.description || "",
    via: "JobMaster Direct",
    source: "JobMaster",
    sourceQuery,
    url: result.link,
    jobIdFromSource: result.link || "",
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizeMatrixJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.company || "Matrix",
    location: result.location || "Israel",
    description: result.description || "",
    via: "Matrix Direct",
    source: "Matrix",
    sourceQuery,
    url: result.link,
    jobIdFromSource: result.link || `${result.title}-${result.company}`,
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizeSiteSourceJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.company || result.sourceName || "אתר מקור",
    location: result.location || "Israel",
    description: result.description || "",
    via: result.via || result.sourceName || "אתרי מקור",
    source: result.sourceName || "אתרי מקור",
    sourceQuery: result.originalQuery || sourceQuery,
    url: result.link,
    jobIdFromSource: result.jobIdFromSource || result.link || "",
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizeOrganicJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: result.source || extractCompanyFromLink(result.link),
    location: "Israel",
    description: result.snippet || "",
    via: "Google Search",
    source: "Google Organic",
    sourceQuery,
    url: result.link,
    jobIdFromSource: result.link || "",
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function normalizePlaywrightJob(result, sourceQuery) {
  const job = {
    title: result.title || "Untitled job",
    company: extractCompanyFromLink(result.link),
    location: "Israel",
    description: result.snippet || result.title || "",
    via: "Playwright Google Search",
    source: "Playwright",
    sourceQuery,
    url: result.link,
    jobIdFromSource: result.link || "",
    foundAt: new Date().toISOString(),
    status: "found",
  };

  return finalizeNormalizedJob(job);
}

function extractCompanyFromLink(link = "") {
  try {
    const host = new URL(link).hostname.replace("www.", "");
    return host.split(".")[0];
  } catch {
    return "Unknown company";
  }
}

function getSearchProviders() {
  const raw =
    process.env.SEARCH_PROVIDERS || process.env.SEARCH_PROVIDER || "playwright";

  const normalized = raw
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.includes("both")) {
    return ["playwright", "drushim", "serpapi"];
  }

  if (normalized.includes("all")) {
    return [
      "playwright",
      "drushim",
      "jobmaster",
      "alljobs",
      "matrix",
      "sites",
      "serpapi",
    ];
  }

  return normalized;
}

function usesProvider(providers, provider) {
  return providers.includes(provider);
}

async function savePartialJobs({ currentJobs, scoredPartialJobs }) {
  const jobsForThisPartialRun = limitDebugJobs(
    scoredPartialJobs.filter(isUsableJob),
  );

  printDebugJobPreview(jobsForThisPartialRun, "DEBUG PARTIAL JOB PREVIEW");

  const partialMerged = sortJobs(
    uniqueById([...currentJobs, ...jobsForThisPartialRun]),
  );

  if (DEBUG_DRY_RUN) {
    console.log(
      `DEBUG_DRY_RUN=true — not writing partial jobs.json. Would save ${partialMerged.length} jobs so far.`,
    );
    return;
  }

  console.log(`Writing partial jobs.json to: ${JOBS_FILE}`);
  await writeJson(JOBS_FILE, partialMerged);
  console.log(
    `Wrote partial jobs.json: ${JOBS_FILE} (${partialMerged.length} jobs)`,
  );

  console.log(`Saved ${partialMerged.length} jobs so far`);
}

export async function findJobs({ useMock = false } = {}) {
  resetScanStats();

  const [profile, keywords, existingJobs, feedback, siteSources] = await Promise.all([
    readJson(PROFILE_FILE, {}),
    readJson(KEYWORDS_FILE, {}),
    readJson(JOBS_FILE, []),
    readJson(FEEDBACK_FILE, []),
    readJson(SITE_SOURCES_FILE, []),
  ]);

  let incomingJobs = [];

  if (useMock) {
    incomingJobs = getMockJobs();
    addProviderStats("Mock", {
      raw: incomingJobs.length,
      normalized: incomingJobs.length,
      scored: incomingJobs.length,
    });
  } else {
    const apiKey = process.env.SERPAPI_API_KEY;
    const searchProviders = getSearchProviders();

    const needsSerpApi = usesProvider(searchProviders, "serpapi");

    if (needsSerpApi && (!apiKey || apiKey === "put_your_key_here")) {
      throw new Error(
        "Missing SERPAPI_API_KEY. Add it to server/.env or remove serpapi from SEARCH_PROVIDERS.",
      );
    }

    const roleProfileQueries = getRoleProfiles().flatMap((profile) => profile.queries || []);
    const allQueries = [
      ...(keywords.queries || []),
      ...(keywords.siteQueries || []),
      ...roleProfileQueries,
    ].filter(Boolean);

    for (const query of allQueries) {
      // Playwright
      if (usesProvider(searchProviders, "playwright")) {
        try {
          console.log(`Searching Playwright: "${query}"`);

          const results = await searchWithPlaywright({ query });
          addProviderStats("Playwright", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizePlaywrightJob(result, query))
            .filter((job) => job.status !== "skipped");

          addProviderStats("Playwright", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("Playwright", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("Playwright", { errors: 1 });
          console.warn(`Skipped Playwright query "${query}": ${error.message}`);
        }
      }

      // Drushim
      if (usesProvider(searchProviders, "drushim")) {
        try {
          console.log(`Searching Drushim: "${query}"`);

          const results = await searchDrushim({ query });
          addProviderStats("Drushim", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizeDrushimJob(result, query))
            .filter((job) => job.status !== "skipped");

          addProviderStats("Drushim", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("Drushim", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("Drushim", { errors: 1 });
          console.warn(`Skipped Drushim query "${query}": ${error.message}`);
          console.warn(error.stack || error);
        }
      }

      // JobMaster
      if (usesProvider(searchProviders, "jobmaster")) {
        try {
          console.log(`Searching JobMaster: "${query}"`);

          const results = await searchJobMaster({ query });
          addProviderStats("JobMaster", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizeJobMasterJob(result, query))
            .filter((job) => job.status !== "skipped");

          addProviderStats("JobMaster", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("JobMaster", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("JobMaster", { errors: 1 });
          console.warn(`Skipped JobMaster query "${query}": ${error.message}`);
          console.warn(error.stack || error);
        }
      }

      // AllJobs
      if (usesProvider(searchProviders, "alljobs")) {
        try {
          console.log(`Searching AllJobs: "${query}"`);

          const results = await searchAllJobs({ query });
          addProviderStats("AllJobs", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizeAllJobsJob(result, query))
            .filter((job) => job.status !== "skipped");
          addProviderStats("AllJobs", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("AllJobs", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("AllJobs", { errors: 1 });
          console.warn(`Skipped AllJobs query "${query}": ${error.message}`);
          console.warn(error.stack || error);
        }
      }

      // Matrix
      if (usesProvider(searchProviders, "matrix")) {
        try {
          console.log(`Searching Matrix: "${query}"`);

          const results = await searchMatrix({ query });
          addProviderStats("Matrix", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizeMatrixJob(result, query))
            .filter((job) => job.status !== "skipped");

          addProviderStats("Matrix", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("Matrix", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("Matrix", { errors: 1 });
          console.warn(`Skipped Matrix query "${query}": ${error.message}`);
          console.warn(error.stack || error);
        }
      }

      // Site sources via Google/Playwright
      if (usesProvider(searchProviders, "sites") || usesProvider(searchProviders, "site_sources")) {
        try {
          console.log(`Searching extra site sources: "${query}"`);

          const results = await searchSiteSources({ query, siteSources });
          addProviderStats("SiteSources", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizeSiteSourceJob(result, query))
            .filter((job) => job.status !== "skipped");

          addProviderStats("SiteSources", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("SiteSources", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("SiteSources", { errors: 1 });
          console.warn(`Skipped site sources query "${query}": ${error.message}`);
          console.warn(error.stack || error);
        }
      }

      // SerpApi / Google Organic
      if (usesProvider(searchProviders, "serpapi")) {
        try {
          console.log(`Searching SerpApi: "${query}"`);

          const data = await searchGoogleOrganic({
            apiKey,
            query,
            location: "Israel",
          });

          const results = data.organic_results || [];
          addProviderStats("SerpApi", { raw: results.length });

          const normalizedJobs = results
            .filter((result) => result.link && result.title)
            .map((result) => normalizeOrganicJob(result, query))
            .filter((job) => job.status !== "skipped");
          addProviderStats("SerpApi", { normalized: normalizedJobs.length });

          incomingJobs.push(...normalizedJobs);

          const scoredPartialJobs = normalizedJobs.map((job) => ({
            ...job,
            ...scoreJob(job, profile, keywords, feedback),
          }));

          addProviderStats("SerpApi", { scored: scoredPartialJobs.length });

          const currentJobs = await readJson(JOBS_FILE, []);

          await savePartialJobs({
            currentJobs,
            scoredPartialJobs,
          });
        } catch (error) {
          addProviderStats("SerpApi", { errors: 1 });
          console.warn(`Skipped SerpApi query "${query}": ${error.message}`);
        }
      }
    }
  }

  const scoredIncoming = incomingJobs.map((job) => ({
    ...job,
    ...scoreJob(job, profile, keywords, feedback),
  }));

  const usableScoredIncoming = scoredIncoming.filter(isUsableJob);
  const dedupedUsableScoredIncoming =
    dedupeJobsByFingerprint(usableScoredIncoming);
  const jobsForThisRun = limitDebugJobs(dedupedUsableScoredIncoming);

  await writeScanAuditFile({
    incomingJobs,
    scoredIncoming,
    jobsForThisRun,
  });

  printDebugJobPreview(jobsForThisRun, "DEBUG FINAL JOB PREVIEW");

  const existingById = new Map(existingJobs.map((job) => [job.id, job]));
  const newJobs = [];

  for (const job of jobsForThisRun) {
    if (!existingById.has(job.id)) {
      newJobs.push(job);
      existingById.set(job.id, job);
    }
  }

  const merged = sortJobs(uniqueById([...existingById.values()]));

  if (DEBUG_DRY_RUN) {
    console.log(
      `DEBUG_DRY_RUN=true — not writing final jobs.json. Would save total: ${merged.length}`,
    );
  } else {
    await writeJson(JOBS_FILE, merged);
  }

  console.log(`Scanned: ${jobsForThisRun.length} / ${incomingJobs.length}`);
  console.log(`New jobs: ${newJobs.length}`);
  console.log(`Total saved: ${merged.length}`);

  printScanSummary({
    incomingJobs,
    newJobs,
    merged,
  });

  return {
    scanned: incomingJobs.length,
    newJobs: newJobs.length,
    totalJobs: merged.length,
    jobs: merged,
    added: newJobs,
  };
}

export function getMockJobs() {
  const now = new Date().toISOString();

  return [
    {
      id: "mock-qa-automation-tel-aviv",
      title: "Junior QA Automation Engineer",
      company: "Example Security Company",
      location: "Tel Aviv, Israel",
      description:
        "Junior QA role working with API testing, JavaScript, automation scripts and Playwright. Hybrid work.",
      via: "Mock",
      source: "Mock",
      sourceQuery: "Junior QA Israel",
      url: "https://example.com/jobs/qa-automation",
      foundAt: now,
      status: "found",
    },
    {
      id: "mock-risk-analyst-israel",
      title: "Junior Risk Analyst",
      company: "Example Fintech",
      location: "Ramat Gan, Israel",
      description:
        "Entry level risk analyst role. SQL advantage. Fraud monitoring, suspicious patterns, operational analysis.",
      via: "Mock",
      source: "Mock",
      sourceQuery: "Risk Analyst Israel junior",
      url: "https://example.com/jobs/risk-analyst",
      foundAt: now,
      status: "found",
    },
    {
      id: "mock-senior-manager-skip",
      title: "Senior QA Team Lead",
      company: "Example Enterprise",
      location: "Israel",
      description:
        "Senior manager role, 7+ years experience, team lead responsibilities.",
      via: "Mock",
      source: "Mock",
      sourceQuery: "QA Israel",
      url: "https://example.com/jobs/senior-qa-lead",
      foundAt: now,
      status: "found",
    },
  ];
}
