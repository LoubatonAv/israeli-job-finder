export function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function createJobId(job) {
  const raw = [job.title, job.company, job.location, job.url]
    .filter(Boolean)
    .join("|");
  return normalizeText(raw)
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9א-ת]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function dedupeTextKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[״"]/g, "")
    .replace(/^(\d+)\s*[-–]\s*/g, "")
    .trim();
}

function getDedupeJobKey(job = {}) {
  const url = String(job.url || job.link || "");

  // AllJobs: חייב לפי JobID, כי הרבה משרות הן "חברה חסויה" עם טייטלים דומים.
  const allJobsJobId = url.match(/[?&]JobID=(\d+)/i)?.[1];
  if (allJobsJobId) return `alljobs:${allJobsJobId}`;

  // JobMaster: לפי key.
  const jobMasterKey = url.match(/jobmaster\.co\.il.*key=(\d+)/i)?.[1];
  if (jobMasterKey) return `jobmaster:${jobMasterKey}`;

  // Drushim: לפעמים אותה משרה מופיעה עם URL אחר, אז מאחדים לפי תוכן.
  const title = dedupeTextKey(job.title);
  const company = dedupeTextKey(job.company);
  const location = dedupeTextKey(job.locationKey || job.location);
  const source = dedupeTextKey(job.source);

  return `${source}:${title}|${company}|${location}`;
}

function getJobQualityRank(job = {}) {
  const recommendationWeight =
    job.recommendation === "apply"
      ? 300
      : job.recommendation === "review"
        ? 200
        : 0;

  const locationWeight = job.locationKey ? 25 : 0;
  const score = Number(job.fitScore || 0);

  return recommendationWeight + locationWeight + score;
}

export function uniqueById(items = []) {
  const map = new Map();

  for (const item of items) {
    const key = getDedupeJobKey(item);
    if (!key) continue;

    const existing = map.get(key);

    if (!existing || getJobQualityRank(item) > getJobQualityRank(existing)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

export function getBestApplyLink(jobResult) {
  const relatedLinks = jobResult.related_links || [];
  const extensions = jobResult.detected_extensions || {};
  const applyOptions = jobResult.apply_options || [];

  if (applyOptions[0]?.link) return applyOptions[0].link;
  if (jobResult.share_link) return jobResult.share_link;
  if (relatedLinks[0]?.link) return relatedLinks[0].link;
  if (extensions?.link) return extensions.link;
  return "";
}
