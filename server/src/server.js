import "dotenv/config";
import express from "express";
import cors from "cors";
import { load as loadHtml } from "cheerio";
import {
  FEEDBACK_FILE,
  JOBS_FILE,
  KEYWORDS_FILE,
  PROFILE_FILE,
  ROLE_PROFILES_FILE,
  SCAN_AUDIT_FILE,
  SITE_SOURCES_FILE,
  GMAIL_AGENT_STATE_FILE,
  TRUSTED_JOB_SENDERS_FILE,
} from "./paths.js";
import { readJson, writeJson } from "./fileStore.js";
import { findJobs, getScanProgress, requestScanStop } from "./findJobs.js";
import { createFeedbackEntry } from "./learning.js";
import { createJobId, uniqueById } from "./utils.js";
import { enrichJob } from "./enrichJob.js";
import { scoreJob } from "./scoring.js";
import { applyDecisionGates } from "./decisionGates.js";
import {
  getGmailAuthUrl,
  getGmailConnectionStatus,
  saveGmailTokensFromCode,
} from "./gmailAuth.js";
import {
  DEFAULT_TRUSTED_JOB_SENDERS,
  getAllTrustedJobSenders,
  getImportedGmailJobs,
  importGmailJobEmails,
} from "./gmailImport.js";

const app = express();
const port = Number(process.env.PORT || 4000);

const ALLOWED_STATUSES = new Set([
  "found",
  "saved",
  "applied",
  "interview",
  "archived",
  "rejected",
  "skipped",
]);
const FEEDBACK_STATUSES = new Set([
  "saved",
  "applied",
  "interview",
  "rejected",
  "skipped",
]);
const MAIN_LOCATION_KEYS = new Set([
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

function buildScanSummary(
  audit = {},
  savedJobs = [],
  feedback = [],
  siteSources = [],
) {
  const jobs = Array.isArray(audit.jobs) ? audit.jobs : [];
  const bySource = jobs.reduce((acc, job) => {
    const source = job.source || "מקור לא ידוע";
    if (!acc[source]) {
      acc[source] = {
        source,
        total: 0,
        kept: 0,
        filtered: 0,
        apply: 0,
        review: 0,
      };
    }

    acc[source].total += 1;
    if (job.kept) acc[source].kept += 1;
    else acc[source].filtered += 1;
    if (job.recommendation === "apply") acc[source].apply += 1;
    if (job.recommendation === "review") acc[source].review += 1;

    return acc;
  }, {});

  return {
    createdAt: audit.createdAt || null,
    totals: audit.totals || {
      incoming: 0,
      scored: 0,
      kept: savedJobs.length,
      filtered: 0,
    },
    savedJobs: savedJobs.length,
    feedbackEvents: feedback.length,
    activeSiteSources: siteSources.filter(
      (source) => source && source.enabled !== false,
    ).length,
    bySource: Object.values(bySource).sort(
      (a, b) => b.kept - a.kept || b.total - a.total,
    ),
  };
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function slugifyRoleId(value = "") {
  const fallback = `role_${Date.now()}`;

  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, "_")
    .replace(/[^a-z0-9_א-ת-]/gi, "")
    .replace(/^_+|_+$/g, "");

  return slug || fallback;
}

function splitList(value = "") {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeUnique(existing = [], added = []) {
  return [...new Set([...existing, ...added].filter(Boolean))];
}

function normalizeRoleProfile(input = {}, existing = {}) {
  const id = slugifyRoleId(
    input.id || existing.id || input.name || existing.name,
  );
  const name = String(input.name ?? existing.name ?? id).trim();

  if (!name) {
    throw new Error("צריך להזין שם תפקיד");
  }

  const queries = splitList(input.queries ?? existing.queries ?? []);
  const positivePatterns = splitList(
    input.positivePatterns ?? existing.positivePatterns ?? [],
  );
  const negativePatterns = splitList(
    input.negativePatterns ?? existing.negativePatterns ?? [],
  );

  if (!queries.length) {
    queries.push(`${name} חיפה`, `${name} צפון`);
  }

  if (!positivePatterns.length) {
    positivePatterns.push(name);
  }

  return {
    id,
    name,
    enabled: input.enabled ?? existing.enabled ?? true,
    roleFamily:
      String(input.roleFamily ?? existing.roleFamily ?? "custom").trim() ||
      "custom",
    roleType: String(input.roleType ?? existing.roleType ?? id).trim() || id,
    mainListMinScore: Number.isFinite(
      Number(input.mainListMinScore ?? existing.mainListMinScore),
    )
      ? Number(input.mainListMinScore ?? existing.mainListMinScore)
      : 58,
    scoreBonus: Number.isFinite(Number(input.scoreBonus ?? existing.scoreBonus))
      ? Number(input.scoreBonus ?? existing.scoreBonus)
      : 28,
    queries,
    positivePatterns,
    negativePatterns,
  };
}

async function saveRoleProfile(input = {}) {
  const roleProfiles = await readJson(ROLE_PROFILES_FILE, []);
  const existing =
    roleProfiles.find((profile) => profile.id === input.id) || {};
  const profile = normalizeRoleProfile(input, existing);
  const nextProfiles = [
    ...roleProfiles.filter((item) => item.id !== profile.id),
    profile,
  ].sort((a, b) =>
    String(a.name || a.id).localeCompare(String(b.name || b.id), "he"),
  );

  await writeJson(ROLE_PROFILES_FILE, nextProfiles);

  const keywords = await readJson(KEYWORDS_FILE, { queries: [], exclude: [] });
  keywords.queries = mergeUnique(keywords.queries || [], profile.queries);
  if (!Array.isArray(keywords.exclude)) keywords.exclude = [];
  await writeJson(KEYWORDS_FILE, keywords);

  return profile;
}

async function appendFeedback(job, action, metadata = {}) {
  const feedback = await readJson(FEEDBACK_FILE, []);
  feedback.push(createFeedbackEntry(job, action, metadata));
  await writeJson(FEEDBACK_FILE, feedback.slice(-1500));
}

function getReviewKey(job = {}) {
  const url = String(job.url || "");
  const allJobsId = url.match(/[?&]JobID=(\d+)/i)?.[1];
  if (allJobsId) return `alljobs:${allJobsId}`;

  const jobMasterKey = url.match(/jobmaster\.co\.il.*key=(\d+)/i)?.[1];
  if (jobMasterKey) return `jobmaster:${jobMasterKey}`;

  return [job.title, job.company, job.locationKey || job.location]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

function getReviewId(job = {}) {
  return Buffer.from(getReviewKey(job), "utf8").toString("base64url");
}

function getFeedbackReviewKey(item = {}) {
  return item.reviewKey || getReviewKey(item);
}

function buildReviewJobs(audit = {}, savedJobs = [], feedback = []) {
  const savedKeys = new Set(savedJobs.map(getReviewKey));
  const handledReviewKeys = new Set(
    feedback
      .filter((item) =>
        [
          "saved",
          "applied",
          "interview",
          "deleted",
          "rejected",
          "skipped",
          "not_relevant",
        ].includes(item?.action),
      )
      .map(getFeedbackReviewKey)
      .filter(Boolean),
  );
  const reviewMap = new Map();

  for (const job of audit.jobs || []) {
    const key = getReviewKey(job);
    if (!key || savedKeys.has(key) || handledReviewKeys.has(key) || job.kept)
      continue;
    if (!MAIN_LOCATION_KEYS.has(job.locationKey)) continue;

    const looksInteresting =
      job.decision === "filtered_other" ||
      job.recommendation === "apply" ||
      job.recommendation === "review" ||
      Number(job.fitScore || 0) >= 50;

    if (!looksInteresting) continue;

    const existing = reviewMap.get(key);
    if (
      !existing ||
      Number(job.fitScore || 0) > Number(existing.fitScore || 0)
    ) {
      reviewMap.set(key, {
        ...job,
        id: getReviewId(job),
        reviewKey: key,
        status: "found",
        fromManualReview: true,
      });
    }
  }

  return [...reviewMap.values()].sort(
    (a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0),
  );
}

function findReviewJobById(
  audit = {},
  savedJobs = [],
  feedback = [],
  reviewId = "",
) {
  return buildReviewJobs(audit, savedJobs, feedback).find(
    (job) => job.id === reviewId,
  );
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "israel-job-finder" });
});

function getHostFromUrl(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

async function readGmailAgentState() {
  return readJson(GMAIL_AGENT_STATE_FILE, {
    lastImportAt: null,
    processedMessageIds: [],
    processedJobIds: [],
    lastResult: null,
  });
}

async function writeGmailAgentState(nextState = {}) {
  const normalized = {
    lastImportAt: nextState.lastImportAt || new Date().toISOString(),
    processedMessageIds: [
      ...new Set(nextState.processedMessageIds || []),
    ].slice(-2500),
    processedJobIds: [...new Set(nextState.processedJobIds || [])].slice(-5000),
    lastResult: nextState.lastResult || null,
  };

  await writeJson(GMAIL_AGENT_STATE_FILE, normalized);
  return normalized;
}

function isFakeGmailSplitJob(job = {}) {
  const source = String(job.source || "");
  const title = String(job.title || "");
  return (
    /Gmail/i.test(source) &&
    /·\s*(AllJobs|Drushim|Indeed|LinkedIn)\s*#/i.test(title)
  );
}

function getGmailSourceName(job = {}) {
  const source = String(job.source || "Gmail");
  if (source.includes("·")) return source.split("·").pop().trim();
  return source.replace(/^Gmail\s*/i, "").trim() || "Gmail";
}

function countBy(list = [], getKey = () => "unknown") {
  return list.reduce((acc, item) => {
    const key = getKey(item) || "לא ידוע";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function summarizeFeedbackLearning(feedback = []) {
  const recent = feedback.slice(-250);
  const positiveActions = new Set(["applied", "saved", "interview"]);
  const negativeActions = new Set([
    "deleted",
    "rejected",
    "skipped",
    "not_relevant",
  ]);

  const positive = recent.filter((item) => positiveActions.has(item.action));
  const negative = recent.filter((item) => negativeActions.has(item.action));

  return {
    totalEvents: feedback.length,
    recentEvents: recent.length,
    positiveEvents: positive.length,
    negativeEvents: negative.length,
    rejectionReasons: countBy(
      negative,
      (item) =>
        item.rejectionReason ||
        item.reason ||
        item.metadata?.rejectionReason ||
        "לא צוין",
    ),
    positiveSources: countBy(positive, (item) =>
      getGmailSourceName(item.job || item),
    ),
  };
}

function normalizeTrustedSender(input = {}, existing = {}) {
  const rawName = String(input.name ?? existing.name ?? "").trim();
  const rawId = String(input.id ?? existing.id ?? rawName).trim();
  const id =
    rawId
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || `sender_${Date.now()}`;

  const domains = (
    Array.isArray(input.domains)
      ? input.domains
      : String(input.domains ?? existing.domains ?? "").split(",")
  )
    .map((domain) => String(domain).trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  if (!domains.length) {
    throw new Error("צריך להזין לפחות דומיין אחד לשולח משרות.");
  }

  return {
    id,
    name: rawName || existing.name || id,
    domains: [...new Set(domains)],
    enabled: input.enabled ?? existing.enabled ?? true,
    notes: String(input.notes ?? existing.notes ?? "").trim(),
  };
}

async function readTrustedSenderList() {
  const saved = await readJson(TRUSTED_JOB_SENDERS_FILE, null);
  return Array.isArray(saved) ? saved : DEFAULT_TRUSTED_JOB_SENDERS;
}

async function writeTrustedSenderList(list = []) {
  await writeJson(TRUSTED_JOB_SENDERS_FILE, list);
  return list;
}

async function buildGmailAgentSummary() {
  const [gmailStatus, gmailImports, jobs, feedback, state, trustedSenders] =
    await Promise.all([
      getGmailConnectionStatus(),
      getImportedGmailJobs().catch(() => []),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
      readGmailAgentState(),
      readTrustedSenderList(),
    ]);

  const gmailJobs = Array.isArray(jobs)
    ? jobs.filter((job) => /Gmail/i.test(String(job.source || "")))
    : [];
  const activeGmailJobs = gmailJobs.filter(
    (job) =>
      ![
        "applied",
        "saved",
        "interview",
        "archived",
        "rejected",
        "skipped",
      ].includes(String(job.status || "found")),
  );
  const digestJobs = gmailJobs.filter((job) => job.gmailDigest === true);
  const learning = summarizeFeedbackLearning(
    Array.isArray(feedback) ? feedback : [],
  );

  return {
    connected: !!gmailStatus.connected,
    savedAt: gmailStatus.savedAt || null,
    refreshedAt: gmailStatus.refreshedAt || null,
    rawImportedEmails: Array.isArray(gmailImports) ? gmailImports.length : 0,
    gmailJobsTotal: gmailJobs.length,
    activeGmailJobs: activeGmailJobs.length,
    reviewGmailJobs: gmailJobs.filter((job) => job.recommendation === "review")
      .length,
    appliedGmailJobs: gmailJobs.filter((job) =>
      ["applied", "interview"].includes(String(job.status || "")),
    ).length,
    savedGmailJobs: gmailJobs.filter((job) => job.status === "saved").length,
    digestJobs: digestJobs.length,
    fakeSplitJobs: gmailJobs.filter(isFakeGmailSplitJob).length,
    trustedSenders,
    activeTrustedSenders: trustedSenders.filter(
      (sender) => sender.enabled !== false,
    ).length,
    lastImportAt: state.lastImportAt || null,
    processedMessages: (state.processedMessageIds || []).length,
    learning,
    suggestions: [
      {
        name: "JobKarov",
        domains: ["jobkarov.com"],
        note: "אפשר לבדוק אם יש התראות מייל לפי חיפוש שמור.",
      },
      {
        name: "Careerjet Israel",
        domains: ["careerjet.co.il"],
        note: "מנוע משרות. מתאים אם ניתן להגדיר התראות מדויקות.",
      },
      {
        name: "Glassdoor",
        domains: ["glassdoor.com"],
        note: "רק אם ההתראות מדויקות, אחרת להשאיר כבוי.",
      },
      {
        name: "GotFriends",
        domains: ["gotfriends.co.il"],
        note: "השמה בהייטק. טוב במיוחד אם תגדיר Junior/QA/Front End מדויק.",
      },
      {
        name: "Nisha",
        domains: ["nisha.co.il"],
        note: "השמה, בעיקר הייטק/ביוטק. להפעיל רק אם מגיעים מיילים רלוונטיים.",
      },
      {
        name: "SQLink",
        domains: ["sqlink.com", "sqlink.co.il"],
        note: "משרות הייטק. כדאי לסנן לפי אזור וניסיון.",
      },
      {
        name: "Ethosia",
        domains: ["ethosia.co.il"],
        note: "השמה. מתאים אם יש לך התראה/סוכן מייל.",
      },
      {
        name: "Dialog",
        domains: ["dialog.co.il"],
        note: "השמה. מתאים למשרות טכנולוגיות אם הסוכן מדויק.",
      },
    ],
  };
}

function sourceFromGmailLink(url = "", sender = "") {
  const host = getHostFromUrl(url);
  const text = `${host} ${sender}`.toLowerCase();

  if (text.includes("alljob")) return "Gmail · AllJobs";
  if (text.includes("drushim")) return "Gmail · Drushim";
  if (text.includes("jobmaster")) return "Gmail · JobMaster";
  if (text.includes("jobnet")) return "Gmail · Jobnet";
  if (text.includes("indeed")) return "Gmail · Indeed";
  if (text.includes("linkedin")) return "Gmail · LinkedIn";
  return "Gmail";
}

function cleanSenderName(value = "") {
  return (
    String(value || "")
      .replace(/<[^>]+>/g, "")
      .replace(/["']/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Gmail"
  );
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getAllJobsIdFromUrl(url = "") {
  return String(url || "").match(/[?&]JobID=(\d+)/i)?.[1] || "";
}

function getDrushimIdFromUrl(url = "") {
  return String(url || "").match(/drushim\.co\.il\/job\/(\d+)/i)?.[1] || "";
}

function getIndeedKeyFromUrl(url = "") {
  return String(url || "").match(/[?&]jk=([a-z0-9]+)/i)?.[1] || "";
}

function getLinkedInIdFromUrl(url = "") {
  return (
    String(url || "").match(/linkedin\.com\/.+?jobs\/view\/(\d+)/i)?.[1] || ""
  );
}

function isLikelyDirectJobLink(url = "") {
  const value = String(url || "");
  const host = getHostFromUrl(value);

  if (!host) return false;
  if (
    /unsubscribe|removeemail|contactus|helpcenter|privacy|legal|notifications|messages|premium|settings/i.test(
      value,
    )
  )
    return false;
  if (getAllJobsIdFromUrl(value)) return true;
  if (getDrushimIdFromUrl(value)) return true;
  if (getIndeedKeyFromUrl(value)) return true;
  if (getLinkedInIdFromUrl(value)) return true;
  if (
    /jobmaster|jobnet/i.test(host) &&
    /job|jobs|position|details/i.test(value)
  )
    return true;

  return false;
}

function extractGmailJobLinks(mail = {}) {
  const links = Array.isArray(mail.links) ? mail.links : [];
  const directLinks = links.filter(isLikelyDirectJobLink);
  const source = directLinks.length
    ? directLinks
    : links.filter((link) => /^https?:\/\//i.test(link)).slice(0, 1);

  const byKey = new Map();

  for (const url of source) {
    const key = getAllJobsIdFromUrl(url)
      ? `alljobs:${getAllJobsIdFromUrl(url)}`
      : getDrushimIdFromUrl(url)
        ? `drushim:${getDrushimIdFromUrl(url)}`
        : getIndeedKeyFromUrl(url)
          ? `indeed:${getIndeedKeyFromUrl(url)}`
          : getLinkedInIdFromUrl(url)
            ? `linkedin:${getLinkedInIdFromUrl(url)}`
            : String(url).split(/[?#]/)[0].toLowerCase();

    if (!byKey.has(key)) byKey.set(key, url);
  }

  return [...byKey.values()].slice(0, 50);
}

function guessGmailLocation(mail = {}) {
  const text = `${mail.title || ""} ${mail.snippet || ""} ${(mail.links || []).join(" ")}`;

  if (/יקנעם|יוקנעם/i.test(text)) return "יקנעם";
  if (/קריות|קריית\s*אתא|קרית\s*אתא|קריית|קרית/i.test(text)) return "קריות";
  if (/חיפה/i.test(text)) return "חיפה";
  if (/נשר/i.test(text)) return "נשר";
  if (/טירת\s*כרמל/i.test(text)) return "טירת כרמל";
  if (/נהריה/i.test(text)) return "נהריה";
  if (/עכו/i.test(text)) return "עכו";
  if (/כרמיאל/i.test(text)) return "כרמיאל";
  if (/remote|מרחוק/i.test(text)) return "Remote";
  if (/צפון|גליל|גולן/i.test(text)) return "צפון";
  return "";
}

function normalizeGmailJobUrl(url = "") {
  const allJobsId = getAllJobsIdFromUrl(url);

  if (allJobsId) {
    return `https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=${allJobsId}`;
  }

  return url || "";
}

function getGmailMailText(mail = {}) {
  return [mail.title, mail.snippet, mail.sender, ...(mail.links || [])]
    .filter(Boolean)
    .join(" ");
}

function isDrushimAppliedSummaryMail(mail = {}) {
  const text = [
    mail.title,
    mail.snippet,
    mail.bodyText,
    mail.sender,
  ]
    .filter(Boolean)
    .join(" ");

  return /ריכזנו לך את כל המשרות שהגשת אליהן קורות חיים היום|קורות החיים נשלחו בהצלחה למשרה זו|קורות החיים שלך נשלחו בהצלחה ל\s*\d+\s*משרות|קורות החיים שלך נשלחו בהצלחה/i.test(
    text,
  );
}
function isNonJobGmailMail(mail = {}) {
  if (isDrushimAppliedSummaryMail(mail)) {
    return true;
  }

  const text = getGmailMailText(mail);

  return /password\s*reset|security\s*alert|verification\s*code|two[-\s]*factor|2fa|otp|login\s*code|temporary\s*password|temporary\s*login|auth\s*code|קוד\s*ה?אימות|קוד\s*כניסה|קוד\s*זמני|הקוד\s*הזמני|אימות\s*כניסה|סיסמה\s*זמנית|סיסמא\s*זמנית|הסיסמה\s*הזמנית|הסיסמא\s*הזמנית|חשבונית|receipt|invoice|billing|payment|תשלום/i.test(
    text,
  );
}

function isGmailDigestMail(mail = {}, links = []) {
  if (isDrushimAppliedSummaryMail(mail)) {
    return true;
  }

  const text = getGmailMailText(mail);

  if (links.length > 1) return true;

  return /כל המשרות שעלו|משרות עדכניות לפי תחומי החיפוש|עלו\s+\d+\s+משרות|\d+\s+משרות חדשות|and\s+\d+\s+more\s+.+?jobs|\d+\s+more\s+.+?jobs/i.test(
    text,
  );
}

function extractSingleGmailJobTitle(mail = {}) {
  const title = String(mail.title || "").trim();
  const snippet = String(mail.snippet || "").trim();

  const titleMatch = title.match(
    /חשבנו עליך כשראינו את המשרה הזו:\s*(.+?)\s*(?:לפרטים|>>|$)/i,
  );
  if (titleMatch?.[1]) return cleanText(titleMatch[1]);

  const hotJobMatch = snippet.match(/משרה חמה!\s*(.+?)\s+חברה:/i);
  if (hotJobMatch?.[1]) return cleanText(hotJobMatch[1]);

  const jobBeforeCompanyMatch = snippet.match(
    /(?:להלן משרה.+?|משרה שפורסמה.+?)(דרוש(?:ים|ה|\/ה)?\s*.+?)\s+(?:חברה:|מקום העבודה:|סוג משרה:)/i,
  );
  if (jobBeforeCompanyMatch?.[1]) return cleanText(jobBeforeCompanyMatch[1]);

  const isGenericSubject =
    /כל המשרות שעלו|עלו\s+\d+\s+משרות|עלתה משרה חדשה|עלו.+משרות חדשות|משרה חדשה שיכולה להתאים|קורות החיים שלך נשלחו/i.test(
      title,
    );

  return isGenericSubject
    ? "משרה מ-Gmail לבדיקה"
    : title || "משרה מ-Gmail לבדיקה";
}

function buildGmailDigestTitle(mail = {}) {
  const title = String(mail.title || "").trim();
  return title ? `תקציר משרות לבדיקה: ${title}` : "תקציר משרות מ-Gmail לבדיקה";
}

function isAllJobsMail(mail = {}) {
  const text = [
    mail.sender,
    mail.title,
    mail.snippet,
    mail.bodyText,
    ...(mail.links || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("alljob.co.il") ||
    text.includes("alljobs.co.il") ||
    text.includes("alljobs")
  );
}

function normalizeDigestText(value = "") {
  return cleanText(value)
    .replace(/&rlm;|&lrm;/g, " ")
    .replace(/[\u200e\u200f]/g, " ")
    .replace(/\s+לצפייה\s+במשרה\s+/g, " לצפייה במשרה ")
    .replace(/\s+חברה:/g, " חברה:")
    .replace(/\s+מקום העבודה:/g, " מקום העבודה:")
    .replace(/\s+סוג משרה:/g, " סוג משרה:")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function textFromHtmlNode($, node) {
  const clone = $(node).clone();

  clone.find("br").replaceWith("\n");
  clone.find("p,div,tr,table,li").append("\n");

  return normalizeDigestText(clone.text());
}

function removeAllJobsMailIntro(value = "") {
  return cleanText(value)
    .replace(/^אבנר שלום,?\s*/i, "")
    .replace(/^להלן משרות שפורסמו באתר ומתאימות להגדרות החיפוש שלך\s*/i, "")
    .replace(/^להלן משרה שפורסמה באתר ומתאימה להגדרות החיפוש שלך\s*/i, "")
    .replace(
      /^משרות עדכניות לפי תחומי החיפוש שלך.*?(?=דרוש|לחברה|QA|בודק|מפתח|Help\s*desk|V\s*V|$)/i,
      "",
    )
    .replace(
      /^ברגעים אלו מעסיק העלה משרה חמה.*?(?=דרוש|לחברה|QA|בודק|מפתח|Help\s*desk|V\s*V|$)/i,
      "",
    )
    .replace(
      /^עדכון על כל משרה חמה.*?(?=דרוש|לחברה|QA|בודק|מפתח|Help\s*desk|V\s*V|$)/i,
      "",
    )
    .replace(/^משרה חמה!\s*/i, "")
    .replace(/^חדש!\s*/i, "")
    .trim();
}

function getJobTitleBeforeCompany(text = "") {
  let beforeCompany = String(text || "").split(/\s+חברה:/i)[0] || "";

  const boundaries = [
    /לצפייה במשרה/gi,
    /משרה חמה!/gi,
    /חשבנו עליך כשראינו את המשרה הזו:/gi,
    /להלן משרות שפורסמו באתר ומתאימות להגדרות החיפוש שלך/gi,
    /להלן משרה שפורסמה באתר ומתאימה להגדרות החיפוש שלך/gi,
    /משרות עדכניות לפי תחומי החיפוש שלך/gi,
    /אבנר שלום,?/gi,
  ];

  for (const boundary of boundaries) {
    const matches = [...beforeCompany.matchAll(boundary)];

    if (matches.length) {
      const last = matches[matches.length - 1];
      beforeCompany = beforeCompany.slice((last.index || 0) + last[0].length);
    }
  }

  return removeAllJobsMailIntro(beforeCompany)
    .replace(/^[-–—:|]+/, "")
    .replace(/\s*\|\s*$/, "")
    .trim();
}

function splitAllJobsTypeAndDescription(value = "") {
  const text = cleanText(value);

  if (!text) {
    return {
      jobType: "",
      description: "",
    };
  }

  const markers = [
    /\s+על התפקיד:/i,
    /\s+תיאור התפקיד:?/i,
    /\s+במסגרת התפקיד:?/i,
    /\s+דרישות:?/i,
    /\s+אנחנו\s+מגייסים/i,
    /\s+we\s+are\s+looking/i,
    /\s+this\s+is\s+a\s+great\s+opportunity/i,
    /\s+לחברה\s+/i,
  ];

  const markerIndex = markers
    .map((regex) => {
      const match = text.match(regex);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (markerIndex === undefined) {
    return {
      jobType: text,
      description: "",
    };
  }

  return {
    jobType: cleanText(text.slice(0, markerIndex)),
    description: cleanText(text.slice(markerIndex)),
  };
}

function cleanAllJobsDescription(value = "") {
  return removeAllJobsMailIntro(value)
    .replace(/^סוג משרה:\s*/i, "")
    .replace(/\s*לצפייה במשרה.*$/i, "")
    .replace(/\s*לצפייה בכל המשרות.*$/i, "")
    .replace(/\s*להסרה.*$/i, "")
    .trim();
}

function extractAllJobsFieldsFromText(text = "") {
  const normalized = normalizeDigestText(text);
  const companyMatch = normalized.match(/חברה:\s*(.*?)\s+מקום העבודה:/i);
  const locationMatch = normalized.match(/מקום העבודה:\s*(.*?)\s+סוג משרה:/i);

  if (!companyMatch || !locationMatch) return null;

  const title = getJobTitleBeforeCompany(normalized);
  const company = cleanText(companyMatch[1]);
  const location = cleanText(locationMatch[1]);

  const afterTypeLabel = normalized.split(/\s+סוג משרה:/i)[1] || "";
  const rawAfterType = afterTypeLabel.split(/\s+לצפייה במשרה\s*/i)[0] || "";
  const { jobType, description } = splitAllJobsTypeAndDescription(rawAfterType);

  const cleanTitle = cleanText(title)
    .replace(/\s*\|\s*$/, "")
    .trim();

  if (!cleanTitle || !company || !location) return null;

  return {
    title: cleanTitle,
    company,
    location,
    jobType: cleanAllJobsDescription(jobType),
    description: cleanAllJobsDescription(description),
  };
}

function allJobsDirectJobLinks(mail = {}) {
  return (Array.isArray(mail.links) ? mail.links : [])
    .filter((link) => /alljobs?\.co\.il/i.test(String(link || "")))
    .filter(
      (link) =>
        /JobID=/i.test(String(link || "")) ||
        /UploadSingle/i.test(String(link || "")),
    )
    .map(normalizeGmailJobUrl);
}

function findAllJobsCardForAnchor($, anchor) {
  let best = null;
  let current = $(anchor);

  for (let depth = 0; depth < 12; depth += 1) {
    current = current.parent();
    if (!current.length) break;

    const text = textFromHtmlNode($, current);
    if (!/חברה:/i.test(text) || !/מקום העבודה:/i.test(text)) continue;

    const buttonCount = (text.match(/לצפייה במשרה/g) || []).length;
    const score = text.length + buttonCount * 2000;

    if (!best || score < best.score) {
      best = { node: current, text, score };
    }
  }

  return best;
}

function parseAllJobsDigestFromHtml(mail = {}) {
  const html = String(mail.bodyHtml || "");
  if (!html || !isAllJobsMail(mail)) return [];

  const $ = loadHtml(html);
  const jobs = [];
  const seen = new Set();

  $("a").each((_, anchor) => {
    const anchorText = cleanText($(anchor).text());
    const href = cleanText($(anchor).attr("href") || "");
    const looksLikeJobButton =
      /לצפייה במשרה/i.test(anchorText) || /JobID=|UploadSingle/i.test(href);

    if (!looksLikeJobButton) return;

    const card = findAllJobsCardForAnchor($, anchor);
    if (!card) return;

    const fields = extractAllJobsFieldsFromText(card.text);
    if (!fields) return;

    const url = normalizeGmailJobUrl(href || "");
    const key =
      `${fields.title}|${fields.company}|${fields.location}|${url}`.toLowerCase();

    if (seen.has(key)) return;

    seen.add(key);
    jobs.push({ ...fields, url });
  });

  return jobs;
}

function dedupeAllJobsParsedJobs(jobs = []) {
  const byKey = new Map();

  for (const job of jobs) {
    const key = [
      job.title,
      job.company,
      job.location,
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();

    if (!key) continue;

    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, job);
      continue;
    }

    const existingHasUrl = Boolean(existing.url);
    const currentHasUrl = Boolean(job.url);

    if (!existingHasUrl && currentHasUrl) {
      byKey.set(key, job);
      continue;
    }

    const existingDescriptionLength = String(existing.description || "").length;
    const currentDescriptionLength = String(job.description || "").length;

    if (
      existingHasUrl === currentHasUrl &&
      currentDescriptionLength > existingDescriptionLength
    ) {
      byKey.set(key, job);
    }
  }

  return [...byKey.values()];
}

function parseAllJobsDigestFromText(mail = {}) {
  if (!isAllJobsMail(mail)) return [];

  const text = normalizeDigestText(
    [mail.bodyText, mail.snippet, mail.title]
      .filter(Boolean)
      .join(" לצפייה במשרה "),
  );

  if (!/חברה:/i.test(text) || !/מקום העבודה:/i.test(text)) return [];

  const links = allJobsDirectJobLinks(mail);
  const jobs = [];
  const companyMatches = [...text.matchAll(/\s+חברה:/gi)];
  let previousEnd = 0;

  companyMatches.forEach((match, index) => {
    const companyIndex = match.index || 0;
    const nextCompanyIndex = companyMatches[index + 1]?.index ?? text.length;

    const viewBefore = text.lastIndexOf("לצפייה במשרה", companyIndex);
    const hotBefore = text.lastIndexOf("משרה חמה!", companyIndex);

    const blockStart = Math.max(
      previousEnd,
      viewBefore >= 0 ? viewBefore + "לצפייה במשרה".length : 0,
      hotBefore >= 0 ? hotBefore : 0,
      Math.max(0, companyIndex - 900),
    );

    const localViewAfter = text
      .slice(companyIndex, nextCompanyIndex)
      .search(/\s+לצפייה במשרה\s*/i);

    const blockEnd =
      localViewAfter >= 0 ? companyIndex + localViewAfter : nextCompanyIndex;

    const block = text.slice(blockStart, blockEnd);
    const fields = extractAllJobsFieldsFromText(block);

    if (fields) {
      jobs.push({ ...fields, url: links[index] || "" });
    }

    previousEnd =
      localViewAfter >= 0
        ? companyIndex + localViewAfter + " לצפייה במשרה ".length
        : blockEnd;
  });

  return dedupeAllJobsParsedJobs(jobs);
}
function parseAllJobsDigestJobs(mail = {}) {
  const textParsed = parseAllJobsDigestFromText(mail);
  const htmlParsed = textParsed.length ? [] : parseAllJobsDigestFromHtml(mail);
  const parsed = textParsed.length ? textParsed : htmlParsed;

  return parsed.map((job, index) => {
    const url = normalizeGmailJobUrl(
      job.url || allJobsDirectJobLinks(mail)[index] || "",
    );

    const description = [
      job.jobType ? `סוג משרה: ${job.jobType}` : "",
      job.description || "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      title: job.title,
      company: job.company,
      location: job.location,
      source: "Gmail · AllJobs",
      sourceQuery: "Gmail import · AllJobs digest split",
      url,
      description,
      snippet: job.description || "",
      gmailMessageId: mail.gmailMessageId,
      gmailThreadId: mail.threadId,
      gmailDigestSplit: true,
      gmailDigestProvider: "alljobs",
      gmailDigestIndex: index + 1,
      importedFromGmailAt: new Date().toISOString(),
      publishedAt: mail.date || mail.importedAt || null,
      status: "found",
    };
  });
}

function isDrushimMail(mail = {}) {
  const text = [
    mail.sender,
    mail.title,
    mail.snippet,
    mail.bodyText,
    ...(mail.links || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("drushim.co.il") ||
    text.includes("drushim") ||
    text.includes("דרושים il") ||
    text.includes("דרושים")
  );
}

function isDrushimNewJobsAlert(mail = {}) {
  const text = [
    mail.title,
    mail.snippet,
    mail.bodyText,
  ]
    .filter(Boolean)
    .join(" ");

  return /משרות חדשות שפורסמו|יש לנו בשבילך\s+\d+\s+משרות חדשות|התואמות להגדרות שלך|המתאימות להגדרות שלך|פורסמו בשעות האחרונות/i.test(
    text,
  );
}

function isBadDrushimAnchor(title = "", href = "") {
  const text = `${title} ${href}`.toLowerCase();

  return /youtube|linkedin|facebook|fb|google|apple|unsubscribe|unsubscribed|הסרה|להסרה|הסר|דיוורים|privacy|terms|בואו לפגוש|לתצוגת כל המשרות|משרות נוספות/i.test(
    text,
  );
}

function looksLikeDrushimJobTitle(title = "") {
  const text = cleanText(title);

  if (text.length < 5 || text.length > 160) return false;
  if (/^(youtube|linkedin|fb|google|apple|link)$/i.test(text)) return false;
  if (/משרות נוספות|לצפייה במשרה|לתצוגת כל המשרות|בואו לפגוש/i.test(text)) return false;

  return /דרוש|דרושה|דרוש\/ה|מיישם|מטמיע|בודק|בודקת|QA|Test|Supervisor|כלכלן|כלכלנית|מפתח|מפתחת|אוטומציה|מערכות|תוכנה|Help\s*desk|Data|Back\s*Office|Developer|Engineer|כתב|כתבת|מדריך|מדריכה|טכני|טכנית/i.test(
    text,
  );
}

function getDrushimHtmlLines(mail = {}) {
  const html = String(mail.bodyHtml || "");

  if (!html) {
    return String(mail.bodyText || "")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean);
  }

  const $ = loadHtml(html);

  $("script,style").remove();
  $("br").replaceWith("\n");
  $("a").append("\n");
  $("p,div,tr,table,li,h1,h2,h3").append("\n");

  return $.root()
    .text()
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

function getDrushimJobAnchors(mail = {}) {
  const html = String(mail.bodyHtml || "");

  if (!html) {
    return [];
  }

  const $ = loadHtml(html);
  const anchors = [];
  const seen = new Set();

  $("a").each((_, anchor) => {
    const title = cleanText($(anchor).text());
    const href = cleanText($(anchor).attr("href") || "");

    if (!title || !href) return;
    if (isBadDrushimAnchor(title, href)) return;
    if (!looksLikeDrushimJobTitle(title)) return;

    const key = `${title}|${href}`.toLowerCase();

    if (seen.has(key)) return;

    seen.add(key);
    anchors.push({
      title,
      url: href,
    });
  });

  return anchors;
}

function findDrushimTitleLineIndex(lines = [], title = "", startAt = 0) {
  const wanted = cleanText(title).toLowerCase();

  for (let index = startAt; index < lines.length; index += 1) {
    if (cleanText(lines[index]).toLowerCase() === wanted) {
      return index;
    }
  }

  for (let index = startAt; index < lines.length; index += 1) {
    const line = cleanText(lines[index]).toLowerCase();

    if (line.includes(wanted)) {
      return index;
    }
  }

  return -1;
}

function isDrushimFooterLine(line = "") {
  return /משרות נוספות|לצפייה במשרה|לתצוגת כל המשרות|בואו לפגוש אותנו|youtube|linkedin|fb|google|apple|להסרה|דיוורים|unsubscribed@|דרושים\s*IL\s*-|מגשימים\s*1|פתח\s*תקווה/i.test(
    line,
  );
}

function getDrushimKnownLocations() {
  return [
    "חיפה",
    "קריית ביאליק",
    "קרית ביאליק",
    "קריית אתא",
    "קרית אתא",
    "בני ברק",
    "עכו",
    "כרמיאל",
    "נשר",
    "יקנעם",
    "יוקנעם",
    "קריות",
    "צפון",
    "גליל",
    "תל אביב",
    "רמת גן",
    "פתח תקווה",
    "פתח תקוה",
    "לוד",
    "Remote",
    "מרחוק",
  ];
}

function splitDrushimMetaLine(value = "") {
  const text = cleanText(value)
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!text) {
    return {
      company: "",
      location: "",
      jobType: "",
    };
  }

  const jobTypeMatch = text.match(
    /\s+(משרה מלאה|משרה חלקית|משמרות|עבודה היברידית|היברידית|עבודה מהבית|ללא ניסיון|ללא נסיון|אקדמאים ללא ניסיון|סטודנטים|1-2 שנים|2-3 שנים|3-4 שנים|4-5 שנים|5\+ שנים|זמנית|קבועה).*$/i,
  );

  const jobType = cleanText(jobTypeMatch?.[1] || "");
  const metaWithoutType = jobTypeMatch
    ? cleanText(text.slice(0, jobTypeMatch.index))
    : text;

  const locations = getDrushimKnownLocations()
    .map((location) => escapeRegExp(location))
    .join("|");

  const companyFirstRegex = new RegExp(`^(.+?)\\s+(${locations}(?:\\s*,\\s*(?:${locations}))*)$`, "i");
  const companyFirstMatch = metaWithoutType.match(companyFirstRegex);

  if (companyFirstMatch) {
    return {
      company: cleanText(companyFirstMatch[1]),
      location: cleanText(companyFirstMatch[2]),
      jobType,
    };
  }

  const hiddenMatch = metaWithoutType.match(/^(.*?)\s+-\s*חסוי\s*-?$/i);

  if (hiddenMatch) {
    return {
      company: "חסוי",
      location: cleanText(hiddenMatch[1]),
      jobType,
    };
  }

  const englishCompanyAtEndMatch = metaWithoutType.match(/^(.*?)\s+([A-Za-z][A-Za-z0-9&.'() -]{1,60})$/);

  if (englishCompanyAtEndMatch) {
    return {
      location: cleanText(englishCompanyAtEndMatch[1]),
      company: cleanText(englishCompanyAtEndMatch[2]),
      jobType,
    };
  }

  return {
    company: cleanSenderName("Drushim"),
    location: metaWithoutType,
    jobType,
  };
}

function cleanDrushimDescriptionLines(lines = []) {
  const cleaned = [];

  for (const line of lines) {
    const value = cleanText(line);

    if (!value) continue;
    if (isDrushimFooterLine(value)) break;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) continue;
    if (/^היי\s+אבנר,?$/i.test(value)) continue;
    if (/^יש לנו בשבילך/i.test(value)) continue;
    if (/^המתאימות להגדרות שלך/i.test(value)) continue;
    if (/^התואמות להגדרות שלך/i.test(value)) continue;
    if (/^פורסמו בשעות האחרונות/i.test(value)) continue;

    cleaned.push(value);
  }

  return cleaned.join("\n").trim();
}

function dedupeDrushimParsedJobs(jobs = []) {
  const byKey = new Map();

  for (const job of jobs) {
    const key = [
      job.title,
      job.company,
      job.location,
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();

    if (!key) continue;

    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, job);
      continue;
    }

    const shouldReplace =
      (!existing.url && job.url) ||
      (
        Boolean(existing.url) === Boolean(job.url) &&
        String(job.description || "").length > String(existing.description || "").length
      );

    if (shouldReplace) {
      byKey.set(key, job);
    }
  }

  return [...byKey.values()];
}

function parseDrushimDigestJobs(mail = {}) {
  if (!isDrushimMail(mail)) return [];
  if (isDrushimAppliedSummaryMail(mail)) return [];
  if (!isDrushimNewJobsAlert(mail)) return [];

  const anchors = getDrushimJobAnchors(mail);
  const lines = getDrushimHtmlLines(mail);

  if (!anchors.length || !lines.length) return [];

  const jobs = [];
  let searchFrom = 0;

  anchors.forEach((anchor, index) => {
    const titleIndex = findDrushimTitleLineIndex(lines, anchor.title, searchFrom);

    if (titleIndex < 0) return;

    const nextAnchor = anchors[index + 1];
    const nextTitleIndex = nextAnchor
      ? findDrushimTitleLineIndex(lines, nextAnchor.title, titleIndex + 1)
      : -1;

    const endIndex = nextTitleIndex > titleIndex ? nextTitleIndex : lines.length;
    const blockLines = lines.slice(titleIndex + 1, endIndex);

    const metaLineIndex = blockLines.findIndex(
      (line) =>
        line &&
        !isDrushimFooterLine(line) &&
        !/^היי\s+אבנר,?$/i.test(line) &&
        !/^יש לנו בשבילך/i.test(line),
    );

    if (metaLineIndex < 0) return;

    const metaLine = blockLines[metaLineIndex];
    const { company, location, jobType } = splitDrushimMetaLine(metaLine);

    const description = cleanDrushimDescriptionLines(
      blockLines.slice(metaLineIndex + 1),
    );

    const title = cleanText(anchor.title);
    const url = anchor.url || "";

    if (!title || !company || !location) return;

    jobs.push({
      title,
      company,
      location,
      source: "Gmail · Drushim",
      sourceQuery: "Gmail import · Drushim digest split",
      url,
      description: [
        jobType ? `סוג משרה: ${jobType}` : "",
        description,
      ]
        .filter(Boolean)
        .join("\n\n"),
      snippet: description.slice(0, 280),
      gmailMessageId: mail.gmailMessageId,
      gmailThreadId: mail.threadId,
      gmailDigestSplit: true,
      gmailDigestProvider: "drushim",
      gmailDigestIndex: jobs.length + 1,
      importedFromGmailAt: new Date().toISOString(),
      publishedAt: mail.date || mail.importedAt || null,
      status: "found",
    });

    searchFrom = titleIndex + 1;
  });

  return dedupeDrushimParsedJobs(jobs);
}

function parseGmailDigestJobs(mail = {}) {
  if (isAllJobsMail(mail)) {
    return parseAllJobsDigestJobs(mail);
  }

  if (isDrushimMail(mail)) {
    return parseDrushimDigestJobs(mail);
  }

  return [];
}
function normalizeAllJobsCandidateFromContent(candidate = {}, mail = {}) {
  if (!isAllJobsMail(mail) && candidate.source !== "Gmail · AllJobs") {
    return candidate;
  }

  const combinedText = normalizeDigestText(
    [
      candidate.title,
      candidate.description,
      candidate.snippet,
      mail.bodyText,
      mail.snippet,
      mail.title,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const fields = extractAllJobsFieldsFromText(combinedText);
  if (!fields) return candidate;

  const url = normalizeGmailJobUrl(
    candidate.url ||
      allJobsDirectJobLinks(mail)[0] ||
      (Array.isArray(mail.links) ? mail.links[0] : "") ||
      "",
  );

  return {
    ...candidate,
    title: fields.title,
    company: fields.company,
    location: fields.location,
    source: "Gmail · AllJobs",
    sourceQuery: "Gmail import · AllJobs normalized",
    url,
    description: [
      fields.jobType ? `סוג משרה: ${fields.jobType}` : "",
      fields.description || "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    snippet: fields.description || candidate.snippet || "",
    gmailDigestProvider: "alljobs",
  };
}

function gmailMailToJobCandidates(mail = {}) {
  if (isNonJobGmailMail(mail)) {
    return [];
  }

  const splitDigestJobs = parseGmailDigestJobs(mail);
  if (splitDigestJobs.length > 0) {
    return splitDigestJobs;
  }

  const links = extractGmailJobLinks(mail);
  const location = guessGmailLocation(mail);
  const primaryUrl = normalizeGmailJobUrl(
    links[0] || (Array.isArray(mail.links) ? mail.links[0] : "") || "",
  );
  const digest = isGmailDigestMail(mail, links);

  if (digest) {
    const digestCandidate = {
      title: buildGmailDigestTitle(mail),
      company: cleanSenderName(mail.sender),
      location,
      source: sourceFromGmailLink(primaryUrl, mail.sender),
      sourceQuery: "Gmail import",
      url: primaryUrl,
      description: [
        mail.title,
        mail.snippet,
        links.length
          ? `נמצאו ${links.length} קישורי משרה במייל הזה. נשמר כתקציר לבדיקה כדי לא ליצור כרטיסים מזויפים בלי כותרת אמיתית לכל משרה.`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      snippet: mail.snippet || "",
      gmailMessageId: mail.gmailMessageId,
      gmailThreadId: mail.threadId,
      importedFromGmailAt: new Date().toISOString(),
      publishedAt: mail.date || mail.importedAt || null,
      gmailDigest: true,
      status: "found",
    };

    return [normalizeAllJobsCandidateFromContent(digestCandidate, mail)];
  }

  const url = normalizeGmailJobUrl(links[0] || "");

  const singleCandidate = {
    title: extractSingleGmailJobTitle(mail),
    company: cleanSenderName(mail.sender),
    location,
    source: sourceFromGmailLink(url, mail.sender),
    sourceQuery: "Gmail import",
    url: url || (Array.isArray(mail.links) ? mail.links[0] : "") || "",
    description: [mail.title, mail.snippet].filter(Boolean).join("\n\n"),
    snippet: mail.snippet || "",
    gmailMessageId: mail.gmailMessageId,
    gmailThreadId: mail.threadId,
    importedFromGmailAt: new Date().toISOString(),
    publishedAt: mail.date || mail.importedAt || null,
    status: "found",
  };

  return [normalizeAllJobsCandidateFromContent(singleCandidate, mail)];
}
async function importGmailJobsIntoMainList({
  days = 14,
  maxResults = 40,
  force = false,
} = {}) {
  const importResult = await importGmailJobEmails({ days, maxResults });

  if (!importResult.connected) {
    return {
      ...importResult,
      addedToJobs: 0,
      reviewCandidates: 0,
      skippedByScoring: 0,
      routedToReviewByScoring: 0,
      alreadyProcessed: 0,
      totalJobs: 0,
      jobs: [],
    };
  }

  const [currentJobs, profile, keywords, feedback, state] = await Promise.all([
    readJson(JOBS_FILE, []),
    readJson(PROFILE_FILE, {}),
    readJson(KEYWORDS_FILE, {}),
    readJson(FEEDBACK_FILE, []),
    readGmailAgentState(),
  ]);

  const processedMessageIds = new Set(state.processedMessageIds || []);
  const importedMails = Array.isArray(importResult.imported)
    ? importResult.imported
    : [];
  const mailsToProcess = force
    ? importedMails
    : importedMails.filter(
        (mail) => !processedMessageIds.has(mail.gmailMessageId),
      );

  const alreadyProcessed = importedMails.length - mailsToProcess.length;
  const candidates = mailsToProcess.flatMap(gmailMailToJobCandidates);
  const scoredCandidatesRaw = [];
  let routedToReviewByScoring = 0;

  for (const candidate of candidates) {
    const enriched = enrichJob(candidate);
    const scored = applyDecisionGates({
      ...enriched,
      ...scoreJob(enriched, profile, keywords, feedback),
    });

    const learningRejectedSimilarJob = (scored.warnings || []).some((warning) =>
      /בעבר פסלת|דומות נדחו/i.test(String(warning || "")),
    );

    if (learningRejectedSimilarJob) {
      scored.recommendation = "review";
      scored.fitScore = Math.min(Number(scored.fitScore || 0), 75);
    }
    const originalRecommendation = scored.recommendation;
    const originalFitScore = Number(scored.fitScore || 0);
    const forceDigestReview =
      candidate.gmailDigest === true && candidate.gmailDigestSplit !== true;
    const needsManualReview =
      forceDigestReview ||
      originalRecommendation === "skip" ||
      originalFitScore < 45;

    if (needsManualReview) {
      routedToReviewByScoring += 1;
      scored.recommendation = "review";
      scored.fitScore = forceDigestReview
        ? Math.min(Math.max(originalFitScore, 50), 65)
        : Math.max(originalFitScore, 50);
      scored.warnings = [
        forceDigestReview
          ? "יובא מ-Gmail כתקציר משרות: לא פוצל לכרטיסים נפרדים כי אין כותרת אמיתית לכל קישור במייל."
          : "יובא מ-Gmail: המייל הגיע ממקור משרות אמין ולכן לא נפסל אוטומטית.",
        forceDigestReview
          ? "פתח את המייל/הקישור ובדוק ידנית איזו משרה רלוונטית לפני סימון שליחה."
          : "המערכת לא זיהתה התאמה מלאה, לכן המשרה הועברה לבדיקה ידנית.",
        ...(scored.warnings || []),
      ].slice(0, 8);
    }

    scored.id = createJobId(scored);
    scored.status =
      scored.status === "skipped" ? "found" : scored.status || "found";
    scored.reasons = [
      "יובא מ-Gmail Agent — מיילים מאתרי משרות מוגדרים כרלוונטיים כברירת מחדל.",
      "הניקוד משמש למיון ולבדיקה, לא למחיקה אוטומטית של משרות מהסוכן.",
      ...(scored.reasons || []),
    ].slice(0, 8);

    scoredCandidatesRaw.push(scored);
  }

  const scoredCandidateMap = new Map();

  for (const job of scoredCandidatesRaw) {
    const key = getReviewKey(job) || job.id;
    const existing = scoredCandidateMap.get(key);

    if (!existing) {
      scoredCandidateMap.set(key, job);
      continue;
    }

    const existingIsDigest = existing.gmailDigest === true && existing.gmailDigestSplit !== true;
    const currentIsDigest = job.gmailDigest === true && job.gmailDigestSplit !== true;

    const existingIsSplit = existing.gmailDigestSplit === true;
    const currentIsSplit = job.gmailDigestSplit === true;

    const shouldReplace =
      (existingIsDigest && !currentIsDigest) ||
      (!existingIsSplit && currentIsSplit) ||
      (
        existingIsDigest === currentIsDigest &&
        existingIsSplit === currentIsSplit &&
        String(job.description || "").length > String(existing.description || "").length
      );

    if (shouldReplace) {
      scoredCandidateMap.set(key, job);
    }
  }

  const scoredCandidates = [...scoredCandidateMap.values()];
  const handledStatuses = new Set([
    "applied",
    "saved",
    "interview",
    "archived",
    "rejected",
    "skipped",
  ]);

  const splitDigestMessageIds = new Set(
    scoredCandidates
      .filter((job) => job.gmailDigestSplit === true && job.gmailMessageId)
      .map((job) => job.gmailMessageId),
  );

  const candidateReviewKeys = new Set(scoredCandidates.map(getReviewKey));
  const candidateMessageIds = new Set(
    scoredCandidates.map((job) => job.gmailMessageId).filter(Boolean),
  );

  const jobsWithoutReplacedDigestSummaries = (
    Array.isArray(currentJobs) ? currentJobs : []
  ).filter((job) => {
    if (handledStatuses.has(String(job.status || ""))) {
      return true;
    }

    if (
      job.gmailDigest === true &&
      splitDigestMessageIds.has(job.gmailMessageId)
    ) {
      return false;
    }

    const isAllJobsGmail =
      job.source === "Gmail · AllJobs" || job.gmailDigestProvider === "alljobs";

    if (
      isAllJobsGmail &&
      (candidateReviewKeys.has(getReviewKey(job)) ||
        candidateMessageIds.has(job.gmailMessageId))
    ) {
      return false;
    }

    return true;
  });

  const before = Array.isArray(currentJobs) ? currentJobs.length : 0;
  const merged = uniqueById([
    ...jobsWithoutReplacedDigestSummaries,
    ...scoredCandidates,
  ]);
  const processedJobIds = new Set(state.processedJobIds || []);
  scoredCandidates.forEach((job) => processedJobIds.add(job.id));
  mailsToProcess.forEach((mail) =>
    processedMessageIds.add(mail.gmailMessageId),
  );

  const resultSummary = {
    scanned: importResult.scanned || 0,
    imported: importResult.total || 0,
    processedNow: mailsToProcess.length,
    alreadyProcessed,
    candidateJobs: candidates.length,
    addedToJobs: Math.max(0, merged.length - before),
    replacedDigestSummaries: Math.max(
      0,
      (Array.isArray(currentJobs) ? currentJobs.length : 0) -
        jobsWithoutReplacedDigestSummaries.length,
    ),
    reviewCandidates: scoredCandidates.filter(
      (job) => job.recommendation === "review",
    ).length,
    routedToReviewByScoring,
    totalJobs: merged.length,
    at: new Date().toISOString(),
  };

  await writeGmailAgentState({
    ...state,
    lastImportAt: resultSummary.at,
    processedMessageIds: [...processedMessageIds],
    processedJobIds: [...processedJobIds],
    lastResult: resultSummary,
  });

  return {
    ...importResult,
    ...resultSummary,
    skippedByScoring: routedToReviewByScoring,
    jobs: scoredCandidates,
  };
}

app.get("/api/jobs", async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

app.get("/api/jobs/review", async (req, res, next) => {
  try {
    const [audit, savedJobs, feedback] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, { jobs: [] }),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
    ]);

    res.json(buildReviewJobs(audit, savedJobs, feedback));
  } catch (error) {
    next(error);
  }
});


const JOB_SCAN_MODE_ENV_KEYS = [
  "SEARCH_PROVIDERS",
  "SEARCH_PROVIDER",
  "SCAN_MAX_QUERIES",
  "SCAN_BATCH_SIZE",
  "ALLJOBS_MAX_PAGES",
  "ALLJOBS_MAX_RESULTS",
  "ALLJOBS_FETCH_DETAILS",
  "ALLJOBS_DETAIL_LIMIT",
  "ALLJOBS_DETAIL_DELAY_MS",
  "DRUSHIM_MAX_RESULTS",
  "JOBMASTER_MAX_RESULTS",
];

function normalizeJobScanMode(mode) {
  const value = String(mode || "quick").trim().toLowerCase();
  if (value === "deep") return "deep";
  if (value === "quick") return "quick";
  return "quick";
}

function applyJobScanMode(mode) {
  const normalizedMode = normalizeJobScanMode(mode);

  const previous = Object.fromEntries(
    JOB_SCAN_MODE_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  const apply = (values) => {
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = String(value);
    }
  };

  if (normalizedMode === "deep") {
    apply({
      SEARCH_PROVIDERS: "alljobs,drushim,jobmaster",
      SEARCH_PROVIDER: "alljobs,drushim,jobmaster",
      SCAN_MAX_QUERIES: "8",
      SCAN_BATCH_SIZE: "6",
      ALLJOBS_MAX_PAGES: "8",
      ALLJOBS_MAX_RESULTS: "180",
      ALLJOBS_FETCH_DETAILS: "true",
      ALLJOBS_DETAIL_LIMIT: "80",
      ALLJOBS_DETAIL_DELAY_MS: "100",
      DRUSHIM_MAX_RESULTS: "60",
      JOBMASTER_MAX_RESULTS: "60",
    });
  } else {
    apply({
      SEARCH_PROVIDERS: "alljobs,drushim",
      SEARCH_PROVIDER: "alljobs,drushim",
      SCAN_MAX_QUERIES: "2",
      SCAN_BATCH_SIZE: "4",
      ALLJOBS_MAX_PAGES: "3",
      ALLJOBS_MAX_RESULTS: "60",
      ALLJOBS_FETCH_DETAILS: "true",
      ALLJOBS_DETAIL_LIMIT: "20",
      ALLJOBS_DETAIL_DELAY_MS: "100",
      DRUSHIM_MAX_RESULTS: "30",
    });
  }

  return {
    mode: normalizedMode,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

app.post("/api/jobs/find", async (req, res, next) => {
  const scanMode = applyJobScanMode(req.body?.mode);

  try {
    const result = await findJobs({
      useMock: false,
      resume: Boolean(req.body?.resume),
      batchSize: Number(req.body?.batchSize || process.env.SCAN_BATCH_SIZE || 0),
    });
    res.json({ ...result, mode: scanMode.mode });
  } catch (error) {
    next(error);
  } finally {
    scanMode.restore();
  }
});

app.get("/api/jobs/scan-progress", async (req, res, next) => {
  try {
    res.json(await getScanProgress());
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/scan-stop", async (req, res, next) => {
  try {
    res.json(await requestScanStop());
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/mock", async (req, res, next) => {
  try {
    const result = await findJobs({ useMock: true });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/review/:id/promote", async (req, res, next) => {
  try {
    const status = String(req.body?.status || "saved").trim();
    if (!["saved", "applied", "interview"].includes(status)) {
      res.status(400).json({ error: `סטטוס לא תקין: ${status}` });
      return;
    }

    const [audit, savedJobs, feedback] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, { jobs: [] }),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
    ]);

    const reviewJob = findReviewJobById(
      audit,
      savedJobs,
      feedback,
      req.params.id,
    );
    if (!reviewJob) {
      res.status(404).json({ error: "המשרה לבדיקה לא נמצאה או כבר טופלה" });
      return;
    }

    const now = new Date().toISOString();
    const promotedJob = {
      ...reviewJob,
      id: createJobId(reviewJob),
      status,
      promotedFromReview: true,
      updatedAt: now,
      foundAt: reviewJob.foundAt || now,
    };

    const reviewKey = getReviewKey(promotedJob);
    const existingIndex = savedJobs.findIndex(
      (job) => job.id === promotedJob.id || getReviewKey(job) === reviewKey,
    );

    if (existingIndex >= 0) {
      savedJobs[existingIndex] = {
        ...savedJobs[existingIndex],
        ...promotedJob,
        status,
        updatedAt: now,
      };
    } else {
      savedJobs.push(promotedJob);
    }

    const merged = uniqueById(savedJobs);
    await writeJson(JOBS_FILE, merged);
    await appendFeedback(promotedJob, status, {
      reviewKey,
      fromManualReview: true,
    });

    res.json(promotedJob);
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs/review/:id/reject", async (req, res, next) => {
  try {
    const [audit, savedJobs, feedback] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, { jobs: [] }),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
    ]);

    const reviewJob = findReviewJobById(
      audit,
      savedJobs,
      feedback,
      req.params.id,
    );
    if (!reviewJob) {
      res.status(404).json({ error: "המשרה לבדיקה לא נמצאה או כבר טופלה" });
      return;
    }

    await appendFeedback(
      { ...reviewJob, id: reviewJob.id || createJobId(reviewJob) },
      "deleted",
      {
        rejectionReason: req.body?.rejectionReason || req.body?.reason,
        reviewKey: getReviewKey(reviewJob),
        fromManualReview: true,
      },
    );

    res.json({ ok: true, removed: 1 });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/jobs/:id", async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const index = jobs.findIndex((job) => job.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "המשרה לא נמצאה" });
      return;
    }

    const currentJob = jobs[index];
    const patch = {};

    if ("status" in req.body) {
      const status = String(req.body.status || "").trim();
      if (!ALLOWED_STATUSES.has(status)) {
        res.status(400).json({ error: `סטטוס לא תקין: ${status}` });
        return;
      }
      patch.status = status;
    }

    if ("notes" in req.body) {
      patch.notes = String(req.body.notes || "").slice(0, 2000);
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "לא נשלח שדה לעדכון" });
      return;
    }

    const updatedJob = {
      ...currentJob,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    jobs[index] = updatedJob;
    await writeJson(JOBS_FILE, jobs);

    if (
      patch.status &&
      patch.status !== currentJob.status &&
      FEEDBACK_STATUSES.has(patch.status)
    ) {
      await appendFeedback(updatedJob, patch.status);
    }

    res.json(updatedJob);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/jobs/:id", async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const index = jobs.findIndex((job) => job.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "המשרה לא נמצאה" });
      return;
    }

    const now = new Date().toISOString();
    const archivedJob = {
      ...jobs[index],
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      archiveReason: req.body?.rejectionReason || req.body?.reason || "other",
    };

    jobs[index] = archivedJob;
    await writeJson(JOBS_FILE, uniqueById(jobs));
    await appendFeedback(archivedJob, "deleted", {
      rejectionReason: req.body?.rejectionReason || req.body?.reason,
    });

    res.json({ ok: true, archived: 1, job: archivedJob });
  } catch (error) {
    next(error);
  }
});

app.get("/api/feedback", async (req, res, next) => {
  try {
    res.json(await readJson(FEEDBACK_FILE, []));
  } catch (error) {
    next(error);
  }
});

app.get("/api/profile", async (req, res, next) => {
  try {
    res.json(await readJson(PROFILE_FILE, {}));
  } catch (error) {
    next(error);
  }
});

app.get("/api/keywords", async (req, res, next) => {
  try {
    res.json(await readJson(KEYWORDS_FILE, {}));
  } catch (error) {
    next(error);
  }
});

app.get("/api/role-profiles", async (req, res, next) => {
  try {
    res.json(await readJson(ROLE_PROFILES_FILE, []));
  } catch (error) {
    next(error);
  }
});

// Compatibility alias for the UI and manual checks.
app.get("/api/roles", async (req, res, next) => {
  try {
    res.json(await readJson(ROLE_PROFILES_FILE, []));
  } catch (error) {
    next(error);
  }
});

app.post("/api/role-profiles", async (req, res, next) => {
  try {
    const profile = await saveRoleProfile(req.body || {});
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.post("/api/roles", async (req, res, next) => {
  try {
    const profile = await saveRoleProfile(req.body || {});
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/role-profiles/:id", async (req, res, next) => {
  try {
    const roleProfiles = await readJson(ROLE_PROFILES_FILE, []);
    const existing = roleProfiles.find(
      (profile) => profile.id === req.params.id,
    );

    if (!existing) {
      res.status(404).json({ error: "התפקיד לא נמצא" });
      return;
    }

    const profile = await saveRoleProfile({
      ...existing,
      ...req.body,
      id: existing.id,
    });

    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/role-profiles/:id", async (req, res, next) => {
  try {
    const roleProfiles = await readJson(ROLE_PROFILES_FILE, []);
    const nextProfiles = roleProfiles.filter(
      (profile) => profile.id !== req.params.id,
    );

    if (nextProfiles.length === roleProfiles.length) {
      res.status(404).json({ error: "התפקיד לא נמצא" });
      return;
    }

    await writeJson(ROLE_PROFILES_FILE, nextProfiles);
    res.json({ ok: true, removed: 1 });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/roles/:id", async (req, res, next) => {
  try {
    const roleProfiles = await readJson(ROLE_PROFILES_FILE, []);
    const existing = roleProfiles.find(
      (profile) => profile.id === req.params.id,
    );

    if (!existing) {
      res.status(404).json({ error: "התפקיד לא נמצא" });
      return;
    }

    const profile = await saveRoleProfile({
      ...existing,
      ...req.body,
      id: existing.id,
    });

    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/roles/:id", async (req, res, next) => {
  try {
    const roleProfiles = await readJson(ROLE_PROFILES_FILE, []);
    const nextProfiles = roleProfiles.filter(
      (profile) => profile.id !== req.params.id,
    );

    if (nextProfiles.length === roleProfiles.length) {
      res.status(404).json({ error: "התפקיד לא נמצא" });
      return;
    }

    await writeJson(ROLE_PROFILES_FILE, nextProfiles);
    res.json({ ok: true, removed: 1 });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sources", async (req, res, next) => {
  try {
    res.json(await readJson(SITE_SOURCES_FILE, []));
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/status", async (req, res, next) => {
  try {
    res.json(await getGmailConnectionStatus());
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/auth-url", async (req, res, next) => {
  try {
    res.json({ url: getGmailAuthUrl() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/oauth2callback", async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      res.status(400).send("Missing OAuth code");
      return;
    }

    await saveGmailTokensFromCode(code);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.send(`
      <html dir="rtl" lang="he">
        <head>
          <meta charset="utf-8" />
          <title>Gmail חובר</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 32px; background: #f8fafc; color: #0f172a;">
          <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 24px; padding: 28px; box-shadow: 0 18px 45px rgba(15,23,42,.12);">
            <h1 style="margin: 0 0 12px;">Gmail חובר בהצלחה</h1>
            <p style="font-size: 16px; line-height: 1.7;">אפשר לחזור לאפליקציה ולייבא מיילים רלוונטיים למשרות.</p>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = ${JSON.stringify(clientUrl)};
            }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Gmail OAuth callback failed:", error);
    res.status(500).send(`Gmail OAuth failed: ${error.message}`);
  }
});

app.get("/api/gmail/import", async (req, res, next) => {
  try {
    const days = Number.parseInt(
      req.query?.days || process.env.GMAIL_IMPORT_DAYS || "14",
      10,
    );
    const maxResults = Number.parseInt(
      req.query?.maxResults || process.env.GMAIL_IMPORT_MAX_RESULTS || "40",
      10,
    );

    res.json(await importGmailJobEmails({ days, maxResults }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail/import", async (req, res, next) => {
  try {
    const days = Number.parseInt(
      req.body?.days || process.env.GMAIL_IMPORT_DAYS || "14",
      10,
    );
    const maxResults = Number.parseInt(
      req.body?.maxResults || process.env.GMAIL_IMPORT_MAX_RESULTS || "40",
      10,
    );

    res.json(await importGmailJobEmails({ days, maxResults }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/import-to-jobs", async (req, res, next) => {
  try {
    const days = Number.parseInt(
      req.query?.days || process.env.GMAIL_IMPORT_DAYS || "14",
      10,
    );
    const maxResults = Number.parseInt(
      req.query?.maxResults || process.env.GMAIL_IMPORT_MAX_RESULTS || "40",
      10,
    );

    res.json(
      await importGmailJobsIntoMainList({
        days,
        maxResults,
        force: req.query?.force === "true",
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail/import-to-jobs", async (req, res, next) => {
  try {
    const days = Number.parseInt(
      req.body?.days || process.env.GMAIL_IMPORT_DAYS || "14",
      10,
    );
    const maxResults = Number.parseInt(
      req.body?.maxResults || process.env.GMAIL_IMPORT_MAX_RESULTS || "40",
      10,
    );

    res.json(
      await importGmailJobsIntoMainList({
        days,
        maxResults,
        force: req.body?.force === true,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/jobs", async (req, res, next) => {
  try {
    res.json(await getImportedGmailJobs());
  } catch (error) {
    next(error);
  }
});

app.get("/api/scan-summary", async (req, res, next) => {
  try {
    const [audit, jobs, feedback, siteSources] = await Promise.all([
      readJson(SCAN_AUDIT_FILE, {}),
      readJson(JOBS_FILE, []),
      readJson(FEEDBACK_FILE, []),
      readJson(SITE_SOURCES_FILE, []),
    ]);

    res.json(buildScanSummary(audit, jobs, feedback, siteSources));
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/agent-summary", async (req, res, next) => {
  try {
    res.json(await buildGmailAgentSummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/gmail/trusted-senders", async (req, res, next) => {
  try {
    res.json(await readTrustedSenderList());
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail/trusted-senders", async (req, res, next) => {
  try {
    const list = await readTrustedSenderList();
    const sender = normalizeTrustedSender(req.body || {});
    const nextList = [
      ...list.filter((item) => item.id !== sender.id),
      sender,
    ].sort((a, b) =>
      String(a.name || a.id).localeCompare(String(b.name || b.id), "he"),
    );

    await writeTrustedSenderList(nextList);
    res.json({ ok: true, sender, senders: nextList });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/gmail/trusted-senders/:id", async (req, res, next) => {
  try {
    const list = await readTrustedSenderList();
    const existing = list.find((item) => item.id === req.params.id);

    if (!existing) {
      return res.status(404).json({ error: "מקור המשרות לא נמצא" });
    }

    const sender = normalizeTrustedSender(
      { ...existing, ...(req.body || {}), id: existing.id },
      existing,
    );
    const nextList = list.map((item) =>
      item.id === req.params.id ? sender : item,
    );

    await writeTrustedSenderList(nextList);
    res.json({ ok: true, sender, senders: nextList });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/gmail/trusted-senders/:id", async (req, res, next) => {
  try {
    const list = await readTrustedSenderList();
    const nextList = list.filter((item) => item.id !== req.params.id);
    await writeTrustedSenderList(nextList);
    res.json({ ok: true, removedId: req.params.id, senders: nextList });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail/trusted-senders/reset", async (req, res, next) => {
  try {
    await writeTrustedSenderList(DEFAULT_TRUSTED_JOB_SENDERS);
    res.json({ ok: true, senders: DEFAULT_TRUSTED_JOB_SENDERS });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail/cleanup-fake-splits", async (req, res, next) => {
  try {
    const jobs = await readJson(JOBS_FILE, []);
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const cleaned = safeJobs.filter((job) => !isFakeGmailSplitJob(job));
    const removed = safeJobs.length - cleaned.length;

    await writeJson(JOBS_FILE, cleaned);

    res.json({
      ok: true,
      before: safeJobs.length,
      after: cleaned.length,
      removed,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gmail-agent/jobs/:id/status", async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.id || "");
    const status = String(req.body?.status || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: "סטטוס לא תקין" });
    }

    const jobs = await readJson(JOBS_FILE, []);
    const safeJobs = Array.isArray(jobs) ? jobs : [];

    const index = safeJobs.findIndex((job) => job.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "המשרה לא נמצאה" });
    }

    const now = new Date().toISOString();
    const existing = safeJobs[index];

    const updatedJob = {
      ...existing,
      status,
      updatedAt: now,
    };

    if (status === "rejected" || status === "archived") {
      updatedJob.recommendation = "review";
    }

    if (status === "applied") {
      updatedJob.appliedAt = now;
      updatedJob.recommendation = "apply";
    }

    if (status === "saved") {
      updatedJob.savedAt = now;
    }

    safeJobs[index] = updatedJob;

    await writeJson(JOBS_FILE, safeJobs);

    const shouldCreateFeedback =
      status === "saved" ||
      status === "applied" ||
      status === "interview" ||
      status === "rejected" ||
      status === "skipped" ||
      status === "archived";

    if (shouldCreateFeedback) {
      const feedback = await readJson(FEEDBACK_FILE, []);
      const safeFeedback = Array.isArray(feedback) ? feedback : [];
      const feedbackAction = status === "archived" ? "deleted" : status;

      safeFeedback.push(
        createFeedbackEntry(updatedJob, feedbackAction, {
          rejectionReason:
            status === "rejected" || status === "archived" ? reason : "",
          reason,
          fromGmailAgent: true,
        }),
      );

      await writeJson(FEEDBACK_FILE, safeFeedback.slice(-1500));
    }

    res.json({
      ok: true,
      job: updatedJob,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "שגיאת שרת" });
});

app.listen(port, () => {
  console.log(`שרת חיפוש המשרות פעיל: http://localhost:${port}`);
});








