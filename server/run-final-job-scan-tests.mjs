import assert from "node:assert/strict";

const BAD_LOCATION_TEXT = /ירושלים|פתח\s*תקווה|רעננה|שדרות|דרום|מרכז|שרון|שפלה|jerusalem|petah\s*tikva|raanana|sderot|south|center|sharon|shefela/i;
const GOOD_LOCATION_KEYS = new Set(["haifa", "krayot", "yokneam", "north", "remote", "nesher", "tirat_carmel", "nahariya", "acre", "karmiel"]);

function extractJobId(job = {}) {
  return String(job.url || job.link || "").match(/[?&]JobID=(\d+)/i)?.[1] || "";
}

function key(job = {}) {
  const id = extractJobId(job);
  if (id) return `alljobs:${id}`;
  return [job.title, job.company, job.location].filter(Boolean).join("|").toLowerCase();
}

function hasRealLocation(job = {}) {
  return Boolean(job.location && job.location !== "Israel" && job.locationKey);
}

function hasBlockedLocation(job = {}) {
  return BAD_LOCATION_TEXT.test([job.title, job.location, job.description].filter(Boolean).join(" "));
}

function quality(job = {}) {
  let score = 0;
  if (hasRealLocation(job)) score += 100;
  if (hasBlockedLocation(job)) score += 60;
  if (job.company && !/חסויה/.test(job.company)) score += 15;
  score += Math.min(40, Math.floor(String(job.description || "").length / 120));
  return score;
}

function mergeVariant(a = {}, b = {}) {
  const first = quality(a) >= quality(b) ? a : b;
  const second = first === a ? b : a;
  const merged = { ...second, ...first };

  if (hasRealLocation(first)) {
    merged.location = first.location;
    merged.locationKey = first.locationKey;
  } else if (hasRealLocation(second)) {
    merged.location = second.location;
    merged.locationKey = second.locationKey;
  }

  if (String(second.description || "").length > String(merged.description || "").length) {
    merged.description = second.description;
  }

  return merged;
}

function mergeIncoming(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    const k = key(job);
    const old = map.get(k);
    map.set(k, old ? mergeVariant(old, job) : job);
  }
  return [...map.values()];
}

function rec(job = {}) {
  if (hasBlockedLocation(job)) return "skip";
  if (!job.locationKey) return "review";
  if (GOOD_LOCATION_KEYS.has(job.locationKey) && /qa|בודק|בדיקות/i.test(job.title) && !/3\s*שנות|4\s*שנות|senior|בכיר/i.test(job.title)) return "apply";
  return "review";
}

const fixtures = [
  { title: "QA Engineer", location: "Israel", locationKey: null, url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=1" },
  { title: "QA Engineer", location: "רעננה", locationKey: "raanana", url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=1" },
  { title: "בודק /ת תוכנה QA לחיפה", location: "חיפה", locationKey: "haifa", url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=2" },
  { title: "בודק /ת תוכנה QA לחיפה", location: "Israel", locationKey: null, url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=2" },
  { title: "Automation student - Jerusalem", location: "Israel", locationKey: null, url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=3" },
  { title: "איש /אשת QA ג'וניור", location: "חיפה", locationKey: "haifa", url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=4" },
  { title: "לחברה ביטחונית QA 3 שנות ניסיון", location: "חיפה", locationKey: "haifa", url: "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=5" },
];

const merged = mergeIncoming(fixtures);
assert.equal(merged.length, 5, "duplicates by JobID should be merged");

const job1 = merged.find((job) => extractJobId(job) === "1");
assert.equal(job1.locationKey, "raanana", "real bad location should beat unknown location");
assert.equal(rec(job1), "skip", "bad-location duplicate must not survive as unknown review");

const job2 = merged.find((job) => extractJobId(job) === "2");
assert.equal(job2.locationKey, "haifa", "good real location should beat unknown");
assert.equal(rec(job2), "apply", "clean Haifa QA should apply");

const job3 = merged.find((job) => extractJobId(job) === "3");
assert.equal(rec(job3), "skip", "Jerusalem in title should skip even if location is unknown");

const job4 = merged.find((job) => extractJobId(job) === "4");
assert.equal(rec(job4), "apply", "junior QA in Haifa should apply");

const job5 = merged.find((job) => extractJobId(job) === "5");
assert.equal(rec(job5), "review", "3 years QA should review, not apply");

const initialExistingKeys = new Set(["alljobs:2"]);
const newJobs = merged.filter((job) => !initialExistingKeys.has(key(job)) && rec(job) !== "skip");
assert.equal(newJobs.length, 2, "new-job count should use run-start keys, not partial-save keys");

console.log("All synthetic final job scan tests passed.");
