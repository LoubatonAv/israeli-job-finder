import * as cheerio from "cheerio";

const ALLJOBS_BASE_URL = "https://www.alljobs.co.il";

const GOOD_LOCATION_WORDS = [
  "חיפה",
  "קריות",
  "יקנעם",
  "יוקנעם",
  "נשר",
  "טירת כרמל",
  "עכו",
  "נהריה",
  "כרמיאל",
  "צפון",
  "חיפה והקריות",
  "חיפה והצפון",
  "קרית ביאליק",
  "קריית ביאליק",
  "קרית אתא",
  "קריית אתא",
  "קרית מוצקין",
  "קריית מוצקין",
  "קרית ים",
  "קריית ים",
  "נתניה",
  "השרון",
  "רעננה",
  "פתח תקווה",
  "תל אביב",
  "מרכז",
  "אור יהודה",
  "קיסריה",
  "ראש העין",
  "לוד",
  "רמת גן",
  "חולון",
  "ראשון לציון",
];

const BAD_UI_LINES = [
  "הגש מועמדות",
  "הגשת מועמדות",
  "עדכון קורות החיים",
  "שמירת משרה",
  "ביטול שמירה",
  "מחיקת משרה",
  "ביטול מחיקה",
  "שלח לחבר",
  "שתף",
  "התחברות",
  "הרשמה",
  "משרות שלי",
  "חיפוש עבודה",
  "דרושים",
  "AllJobs",
  "לוח משרות",
  "משרות מומלצות",
  "משרות חמות",
  "מילות מפתח",
  "חיפוש מתקדם",
  "שאלות הכנה",
  "שכר",
  "מאמרים",
  "עוד...",
  "Image:",
  "VIP",
];

const BAD_TITLE_SIGNALS = [
  "מיקום המשרה",
  "סוג משרה",
  "דרישות",
  "תיאור התפקיד",
  "חיפוש",
  "לוח משרות",
  "משרות מומלצות",
  "מילות מפתח",
  "שאלות הכנה",
  "שכר",
  "מאמרים",
  "הגש מועמדות",
  "שלח קורות חיים",
];

function cleanText(text = "") {
  return String(text)
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !BAD_UI_LINES.some((bad) => line.includes(bad)))
    .join(" · ")
    .replace(/\s{2,}/g, " ")
    .replace(/·\s*·/g, "·")
    .trim();
}

function normalizeSpace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function absoluteUrl(href = "") {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `${ALLJOBS_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function buildAllJobsSearchUrls(query) {
  const encodedQuery = encodeURIComponent(query);

  const urls = [
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=&region=&type=&freetxt=${encodedQuery}`,

    // QA / בדיקות תוכנה
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=432&region=&type=`,
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=432&region=1&type=`,
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=1537&region=1&type=`,
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=491&page=1&position=431&region=&type=`,
  ];

  const lower = query.toLowerCase();

  if (
    lower.includes("qa") ||
    query.includes("בדיקות") ||
    query.includes("בודק") ||
    query.includes("בודקת") ||
    query.includes("תוכנה")
  ) {
    return urls;
  }

  return [urls[0]];
}

function looksLikeSearchPageLink(href = "") {
  const lower = href.toLowerCase();

  return (
    lower.includes("searchresultsguest.aspx") &&
    !lower.includes("jobid=") &&
    !lower.includes("jobid%3d")
  );
}

function looksLikeJobLink(href = "") {
  if (!href) return false;
  if (looksLikeSearchPageLink(href)) return false;

  const lower = href.toLowerCase();

  return (
    lower.includes("jobid=") ||
    lower.includes("jobid%3d") ||
    lower.includes("/job/") ||
    lower.includes("jobdetails") ||
    lower.includes("uploadsingle") ||
    lower.includes("jobmaster") ||
    lower.includes("checknum")
  );
}

function extractJobId(text = "") {
  const value = String(text);

  return (
    value.match(/[?&]jobid=(\d+)/i)?.[1] ||
    value.match(/jobid["'\s:=]+(\d+)/i)?.[1] ||
    value.match(/data-jobid=["']?(\d+)/i)?.[1] ||
    value.match(/data-job-id=["']?(\d+)/i)?.[1] ||
    ""
  );
}

function buildFallbackJobUrl(jobId) {
  if (!jobId) return "";

  return `${ALLJOBS_BASE_URL}/Search/UploadSingle.aspx?JobID=${jobId}`;
}

function cleanCompanyName(value = "") {
  const company = normalizeSpace(
    String(value)
      .replace(/^לעוד משרות ומידע על\s*/i, "")
      .replace(/^דרושים ב/i, "")
      .replace(/>$/g, "")
      .trim(),
  );

  const badCompanyValues = [
    "AllJobs",
    "alljobs",
    "Full Time",
    "Part Time",
    "משרה מלאה",
    "משרה חלקית",
    "כל התחומים >>",
    "טיפים וכתבות",
    "and",
  ];

  if (!company || badCompanyValues.includes(company)) {
    return "חברה חסויה";
  }

  if (
    company.includes("AllCourses") ||
    company.includes("קורסים אונליין") ||
    company.includes("טיפים וכתבות") ||
    company.includes("כל התחומים")
  ) {
    return "חברה חסויה";
  }

  return company.slice(0, 80);
}

function cleanLocationValue(value = "", fullText = "") {
  let location = normalizeSpace(value);

  location = location
    .replace(
      /(סוג\s*משרה:?|סוגמשרה:?|היקף\s*משרה:?|היקףמשרה:?|תיאור\s*התפקיד:?|דרישות:?|Requirements|Job\s*Type|Show\s*more).*$/i,
      "",
    )
    .replace(/סוג\s*משרה:?$/i, "")
    .replace(/סוגמשרה:?$/i, "")
    .replace(/[·|:]+$/g, "")
    .trim();

  location = location
    .replace("אור יהודהסוג משרה", "אור יהודה")
    .replace("קיסריהסוג משרה", "קיסריה")
    .trim();

  const englishAliases = [
    { pattern: /yokne'?am|yokneam|yokne'am illit/i, value: "יקנעם" },
    { pattern: /haifa/i, value: "חיפה" },
    { pattern: /krayot/i, value: "קריות" },
    { pattern: /airport city/i, value: "איירפורט סיטי" },
    { pattern: /tel aviv/i, value: "תל אביב" },
    { pattern: /ramat gan/i, value: "רמת גן" },
  ];

  const alias = englishAliases.find((item) => item.pattern.test(location));
  if (alias) return alias.value;

  const fromKnownWords = GOOD_LOCATION_WORDS.find((word) =>
    `${location} ${fullText}`.includes(word),
  );

  if (
    !location ||
    location.length > 35 ||
    /סוג\s*משרה|היקף\s*משרה|דרישות|Requirements|Show\s*more/i.test(location)
  ) {
    return fromKnownWords || "Israel";
  }

  return fromKnownWords || location;
}

function isBadAllJobsResult(item = {}) {
  const title = normalizeSpace(item.title || "");
  const company = normalizeSpace(item.company || "");
  const location = normalizeSpace(item.location || "");
  const link = String(item.link || "");
  const description = normalizeSpace(item.description || "");

  if (!title || title.length < 5) return true;

  if (
    title.includes("בדיקת זכאות") ||
    (title.includes("תוכנה") && title.length <= 8) ||
    title.includes("לעוד משרות ומידע") ||
    title.includes("כל התחומים") ||
    title.includes("טיפים וכתבות")
  ) {
    return true;
  }

  if (
    company.includes("AllCourses") ||
    company.includes("טיפים וכתבות") ||
    company.includes("כל התחומים")
  ) {
    return true;
  }

  if (
    location.length > 60 ||
    /דרישות|Requirements|Show\s*more/i.test(location)
  ) {
    return true;
  }

  // אם זה דף חיפוש ואין לנו בכלל טקסט משרה אמיתי — לפסול.
  // אבל לא לפסול רק בגלל שאין JobID, כי AllJobs לא תמיד נותן לינק נקי.
  if (looksLikeSearchPageLink(link) && description.length < 120) {
    return true;
  }

  if (!hasTargetRoleSignal(`${title} ${description}`)) {
    return true;
  }

  return false;
}

function scoreAllJobsCandidate(item = {}) {
  let score = 0;

  const link = String(item.link || "");
  const title = item.title || "";
  const description = item.description || "";

  if (/JobID=\d+/i.test(link)) score += 25;
  if (!looksLikeSearchPageLink(link)) score += 10;
  if (item.company && item.company !== "חברה חסויה") score += 6;
  if (item.location && item.location !== "Israel") score += 6;
  if (hasTargetRoleSignal(title)) score += 12;
  if (description.length >= 120) score += 5;
  if (description.length > 2500) score -= 5;

  if (isBadAllJobsResult(item)) score -= 100;

  return score;
}

function getAllJobsStableKey(item = {}) {
  const jobId = extractJobId(item.link || "");

  if (jobId) return `alljobs-jobid-${jobId}`;

  return [
    normalizeSpace(item.title || "").toLowerCase(),
    normalizeSpace(item.company || "").toLowerCase(),
    normalizeSpace(item.location || "").toLowerCase(),
  ]
    .filter(Boolean)
    .join("|");
}

function dedupeAllJobsResults(items = []) {
  const seen = new Map();

  for (const item of items) {
    if (isBadAllJobsResult(item)) continue;

    const key = getAllJobsStableKey(item);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, item);
      continue;
    }

    if (scoreAllJobsCandidate(item) > scoreAllJobsCandidate(existing)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()];
}

function extractLocation(text = "") {
  const locationLine =
    text.match(/מיקום המשרה:\s*([^·]+)/)?.[1] ||
    text.match(/Location:\s*([^·]+)/i)?.[1] ||
    "";

  const fromKnownWords = GOOD_LOCATION_WORDS.find((word) =>
    text.includes(word),
  );

  return normalizeSpace(locationLine || fromKnownWords || "Israel");
}

function extractCompany(text = "", title = "") {
  const companyLine =
    text.match(/שם החברה:\s*([^·]+)/)?.[1] ||
    text.match(/חברה:\s*([^·]+)/)?.[1] ||
    text.match(/דרושים ב([^·]+)/)?.[1] ||
    "";

  if (companyLine) {
    return cleanCompanyName(companyLine);
  }

  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  const titleIndex = parts.findIndex((part) => part.includes(title));

  if (titleIndex >= 0) {
    const maybeCompany = parts[titleIndex + 1];

    if (
      maybeCompany &&
      maybeCompany.length >= 2 &&
      maybeCompany.length <= 80 &&
      !maybeCompany.includes("מיקום המשרה") &&
      !maybeCompany.includes("סוג משרה") &&
      !maybeCompany.includes("דרישות") &&
      !maybeCompany.includes("תיאור")
    ) {
      return cleanCompanyName(maybeCompany);
    }
  }

  return "חברה חסויה";
}

function hasTargetRoleSignal(text = "") {
  const value = String(text).toLowerCase();

  return (
    value.includes("qa") ||
    value.includes("tester") ||
    value.includes("testing") ||
    value.includes("בודק") ||
    value.includes("בודקת") ||
    value.includes("בדיקות") ||
    value.includes("בדיק") ||
    value.includes("תוכנה") ||
    value.includes("אוטומציה") ||
    value.includes("automation") ||
    value.includes("web") ||
    value.includes("mobile") ||
    value.includes("data") ||
    value.includes("risk") ||
    value.includes("fraud") ||
    value.includes("מסמכים") ||
    value.includes("מערכות מידע") ||
    value.includes("מטמיע") ||
    value.includes("מיישם")
  );
}

function isBadTitle(text = "") {
  const value = normalizeSpace(text);

  if (value.length < 5 || value.length > 140) return true;
  if (/^\d+$/.test(value)) return true;
  if (/לפני\s+\d+/.test(value)) return true;

  return BAD_TITLE_SIGNALS.some((bad) => value.includes(bad));
}

function extractTitle(text = "", linkText = "") {
  const cleanLinkText = normalizeSpace(linkText);

  if (
    cleanLinkText &&
    !isBadTitle(cleanLinkText) &&
    hasTargetRoleSignal(cleanLinkText)
  ) {
    return cleanLinkText;
  }

  const explicitTitle =
    text.match(/שם המשרה:\s*([^·]+)/)?.[1] ||
    text.match(/תפקיד:\s*([^·]+)/)?.[1] ||
    "";

  if (explicitTitle && !isBadTitle(explicitTitle)) {
    return normalizeSpace(explicitTitle);
  }

  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  const candidateFromParts = parts.find((part) => {
    if (isBadTitle(part)) return false;
    return hasTargetRoleSignal(part);
  });

  return candidateFromParts || "";
}

function isProbablyRelevantToQuery(item, query) {
  const text =
    `${item.title} ${item.company} ${item.location} ${item.description}`.toLowerCase();
  const q = query.toLowerCase();

  if (
    q.includes("qa") ||
    query.includes("בדיקות") ||
    query.includes("בודק") ||
    query.includes("בודקת") ||
    query.includes("תוכנה")
  ) {
    return (
      text.includes("qa") ||
      text.includes("tester") ||
      text.includes("testing") ||
      text.includes("בדיק") ||
      text.includes("בודק") ||
      text.includes("בודקת") ||
      text.includes("תוכנה") ||
      text.includes("web") ||
      text.includes("mobile") ||
      text.includes("אוטומציה")
    );
  }

  return q
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .some((word) => text.includes(word));
}

function isLikelyPageNoise(text = "") {
  const value = String(text);

  if (value.length > 3500) return true;

  const noiseSignals = [
    "משרות מומלצות",
    "חיפוש מתקדם",
    "לוח משרות",
    "מילות מפתח",
    "דרושים לפי תחום",
    "דרושים לפי אזור",
    "AllJobs",
    "תנאי שימוש",
    "מדיניות פרטיות",
  ];

  const count = noiseSignals.filter((signal) => value.includes(signal)).length;

  return count >= 3;
}

function getBestCardForAnchor($, el) {
  const selectors = [
    "[data-jobid]",
    "[data-job-id]",
    "article",
    "li",
    "[class*='job']",
    "[class*='Job']",
    "[id*='job']",
    "[id*='Job']",
    "[class*='card']",
    "[class*='result']",
    "div",
  ];

  for (const selector of selectors) {
    const candidate = $(el).closest(selector);

    if (candidate.length) {
      const text = cleanText(candidate.text());

      if (text.length >= 40 && text.length <= 3500) {
        return candidate;
      }
    }
  }

  return $(el).parent();
}

function collectCandidateCards($) {
  const candidates = [];

  const selectors = [
    "[data-jobid]",
    "[data-job-id]",
    "article",
    "li",
    "[class*='job']",
    "[class*='Job']",
    "[id*='job']",
    "[id*='Job']",
    "[class*='result']",
  ];

  $(selectors.join(",")).each((_, el) => {
    const card = $(el);
    const description = cleanText(card.text());

    if (description.length < 60 || description.length > 3500) return;
    if (isLikelyPageNoise(description)) return;
    if (!hasTargetRoleSignal(description)) return;

    candidates.push(card);
  });

  return candidates;
}

function createJobFromCard($, card, searchUrl, query) {
  const linkEl = card
    .find("a[href]")
    .filter((_, a) => {
      const href = $(a).attr("href") || "";
      const text = cleanText($(a).text());

      return looksLikeJobLink(href) || hasTargetRoleSignal(text);
    })
    .first();

  const href = linkEl.attr("href") || "";
  const linkText = cleanText(linkEl.text());
  const cardHtml = card.html() || "";
  const cardText = cleanText(card.text());

  if (!cardText || cardText.length < 60) return null;
  if (isLikelyPageNoise(cardText)) return null;

  const title = extractTitle(cardText, linkText);
  if (!title) return null;

  const jobId = extractJobId(`${href} ${cardHtml} ${cardText}`);

  // עכשיו כשאנחנו יודעים ש-AllJobs כן מחזיר JobID,
  // לא שומרים יותר fallback של SearchResultsGuest.
  if (!jobId && !/[?&]JobID=\d+/i.test(href)) {
    return null;
  }

  const link = looksLikeJobLink(href)
    ? absoluteUrl(href)
    : buildFallbackJobUrl(jobId);

  if (!link || !/[?&]JobID=\d+/i.test(link)) {
    return null;
  }

  return {
    title,
    link,
    company: extractCompany(cardText, title),
    location: extractLocation(cardText),
    description: cardText,
    sourceQuery: query,
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`AllJobs HTTP ${response.status}`);
  }

  return response.text();
}

const ALLJOBS_MAX_PAGES =
  Number.parseInt(process.env.ALLJOBS_MAX_PAGES || "30", 10) || 30;

const ALLJOBS_MAX_RESULTS =
  Number.parseInt(process.env.ALLJOBS_MAX_RESULTS || "600", 10) || 600;

const ALLJOBS_PAGE_DELAY_MS =
  Number.parseInt(process.env.ALLJOBS_PAGE_DELAY_MS || "150", 10) || 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setAllJobsPage(url, page) {
  const parsed = new URL(url);
  parsed.searchParams.set("page", String(page));
  return parsed.toString();
}

export async function searchAllJobs({ query }) {
  const baseUrls = buildAllJobsSearchUrls(query);
  const allResults = [];
  const globalSeen = new Set();

  for (const baseUrl of baseUrls) {
    let emptyPagesInRow = 0;
    let noNewUniquePagesInRow = 0;

    for (let page = 1; page <= ALLJOBS_MAX_PAGES; page += 1) {
      const url = setAllJobsPage(baseUrl, page);

      try {
        console.log(`AllJobs searching page ${page}/${ALLJOBS_MAX_PAGES}: ${url}`);

        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const resultsFromPage = [];
        const seenOnPage = new Set();

        $("a[href]").each((_, el) => {
          const href = $(el).attr("href") || "";
          const linkText = cleanText($(el).text());

          if (!looksLikeJobLink(href) && !hasTargetRoleSignal(linkText)) return;

          const card = getBestCardForAnchor($, el);
          const job = createJobFromCard($, card, url, query);

          if (!job) return;

          const key = `${job.title}|${job.company}|${job.location}|${job.link}`;

          if (seenOnPage.has(key)) return;
          seenOnPage.add(key);

          resultsFromPage.push(job);
        });

        for (const card of collectCandidateCards($)) {
          const job = createJobFromCard($, card, url, query);

          if (!job) continue;

          const key = `${job.title}|${job.company}|${job.location}|${job.link}`;

          if (seenOnPage.has(key)) continue;
          seenOnPage.add(key);

          resultsFromPage.push(job);
        }

        if (resultsFromPage.length === 0) {
          const pageText = cleanText($("body").text());

          const chunks = pageText
            .split(/(?:לפני \d+ שעות|לפני \d+ ימים|לפני יום|לפני \d+ דקות)/)
            .map((chunk) => chunk.trim())
            .filter((chunk) => chunk.length > 100 && chunk.length < 2500)
            .filter((chunk) => !isLikelyPageNoise(chunk))
            .filter((chunk) => hasTargetRoleSignal(chunk));

          for (const chunk of chunks.slice(0, 20)) {
            const title = extractTitle(chunk, "");
            if (!title) continue;

            resultsFromPage.push({
              title,
              company: extractCompany(chunk, title),
              location: extractLocation(chunk),
              description: chunk,
              link: url,
              sourceQuery: query,
            });
          }
        }

        const relevantResults = resultsFromPage.filter((item) =>
          isProbablyRelevantToQuery(item, query),
        );

        let addedFromPage = 0;

        for (const item of relevantResults) {
          const key = getAllJobsStableKey(item);

          if (!key || globalSeen.has(key)) continue;

          globalSeen.add(key);
          allResults.push(item);
          addedFromPage += 1;

          if (allResults.length >= ALLJOBS_MAX_RESULTS) {
            console.log(
              `AllJobs reached max results limit: ${ALLJOBS_MAX_RESULTS}`,
            );
            break;
          }
        }

        console.log(
          `AllJobs matched from page ${page}: ${relevantResults.length}, new unique: ${addedFromPage}, total so far: ${allResults.length}`,
        );

        if (relevantResults.length === 0) {
          emptyPagesInRow += 1;
        } else {
          emptyPagesInRow = 0;
        }

        if (addedFromPage === 0) {
          noNewUniquePagesInRow += 1;
        } else {
          noNewUniquePagesInRow = 0;
        }

        if (emptyPagesInRow >= 2) {
          console.log("AllJobs stopping after 2 empty pages in a row");
          break;
        }

        if (noNewUniquePagesInRow >= 5) {
          console.log("AllJobs stopping after 5 pages with no new unique jobs");
          break;
        }

        if (allResults.length >= ALLJOBS_MAX_RESULTS) {
          break;
        }

        if (ALLJOBS_PAGE_DELAY_MS > 0) {
          await sleep(ALLJOBS_PAGE_DELAY_MS);
        }
      } catch (error) {
        console.warn(
          `Skipped AllJobs URL for "${query}" page ${page}: ${error.message}`,
        );
        emptyPagesInRow += 1;

        if (emptyPagesInRow >= 2) {
          break;
        }
      }
    }

    if (allResults.length >= ALLJOBS_MAX_RESULTS) {
      break;
    }
  }

  console.log("AllJobs before dedupe/filter:", allResults.length);

  if (allResults.length) {
    console.log(
      "AllJobs sample:",
      allResults.slice(0, 5).map((item) => ({
        title: item.title,
        company: item.company,
        location: item.location,
        link: item.link,
        fallback: item.allJobsFallbackLink || false,
      })),
    );
  }

  const unique = dedupeAllJobsResults(allResults);

  console.log("AllJobs matched job links:", unique.length);

  return unique.slice(0, ALLJOBS_MAX_RESULTS);
}

