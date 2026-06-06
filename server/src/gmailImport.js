import { readJson, writeJson } from "./fileStore.js";
import { GMAIL_IMPORTS_FILE } from "./paths.js";
import { getAuthorizedGmailClient } from "./gmailAuth.js";

const DEFAULT_DAYS = Number.parseInt(process.env.GMAIL_IMPORT_DAYS || "14", 10);
const DEFAULT_MAX_RESULTS = Number.parseInt(
  process.env.GMAIL_IMPORT_MAX_RESULTS || "40",
  10,
);

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

function collectMessageContent(payload, result = { textParts: [], links: [] }) {
  if (!payload) return result;

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);

    if (payload.mimeType === "text/html") {
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

function uniqueLinks(links = []) {
  return [...new Set(links.map(cleanLink))]
    .filter((link) => /^https?:\/\//i.test(link))
    .filter((link) => !link.includes("mail.google.com"))
    .slice(0, 10);
}

function buildGmailJobQuery({ days = 14 } = {}) {
  const targetTerms = [
    '"QA"',
    '"Manual QA"',
    '"Junior QA"',
    '"בודק תוכנה"',
    '"בודקת תוכנה"',
    '"בדיקות תוכנה"',
    '"בודק/ת QA"',
    '"Data Entry"',
    '"Back Office"',
    '"בקרת מסמכים"',
    '"מידען"',
    '"מיישם מערכות"',
    '"מטמיע מערכות"',
  ];

  const trustedSenders = [
    "from:(alljob.co.il OR drushim.co.il OR jobmaster.co.il OR jobnet.co.il)",
  ];

  return [
    `newer_than:${days}d`,
    `(${trustedSenders.join(" OR ")})`,
    `(${targetTerms.join(" OR ")})`,
    '-("front end" OR frontend OR "full stack" OR fullstack OR backend OR "back end" OR developer OR "software engineer" OR senior)',
    '-("תל אביב" OR "רמת גן" OR "פתח תקווה" OR "בני ברק" OR "הוד השרון" OR "מרכז")',
    "-category:promotions",
  ].join(" ");
}

function looksLikeJobMail(item = {}) {
  const text = [item.title, item.sender, item.snippet].join(" ").toLowerCase();

  return /qa|manual qa|junior qa|בודק|בודקת|בדיקות|data entry|back office|בקרת\s*מסמכים|מידען|דרושים|משרה|משרות|job|jobs/i.test(
    text,
  );
}

function toImportedGmailJob(message = {}) {
  const headers = message.payload?.headers || [];
  const content = collectMessageContent(message.payload);
  const bodyText = cleanText(content.textParts.join(" "));

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
    links,
    source: "Gmail",
    status: "review",
    importedAt: new Date().toISOString(),
  };
}

function isRelevantImportedGmailJob(item = {}) {
  const text = [item.title, item.sender, item.snippet, ...(item.links || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasTargetRole =
    /qa|manual qa|junior qa|בודק|בודקת|בדיקות תוכנה|data entry|back office|בקרת\s*מסמכים|מידען|מיישם|מטמיע/i.test(
      text,
    );

  const hasGoodLocation =
    /חיפה|קריות|קריית|קרית|יקנעם|יוקנעם|צפון|נהריה|עכו|נשר|טירת\s*כרמל|כרמיאל/i.test(
      text,
    );

  const hasBadRole =
    /frontend|front end|fullstack|full stack|backend|back end|developer|software engineer|senior|ראש\s*צוות|מנהל|בכיר/i.test(
      text,
    );

  const hasBadLocation =
    /תל\s*אביב|רמת\s*גן|פתח\s*תקווה|בני\s*ברק|הוד\s*השרון|הרצליה|רעננה|כפר\s*סבא|ירושלים|מרכז/i.test(
      text,
    );

  const hasPhoneNoise =
    /מוקד|טלפוני|שירות\s*לקוחות|נציג|help\s*desk|support/i.test(text);

  return (
    hasTargetRole &&
    hasGoodLocation &&
    !hasBadRole &&
    !hasBadLocation &&
    !hasPhoneNoise
  );
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
      savedTotal: 0,
      query: null,
    };
  }

  const query = buildGmailJobQuery({ days });
  const safeMaxResults = Math.max(
    1,
    Math.min(Number(maxResults) || DEFAULT_MAX_RESULTS, 100),
  );

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: safeMaxResults,
  });

  const messages = listResponse.data.messages || [];
  const imported = [];

  for (const item of messages) {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: item.id,
      format: "full",
    });

    const importedJob = toImportedGmailJob(response.data);
    if (looksLikeJobMail(importedJob)) {
      imported.push(importedJob);
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
    savedTotal: Math.min(merged.length, 500),
    query,
  };
}

export async function getImportedGmailJobs() {
  return readJson(GMAIL_IMPORTS_FILE, []);
}
