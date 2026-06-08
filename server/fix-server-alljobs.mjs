import fs from "node:fs";
import path from "node:path";

const serverFile = path.join(process.cwd(), "src", "server.js");

const original = fs.readFileSync(serverFile, "utf8");

const backupFile = path.join(
  process.cwd(),
  "src",
  `server.backup-before-alljobs-fix-${new Date().toISOString().replace(/[:.]/g, "-")}.js`
);

fs.writeFileSync(backupFile, original, "utf8");

const startMarker = "function isAllJobsMail(mail = {}) {";
const endMarker = "async function importGmailJobsIntoMainList({";

const startIndex = original.indexOf(startMarker);
const endIndex = original.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
  throw new Error("Could not find AllJobs parser block markers in server.js");
}

const fixedParserBlock = String.raw`
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
    .replace(/^משרות עדכניות לפי תחומי החיפוש שלך.*?(?=דרוש|לחברה|QA|בודק|מפתח|Help\s*desk|V\s*V|$)/i, "")
    .replace(/^ברגעים אלו מעסיק העלה משרה חמה.*?(?=דרוש|לחברה|QA|בודק|מפתח|Help\s*desk|V\s*V|$)/i, "")
    .replace(/^עדכון על כל משרה חמה.*?(?=דרוש|לחברה|QA|בודק|מפתח|Help\s*desk|V\s*V|$)/i, "")
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
    const key = `${fields.title}|${fields.company}|${fields.location}|${url}`.toLowerCase();

    if (seen.has(key)) return;

    seen.add(key);
    jobs.push({ ...fields, url });
  });

  return jobs;
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

  const seen = new Set();

  return jobs.filter((job) => {
    const key = `${job.title}|${job.company}|${job.location}|${job.url}`.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
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

function parseGmailDigestJobs(mail = {}) {
  if (isAllJobsMail(mail)) {
    return parseAllJobsDigestJobs(mail);
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

`;

let next = original.slice(0, startIndex) + fixedParserBlock + "\n" + original.slice(endIndex);

const scoreOld = `    const originalRecommendation = scored.recommendation;
    const originalFitScore = Number(scored.fitScore || 0);`;

const scoreNew = `    const learningRejectedSimilarJob = (scored.warnings || []).some((warning) =>
      /בעבר פסלת|דומות נדחו/i.test(String(warning || "")),
    );

    if (learningRejectedSimilarJob) {
      scored.recommendation = "review";
      scored.fitScore = Math.min(Number(scored.fitScore || 0), 75);
    }

    const originalRecommendation = scored.recommendation;
    const originalFitScore = Number(scored.fitScore || 0);`;

if (!next.includes(scoreOld)) {
  throw new Error("Could not find scoring insertion point in server.js");
}

next = next.replace(scoreOld, scoreNew);

const mergeOld = `  const splitDigestMessageIds = new Set(
    scoredCandidates
      .filter((job) => job.gmailDigestSplit === true && job.gmailMessageId)
      .map((job) => job.gmailMessageId),
  );
  const jobsWithoutReplacedDigestSummaries = (Array.isArray(currentJobs) ? currentJobs : []).filter(
    (job) => !(job.gmailDigest === true && splitDigestMessageIds.has(job.gmailMessageId)),
  );

  const before = Array.isArray(currentJobs) ? currentJobs.length : 0;
  const merged = uniqueById([
    ...jobsWithoutReplacedDigestSummaries,
    ...scoredCandidates,
  ]);`;

const mergeNew = `  const handledStatuses = new Set([
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

    if (job.gmailDigest === true && splitDigestMessageIds.has(job.gmailMessageId)) {
      return false;
    }

    const isAllJobsGmail =
      job.source === "Gmail · AllJobs" ||
      job.gmailDigestProvider === "alljobs";

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
  ]);`;

if (!next.includes(mergeOld)) {
  throw new Error("Could not find merge replacement block in server.js");
}

next = next.replace(mergeOld, mergeNew);

fs.writeFileSync(serverFile, next, "utf8");

console.log(`Backup created: ${backupFile}`);
console.log(`Updated: ${serverFile}`);
