import { readJson, writeJson } from "./fileStore.js";
import {
  GMAIL_IMPORTS_FILE,
  KEYWORDS_FILE,
  ROLE_PROFILES_FILE,
  TRUSTED_JOB_SENDERS_FILE,
} from "./paths.js";
import { getAuthorizedGmailClient } from "./gmailAuth.js";

const DEFAULT_DAYS = Number.parseInt(process.env.GMAIL_IMPORT_DAYS || "14", 10);
const DEFAULT_MAX_RESULTS = Number.parseInt(
  process.env.GMAIL_IMPORT_MAX_RESULTS || "40",
  10,
);

const DEFAULT_GMAIL_JOB_LABEL_NAME =
  process.env.GMAIL_JOB_LABEL_NAME || "הצעות עבודה";

export const DEFAULT_TRUSTED_JOB_SENDERS = [
  {
    id: "alljobs",
    name: "AllJobs",
    domains: ["alljob.co.il", "alljobs.co.il"],
    enabled: true,
    notes: "התראות משרות מסוננות מ-AllJobs",
  },
  {
    id: "drushim",
    name: "Drushim",
    domains: ["drushim.co.il"],
    enabled: true,
    notes: "סוכן דרושים / התראות משרות",
  },
  {
    id: "jobmaster",
    name: "JobMaster",
    domains: ["jobmaster.co.il"],
    enabled: true,
    notes: "סוכן משרות JobMaster",
  },
  {
    id: "jobnet",
    name: "Jobnet",
    domains: ["jobnet.co.il"],
    enabled: true,
    notes: "התראות Jobnet",
  },
  {
    id: "indeed",
    name: "Indeed Job Alerts",
    domains: ["indeed.com", "jobalert.indeed.com"],
    enabled: true,
    notes: "התראות Indeed בלבד",
  },
  {
    id: "linkedin",
    name: "LinkedIn Jobs",
    domains: ["linkedin.com"],
    enabled: true,
    notes: "התראות LinkedIn Jobs",
  },
  {
    id: "gotfriends",
    name: "GotFriends",
    domains: ["gotfriends.co.il"],
    enabled: true,
    notes: "משרות הייטק / גיוס",
  },
  {
    id: "nisha",
    name: "Nisha",
    domains: ["nisha.co.il"],
    enabled: true,
    notes: "חברת השמה",
  },
  {
    id: "sqlink",
    name: "SQLink",
    domains: ["sqlink.com", "sqlink.co.il"],
    enabled: true,
    notes: "השמה והייטק",
  },
  {
    id: "ethosia",
    name: "Ethosia",
    domains: ["ethosia.co.il"],
    enabled: true,
    notes: "השמה והייטק",
  },
  {
    id: "dialog",
    name: "Dialog",
    domains: ["dialog.co.il"],
    enabled: true,
    notes: "השמה והייטק",
  },
  {
    id: "jobkarov",
    name: "JobKarov",
    domains: ["jobkarov.com"],
    enabled: true,
    notes: "לוח משרות נוסף לבדיקה",
  },
  {
    id: "careerjet",
    name: "Careerjet",
    domains: ["careerjet.co.il"],
    enabled: true,
    notes: "מנוע משרות / התראות אם זמינות",
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    domains: ["glassdoor.com"],
    enabled: false,
    notes: "אופציונלי — כדאי להפעיל רק אם ההתראות מדויקות",
  },
];

export async function getTrustedJobSenders() {
  const saved = await readJson(TRUSTED_JOB_SENDERS_FILE, null);
  const list = Array.isArray(saved) ? saved : DEFAULT_TRUSTED_JOB_SENDERS;

  return list
    .filter((sender) => sender && sender.enabled !== false)
    .map((sender) => ({
      id:
        sender.id ||
        String(sender.name || sender.domains?.[0] || "")
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "_"),
      name: sender.name || sender.id || "Job source",
      domains: Array.isArray(sender.domains)
        ? sender.domains.map(String).filter(Boolean)
        : [],
      enabled: sender.enabled !== false,
      notes: sender.notes || "",
    }))
    .filter((sender) => sender.domains.length > 0);
}

export async function getAllTrustedJobSenders() {
  const saved = await readJson(TRUSTED_JOB_SENDERS_FILE, null);
  return Array.isArray(saved) ? saved : DEFAULT_TRUSTED_JOB_SENDERS;
}

function trustedSenderToGmailQuery(sender = {}) {
  return (sender.domains || [])
    .map((domain) =>
      String(domain || "")
        .trim()
        .replace(/^@/, ""),
    )
    .filter(Boolean)
    .map((domain) => `from:${domain}`);
}

function senderTextMatchesTrustedSenders(text = "", trustedSenders = []) {
  const lower = String(text || "").toLowerCase();

  return trustedSenders.some((sender) =>
    (sender.domains || []).some((domain) =>
      lower.includes(
        String(domain || "")
          .toLowerCase()
          .replace(/^@/, ""),
      ),
    ),
  );
}

const DEFAULT_TARGET_TERMS = [
  "QA",
  "Manual QA",
  "Junior QA",
  "בודק תוכנה",
  "בודקת תוכנה",
  "בדיקות תוכנה",
  "בודק/ת QA",
  "Data Entry",
  "Back Office",
  "בקרת מסמכים",
  "מידען",
  "מיישם מערכות",
  "מטמיע מערכות",
];

const TOO_BROAD_GMAIL_TERMS = new Set([
  "job",
  "jobs",
  "משרה",
  "משרות",
  "דרושים",
  "developer",
  "software",
  "תוכנה",
  "junior",
  "ללא ניסיון",
  "ללא נסיון",
]);

function decodeBase64Url(value = "") {
  if (!value) return "";

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  return Buffer.from(padded, "base64").toString("utf8");
}

function getHeader(headers = [], name) {
  return (
    headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value || ""
  );
}

function stripHtml(html = "") {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinksFromText(text = "") {
  return String(text || "").match(/https?:\/\/[^\s<>"')]+/gi) || [];
}

function extractLinksFromHtml(html = "") {
  const links = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html))) {
    links.push(match[1]);
  }

  return links;
}

function collectMessageContent(
  payload,
  result = { textParts: [], htmlParts: [], links: [] },
) {
  if (!payload) return result;

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);

    if (payload.mimeType === "text/html") {
      result.htmlParts.push(decoded);
      result.textParts.push(stripHtml(decoded));
      result.links.push(...extractLinksFromHtml(decoded));
      result.links.push(...extractLinksFromText(decoded));
    } else if (payload.mimeType === "text/plain") {
      result.textParts.push(decoded);
      result.links.push(...extractLinksFromText(decoded));
    }
  }

  for (const part of payload.parts || []) {
    collectMessageContent(part, result);
  }

  return result;
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLink(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/[)>.,]+$/g, "")
    .trim();
}

function uniqueLinks(links = [], limit = 80) {
  return [...new Set(links.map(cleanLink))]
    .filter((link) => /^https?:\/\//i.test(link))
    .filter((link) => !link.includes("mail.google.com"))
    .slice(0, limit);
}

function normalizeTerm(value = "") {
  return String(value || "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gmailQuoteTerm(value = "") {
  const term = normalizeTerm(value);
  if (!term) return "";

  if (/\s/.test(term) || /[א-ת]/.test(term) || /[-/]/.test(term)) {
    return `"${term.replace(/"/g, "")}"`;
  }

  return term;
}

function isUsefulGmailTerm(value = "") {
  const term = normalizeTerm(value).toLowerCase();

  if (!term || term.length < 2 || term.length > 48) return false;
  if (TOO_BROAD_GMAIL_TERMS.has(term)) return false;
  if (/^https?:/i.test(term)) return false;
  if (/^[0-9]+$/.test(term)) return false;

  return true;
}

function uniqueUsefulTerms(terms = [], limit = 45) {
  const result = [];
  const seen = new Set();

  for (const rawTerm of terms) {
    const term = normalizeTerm(rawTerm);
    const key = term.toLowerCase();

    if (!isUsefulGmailTerm(term) || seen.has(key)) continue;

    result.push(term);
    seen.add(key);

    if (result.length >= limit) break;
  }

  return result;
}

async function loadEnabledRoleProfiles() {
  const roleProfiles = await readJson(ROLE_PROFILES_FILE, []);

  return Array.isArray(roleProfiles)
    ? roleProfiles.filter((profile) => profile && profile.enabled !== false)
    : [];
}

async function loadKeywordQueries() {
  const keywords = await readJson(KEYWORDS_FILE, { queries: [] });
  return Array.isArray(keywords?.queries) ? keywords.queries : [];
}

function collectRoleTerms(roleProfiles = [], keywordQueries = []) {
  const roleTerms = [];

  for (const profile of roleProfiles) {
    roleTerms.push(profile.name, profile.roleType, profile.roleFamily);
    roleTerms.push(...(profile.queries || []));
    roleTerms.push(...(profile.positivePatterns || []));
  }

  roleTerms.push(...keywordQueries);

  const GMAIL_EXCLUDED_TARGET_TERM_PATTERN =
    /^(developer|software developer|full stack|fullstack|frontend|front end|backend|back end|react developer|node developer|node\\.js developer|\\.net developer)$/i;

  return uniqueUsefulTerms([...DEFAULT_TARGET_TERMS, ...roleTerms]).filter(
    (term) => !GMAIL_EXCLUDED_TARGET_TERM_PATTERN.test(String(term || "").trim()),
  );
}

function normalizeGmailLabelName(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200e\u200f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim()
    .toLowerCase();
}

async function findGmailLabelIdByName(
  gmail,
  labelName = DEFAULT_GMAIL_JOB_LABEL_NAME,
) {
  const wantedName = String(labelName || "").trim();
  if (!wantedName) return null;

  const response = await gmail.users.labels.list({
    userId: "me",
  });

  const labels = response.data.labels || [];

  const exactMatch = labels.find(
    (label) => String(label.name || "").trim() === wantedName,
  );

  if (exactMatch) return exactMatch.id;

  const normalizedWanted = normalizeGmailLabelName(wantedName);

  const normalizedMatch = labels.find(
    (label) => normalizeGmailLabelName(label.name) === normalizedWanted,
  );

  if (normalizedMatch) return normalizedMatch.id;

  const nestedLabelMatch = labels.find((label) => {
    const lastSegment = String(label.name || "")
      .split("/")
      .pop();
    return normalizeGmailLabelName(lastSegment) === normalizedWanted;
  });

  return nestedLabelMatch?.id || null;
}

async function buildGmailJobQuery({ days = DEFAULT_DAYS } = {}) {
  const trustedSenders = await getTrustedJobSenders();
  const senderQuery = trustedSenders
    .flatMap(trustedSenderToGmailQuery)
    .join(" OR ");

  return [
    `newer_than:${days}d`,
    `(${senderQuery || "from:alljob.co.il OR from:drushim.co.il"})`,
  ].join(" ");
}

function toSearchText(item = {}) {
  return [
    item.title,
    item.sender,
    item.snippet,
    item.bodyText,
    ...(item.links || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAnyPlainTerm(text = "", terms = []) {
  return terms
    .map(normalizeTerm)
    .filter((term) => term.length >= 2)
    .some((term) => new RegExp(escapeRegExp(term), "i").test(text));
}

function matchesEnabledRoleProfile(text = "", roleProfiles = []) {
  return roleProfiles.some((profile) => {
    if (!profile || profile.enabled === false) return false;

    const positives = [
      profile.name,
      ...(profile.positivePatterns || []),
    ].filter(Boolean);

    const negatives = profile.negativePatterns || [];

    const positiveMatch = hasAnyPlainTerm(text, positives);
    const negativeMatch = hasAnyPlainTerm(text, negatives);

    return positiveMatch && !negativeMatch;
  });
}

async function looksLikeJobMail(item = {}, trustedSenders = null) {
  const text = toSearchText(item);
  const senders = trustedSenders || (await getTrustedJobSenders());

  const trustedJobSender = senderTextMatchesTrustedSenders(text, senders);

  const jobAlertSignal =
    /job\s*alert|jobs?|hiring|career|careers|משרה|משרות|דרושים|דרוש|דרושה|קורות\s*חיים|מועמדות|apply|application|הצעות\s*עבודה|משרות\s*חדשות/i.test(
      text,
    );

  const obviousNonJob =
    /password\s*reset|security\s*alert|verification\s*code|קוד\s*אימות|חשבונית|receipt|invoice|billing|payment|תשלום/i.test(
      text,
    );

  return trustedJobSender && jobAlertSignal && !obviousNonJob;
}

function toImportedGmailJob(message = {}) {
  const headers = message.payload?.headers || [];
  const content = collectMessageContent(message.payload);
  const bodyText = cleanText(content.textParts.join(" "));
  const bodyHtml = content.htmlParts.join("\n");

  const subject = cleanText(getHeader(headers, "Subject")) || "מייל ללא כותרת";
  const from = cleanText(getHeader(headers, "From")) || "שולח לא ידוע";
  const headerDate = getHeader(headers, "Date");

  const internalDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null;

  const snippet = cleanText(message.snippet || bodyText.slice(0, 280));

  const links = uniqueLinks([
    ...content.links,
    ...extractLinksFromText(`${bodyText} ${snippet}`),
  ]);

  return {
    id: `gmail-${message.id}`,
    gmailMessageId: message.id,
    threadId: message.threadId,
    title: subject,
    sender: from,
    date: internalDate || headerDate || null,
    snippet,
    bodyText,
    bodyHtml,
    links,
    source: "Gmail",
    status: "review",
    importedAt: new Date().toISOString(),
  };
}

export async function importGmailJobEmails({
  days = DEFAULT_DAYS,
  maxResults = DEFAULT_MAX_RESULTS,
} = {}) {
  const gmail = await getAuthorizedGmailClient();

  if (!gmail) {
    return {
      connected: false,
      imported: [],
      total: 0,
      filteredOut: 0,
      scanned: 0,
      savedTotal: 0,
      query: null,
      labelName: DEFAULT_GMAIL_JOB_LABEL_NAME,
      labelId: null,
      labelFound: false,
    };
  }

  const query = await buildGmailJobQuery({ days });

  const safeMaxResults = Math.max(
    1,
    Math.min(Number(maxResults) || DEFAULT_MAX_RESULTS, 100),
  );

  const imported = [];
  let filteredOut = 0;
  let scanned = 0;

  const jobLabelName = DEFAULT_GMAIL_JOB_LABEL_NAME;
  const jobLabelId = await findGmailLabelIdByName(gmail, jobLabelName);

  if (!jobLabelId) {
    const existing = await readJson(GMAIL_IMPORTS_FILE, []);

    return {
      connected: true,
      imported,
      total: 0,
      filteredOut,
      scanned,
      savedTotal: Array.isArray(existing) ? Math.min(existing.length, 500) : 0,
      query,
      labelName: jobLabelName,
      labelId: null,
      labelFound: false,
      warning: `Gmail label not found: ${jobLabelName}`,
    };
  }

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    labelIds: [jobLabelId],
    maxResults: safeMaxResults,
  });

  const messages = listResponse.data.messages || [];
  scanned = messages.length;

  const trustedSenders = await getTrustedJobSenders();

  for (const item of messages) {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: item.id,
      format: "full",
    });

    const importedJob = toImportedGmailJob(response.data);

    if (await looksLikeJobMail(importedJob, trustedSenders)) {
      imported.push(importedJob);
    } else {
      filteredOut += 1;
    }
  }

  const existing = await readJson(GMAIL_IMPORTS_FILE, []);
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const item of imported) {
    byId.set(item.id, {
      ...byId.get(item.id),
      ...item,
    });
  }

  const merged = [...byId.values()].sort(
    (a, b) =>
      new Date(b.date || b.importedAt || 0) -
      new Date(a.date || a.importedAt || 0),
  );

  await writeJson(GMAIL_IMPORTS_FILE, merged.slice(0, 500));

  return {
    connected: true,
    imported,
    total: imported.length,
    filteredOut,
    scanned,
    savedTotal: Math.min(merged.length, 500),
    query,
    labelName: jobLabelName,
    labelId: jobLabelId,
    labelFound: true,
  };
}

export async function getImportedGmailJobs() {
  return readJson(GMAIL_IMPORTS_FILE, []);
}

