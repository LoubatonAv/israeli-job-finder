import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const findJobsPath = path.join(root, "src", "findJobs.js");
const alljobsCrawlerPath = path.join(root, "src", "alljobsCrawler.js");
const scoringPath = path.join(root, "src", "scoring.js");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
}

function backup(filePath, label) {
  ensureFile(filePath);
  const backupPath = filePath.replace(/\.js$/i, `.backup-before-${label}-${stamp()}.js`);
  fs.copyFileSync(filePath, backupPath);
  console.log(`Backup: ${backupPath}`);
}

function replaceOrThrow(source, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) {
      throw new Error(`Could not find block: ${label}`);
    }
    return source.replace(pattern, replacement);
  }

  if (!pattern.test(source)) {
    throw new Error(`Could not find block: ${label}`);
  }

  return source.replace(pattern, replacement);
}

function upsertMarkedBlock(source, startMarker, endMarker, block, insertBefore) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start !== -1 && end !== -1 && end > start) {
    return source.slice(0, start) + block + source.slice(end + endMarker.length);
  }

  if (!source.includes(insertBefore)) {
    throw new Error(`Could not find insertion point: ${insertBefore}`);
  }

  return source.replace(insertBefore, `${block}\n${insertBefore}`);
}

function patchFindJobs() {
  backup(findJobsPath, "final-job-scan-fix");
  let source = fs.readFileSync(findJobsPath, "utf8");

  const helperStart = "// BEGIN FINAL_JOB_SCAN_FIX_HELPERS";
  const helperEnd = "// END FINAL_JOB_SCAN_FIX_HELPERS";
  const helperBlock = String.raw`${helperStart}
const FINAL_FIX_GOOD_LOCATION_KEYS = new Set([
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

const FINAL_FIX_BAD_LOCATION_TEXT =
  /אור\s*יהודה|קיסריה|לוד|ראשון\s*לציון|חולון|רמת\s*גן|תל\s*אביב|ירושלים|באר\s*שבע|שדרות|אשדוד|אשקלון|נתיבות|דרום|פתח\s*תקווה|ראש\s*העין|מרכז\s*הארץ|איזור\s*המרכז|אזור\s*המרכז|מרכז|השרון|שרון|השפלה|שפלה|בני\s*ברק|tel\s*aviv|jerusalem|sderot|ashdod|ashkelon|beer\s*sheva|beersheba|ramat\s*gan|petah\s*tikva|raanana|kfar\s*saba|bnei\s*brak|hod\s*hasharon|hasharon|sharon|shefela|shfela|south|southern|central\s*israel|center|centre|merkaz/i;

function finalFixExtractAllJobsJobId(job = {}) {
  const url = String(job.url || job.link || "");
  return url.match(/[?&]JobID=(\d+)/i)?.[1] || "";
}

function finalFixMergeKey(job = {}) {
  const allJobsJobId = finalFixExtractAllJobsJobId(job);
  if (allJobsJobId) return "alljobs:" + allJobsJobId;

  return getStableJobKey(job) || job.id || createJobId(job);
}


function finalFixHasRealLocation(job = {}) {
  const location = String(job.location || "").trim();
  const locationKey = String(job.locationKey || "").trim();

  return Boolean(
    location &&
      location !== "Israel" &&
      locationKey &&
      locationKey !== "unknown" &&
      locationKey !== "null"
  );
}

function finalFixHasBlockedLocation(job = {}) {
  const text = [
    job.title,
    job.company,
    job.location,
    String(job.locationKey || "").replaceAll("_", " "),
    job.description,
  ]
    .filter(Boolean)
    .join(" ");

  return FINAL_FIX_BAD_LOCATION_TEXT.test(text);
}

function finalFixIsConfidentialCompany(value = "") {
  return /חברה\s*חסויה|^חסויה$/i.test(String(value || "").trim());
}

function finalFixVariantQuality(job = {}) {
  let score = 0;

  if (finalFixHasRealLocation(job)) score += 100;
  if (finalFixHasBlockedLocation(job)) score += 60; // real bad location beats unknown, so it can be skipped.
  if (job.company && !finalFixIsConfidentialCompany(job.company)) score += 15;
  score += Math.min(40, Math.floor(String(job.description || "").length / 120));

  return score;
}

function finalFixMergeIncomingVariant(existing = {}, incoming = {}) {
  const first = finalFixVariantQuality(existing) >= finalFixVariantQuality(incoming)
    ? existing
    : incoming;
  const second = first === existing ? incoming : existing;

  const merged = {
    ...second,
    ...first,
    id: existing.id || incoming.id || createJobId(first),
    foundAt: existing.foundAt || incoming.foundAt || new Date().toISOString(),
  };

  if (finalFixHasRealLocation(first)) {
    merged.location = first.location;
    merged.locationKey = first.locationKey;
  } else if (finalFixHasRealLocation(second)) {
    merged.location = second.location;
    merged.locationKey = second.locationKey;
  }

  if (
    second.company &&
    !finalFixIsConfidentialCompany(second.company) &&
    (!merged.company || finalFixIsConfidentialCompany(merged.company))
  ) {
    merged.company = second.company;
  }

  if (String(second.description || "").length > String(merged.description || "").length) {
    merged.description = second.description;
  }

  return merged;
}

function finalFixMergeIncomingJobsByKey(jobs = []) {
  const byKey = new Map();

  for (const job of jobs) {
    const key = finalFixMergeKey(job);
    if (!key) continue;

    const existing = byKey.get(key);
    byKey.set(key, existing ? finalFixMergeIncomingVariant(existing, job) : job);
  }

  return [...byKey.values()];
}

function finalFixHasQaTitleSignal(job = {}) {
  const title = String(job.title || "").toLowerCase();

  return (
    /(?:^|[^a-z])qa(?:$|[^a-z])/i.test(title) ||
    /tester|testing|automation/i.test(title) ||
    /בודק\s*[\/.]?\s*(?:\/ת|ת)?\s*תוכנה/i.test(title) ||
    /בודק\/ת\s*תוכנה/i.test(title) ||
    /בודק\.ת\s*תוכנה/i.test(title) ||
    /בודקי\s*תוכנה|בודקות\s*תוכנה|בדיקות\s*תוכנה|איש\s*\/אשת\s*qa|איש\s*qa|אשת\s*qa/i.test(title)
  );
}

function finalFixInferQaRoleType(job = {}) {
  const text = [job.title, job.description].filter(Boolean).join(" ").toLowerCase();

  if (/אוטומציה|automation|selenium|playwright|cypress/i.test(text)) {
    return "qa_automation";
  }

  if (/ידני|ידניות|manual/i.test(text)) {
    return "qa_manual";
  }

  return "qa_general";
}

function finalFixNormalizeJobBeforeScoring(job = {}) {
  const next = { ...job };

  if (finalFixHasQaTitleSignal(next)) {
    next.roleFamily = "qa";
    next.roleType = finalFixInferQaRoleType(next);
    next.isRelevantRole = true;
    next.roleConfidence = "high";

    if (
      next.roleProfileId &&
      !String(next.roleProfileId).toLowerCase().includes("qa")
    ) {
      delete next.roleProfileId;
      delete next.roleProfileName;
      delete next.roleProfileMatched;
      delete next.roleProfileScoreBonus;
    }
  }

  return next;
}

function finalFixHasTooMuchExperience(job = {}) {
  const text = [job.title, job.description, ...(job.warnings || [])]
    .filter(Boolean)
    .join(" ");

  return /(?:3|4|5|6|7|8|9|10)\+?\s*(?:שנים|שנות|שנה|years?|yrs?)|(?:ניסיון|נסיון|experience).{0,50}(?:3|4|5|6|7|8|9|10)\+?|יותר\s*מדי\s*ניסיון|יותר\s*מדי\s*נסיון/i.test(text);
}

function finalFixNormalizeScoredJobAfterFlow(job = {}) {
  const next = { ...job };
  const warnings = Array.isArray(next.warnings) ? next.warnings : [];

  if (finalFixHasBlockedLocation(next)) {
    next.recommendation = "skip";
    return next;
  }

  const isQa = next.roleFamily === "qa" || next.roleFamily === "automation" || finalFixHasQaTitleSignal(next);
  const isGoodLocation = FINAL_FIX_GOOD_LOCATION_KEYS.has(next.locationKey) || next.locationKey === "remote";
  const hasBadExperience = finalFixHasTooMuchExperience(next) || hasBadSeniorityForMainList(next);

  if (
    next.recommendation === "review" &&
    isQa &&
    isGoodLocation &&
    Number(next.fitScore || 0) >= 75 &&
    warnings.length === 0 &&
    !hasBadExperience
  ) {
    next.recommendation = "apply";
  }

  if (
    next.recommendation === "apply" &&
    (!isGoodLocation || hasBadExperience)
  ) {
    next.recommendation = "review";
  }

  return next;
}

function finalFixNormalizeMainFlowSafe(job = {}) {
  return typeof normalizeScoredJobForMainFlow === "function"
    ? normalizeScoredJobForMainFlow(job)
    : job;
}

function finalFixPrepareAndScoreJob(job, profile, keywords, feedback) {
  const preparedJob = finalFixNormalizeJobBeforeScoring(job);

  return finalFixNormalizeScoredJobAfterFlow(
    finalFixNormalizeMainFlowSafe({
      ...preparedJob,
      ...scoreJob(preparedJob, profile, keywords, feedback),
    }),
  );
}
// END FINAL_JOB_SCAN_FIX_HELPERS`;

  source = upsertMarkedBlock(
    source,
    helperStart,
    helperEnd,
    helperBlock,
    "function finalizeNormalizedJob(job) {",
  );



  const getMergeKeyReplacement = `function getMergeKey(job = {}) {
  return finalFixMergeKey(job);
}`;

  if (/function getMergeKey\(job = \{\}\) \{[\s\S]*?\n\}/u.test(source)) {
    source = source.replace(
      /function getMergeKey\(job = \{\}\) \{[\s\S]*?\n\}/u,
      getMergeKeyReplacement,
    );
  } else {
    source = source.replace(
      "function finalizeNormalizedJob(job) {",
      `${getMergeKeyReplacement}\n\nfunction finalizeNormalizedJob(job) {`,
    );
  }

    // Remove older duplicate definitions that were inserted by earlier one-off patch scripts.
  source = source.replace(/\nconst QA_SAFE_APPLY_LOCATION_KEYS = new Set\([\s\S]*?function prepareAndScoreJob\(job, profile, keywords, feedback\) \{[\s\S]*?\n\}\n(?=function finalizeNormalizedJob)/u, "\n");

  source = replaceOrThrow(
    source,
    /const \[profile, keywords, existingJobs, feedback, siteSources\] = await Promise\.all\(\[[\s\S]*?\n  \]\);/u,
    (match) => `${match}\n\n  const existingKeysAtRunStart = new Set(\n    existingJobs.map(getMergeKey).filter(Boolean),\n  );`,
    "existingKeysAtRunStart insertion",
  );

  // Avoid duplicate insertion if script is run twice.
  source = source.replace(/(const existingKeysAtRunStart = new Set\([\s\S]*?\);\n\n)\s*const existingKeysAtRunStart = new Set\([\s\S]*?\);\n\n/u, "$1");

  const partialReplacement = `const scoredPartialJobs = normalizedJobs.map((job) =>
          finalFixPrepareAndScoreJob(job, profile, keywords, feedback),
        );`;

  const partialPatterns = [
    /const scoredPartialJobs = normalizedJobs\.map\(\(job\) => \(\{[\s\S]*?\n\s*\}\)\);/u,
    /const scoredPartialJobs = normalizedJobs\.map\(\(job\) =>[\s\S]*?\n\s*\);/u,
  ];

  let partialMatched = false;
  for (const pattern of partialPatterns) {
    if (pattern.test(source)) {
      source = source.replace(pattern, partialReplacement);
      partialMatched = true;
      break;
    }
  }

  if (!partialMatched) {
    throw new Error("Could not find block: scoredPartialJobs block");
  }

  const incomingReplacement = `const dedupedIncomingJobs = finalFixMergeIncomingJobsByKey(incomingJobs);

  const scoredIncoming = dedupedIncomingJobs.map((job) =>
    finalFixPrepareAndScoreJob(job, profile, keywords, feedback),
  );`;

  const incomingPatterns = [
    /const scoredIncoming = incomingJobs\.map\(\(job\) => \(\{[\s\S]*?\n\s*\}\)\);/u,
    /const scoredIncoming = incomingJobs\.map\(\(job\) =>[\s\S]*?\n\s*\);/u,
  ];

  let incomingMatched = false;
  for (const pattern of incomingPatterns) {
    if (pattern.test(source)) {
      source = source.replace(pattern, incomingReplacement);
      incomingMatched = true;
      break;
    }
  }

  if (!incomingMatched) {
    throw new Error("Could not find block: scoredIncoming block");
  }

  source = source.replace(
    /await writeScanAuditFile\(\{\s*incomingJobs,\s*scoredIncoming,/u,
    `await writeScanAuditFile({\n    incomingJobs: dedupedIncomingJobs,\n    scoredIncoming,`,
  );

  source = source.replace(
    /const existingKeys = new Set\(latestExistingJobs\.map\(getMergeKey\)\.filter\(Boolean\)\);[\s\S]*?const merged = mergeJobsUpdatingExisting\(latestExistingJobs, \[[\s\S]*?\]\);/u,
    `const latestExistingKeys = new Set(latestExistingJobs.map(getMergeKey).filter(Boolean));\n\n  const dedupedScoredIncoming = dedupeJobsByFingerprint(scoredIncoming);\n\n  const updatedJobs = dedupedScoredIncoming.filter((job) =>\n    existingKeysAtRunStart.has(getMergeKey(job)),\n  );\n\n  const newJobs = jobsForThisRun.filter(\n    (job) => !existingKeysAtRunStart.has(getMergeKey(job)),\n  );\n\n  const merged = mergeJobsUpdatingExisting(latestExistingJobs, [\n    ...updatedJobs,\n    ...newJobs,\n  ]);`,
  );

  // Fallback for older unpatched final merge block.
  source = source.replace(
    /const existingById = new Map\(latestExistingJobs\.map\(\(job\) => \[job\.id, job\]\)\);[\s\S]*?const merged = sortJobs\(uniqueById\(\[\.\.\.existingById\.values\(\)\]\)\);/u,
    `const latestExistingKeys = new Set(latestExistingJobs.map(getMergeKey).filter(Boolean));\n\n  const dedupedScoredIncoming = dedupeJobsByFingerprint(scoredIncoming);\n\n  const updatedJobs = dedupedScoredIncoming.filter((job) =>\n    existingKeysAtRunStart.has(getMergeKey(job)),\n  );\n\n  const newJobs = jobsForThisRun.filter(\n    (job) => !existingKeysAtRunStart.has(getMergeKey(job)),\n  );\n\n  const merged = mergeJobsUpdatingExisting(latestExistingJobs, [\n    ...updatedJobs,\n    ...newJobs,\n  ]);`,
  );

  source = source.replace(
    /console\.log\(`Scanned: \$\{jobsForThisRun\.length\} \/ \$\{incomingJobs\.length\}`\);/u,
    "console.log(`Scanned: ${jobsForThisRun.length} / ${dedupedIncomingJobs.length} unique / ${incomingJobs.length} raw`);",
  );

  source = source.replace(
    /scanned: incomingJobs\.length,/u,
    "scanned: dedupedIncomingJobs.length,",
  );

  if (!source.includes("Updated existing jobs:")) {
    source = source.replace(
      "console.log(`New jobs: ${newJobs.length}`);",
      "console.log(`New jobs: ${newJobs.length}`);\n  console.log(`Updated existing jobs: ${updatedJobs?.length || 0}`);",
    );
  }

  fs.writeFileSync(findJobsPath, source, "utf8");
}

function patchAllJobsCrawler() {
  backup(alljobsCrawlerPath, "final-alljobs-safety");
  let source = fs.readFileSync(alljobsCrawlerPath, "utf8");

  source = source.replace(
    "location: extractLocation(cardText),",
    "location: cleanLocationValue(extractLocation(cardText), cardText),",
  );

  // Do not guess location from the whole detail page body. It caused false Haifa/כרמיאל matches.
  source = source.replace(
    `    ]) ||\n    extractLocation(bodyText) ||\n    fallback.location ||\n    \"\";`,
    `    ]) ||\n    fallback.location ||\n    \"\";`,
  );

  fs.writeFileSync(alljobsCrawlerPath, source, "utf8");
}

function patchScoring() {
  backup(scoringPath, "final-scoring-safety");
  let source = fs.readFileSync(scoringPath, "utf8");

  source = source.replace(
    /function hasExperience\(text, minYears\) \{[\s\S]*?\n\}/u,
    `function hasExperience(text, minYears) {\n  const normalized = normalizeText(text);\n\n  const patterns = [\n    /(\\d+)\\+?\\s*(?:years?|yrs?|שנים|שנות|שנה)/gi,\n    /(?:ניסיון|נסיון|experience).{0,50}?(\\d+)\\+?/gi,\n    /(\\d+)\\+?.{0,25}?(?:ניסיון|נסיון|experience)/gi,\n  ];\n\n  for (const pattern of patterns) {\n    const matches = [...normalized.matchAll(pattern)];\n\n    if (matches.some((match) => Number(match[1]) >= minYears)) {\n      return true;\n    }\n  }\n\n  return false;\n}`,
  );

  source = source.replace(
    /function hasAdminOrNonSoftwareNoise\(text = ""\) \{[\s\S]*?\n\}/u,
    `function hasAdminOrNonSoftwareNoise(text = "") {\n  const value = String(text || "");\n\n  const exactAdminRole =\n    /(?:^|[^\\p{L}\\p{N}])פקיד(?:ה|ת)?(?:$|[^\\p{L}\\p{N}])/iu.test(value) ||\n    /(?:^|[^\\p{L}\\p{N}])בק\\s*אופיס(?:$|[^\\p{L}\\p{N}])/iu.test(value) ||\n    /\\bback\\s*office\\b/i.test(value);\n\n  const otherNoise =\n    /לוגיסטיקה|מעבדה|פארמה|אצוות|מחסן|אדמיניסטרציה/i.test(value);\n\n  return exactAdminRole || otherNoise;\n}`,
  );

  fs.writeFileSync(scoringPath, source, "utf8");
}

function runCheck(filePath) {
  execFileSync(process.execPath, ["--check", filePath], { stdio: "inherit" });
}

patchFindJobs();
patchAllJobsCrawler();
patchScoring();

runCheck(findJobsPath);
runCheck(alljobsCrawlerPath);
runCheck(scoringPath);

console.log("Final job scan fix applied successfully.");
