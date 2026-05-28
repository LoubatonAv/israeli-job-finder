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
  "צפון",
  "חיפה והקריות",
  "חיפה והצפון",
];

const BAD_UI_LINES = [
  "הגש מועמדות",
  "הגשת מועמדות",
  "עדכון קורות החיים",
  "שמירת משרה",
  "ביטול שמירה",
  "מחיקת משרה",
  "ביטול מחיקה",
  "שירות זה פתוח",
  "רכוש חבילת",
  "דיווח על תוכן",
  "שמך המלא",
  "מה השם שלך",
  "מייל",
  "תיאור",
  "שליחה",
  "סגור",
  "תודה על שיתוף הפעולה",
  "מודים לך",
  "המשרה נמחקה",
  "המשרה הוחזרה",
  "האם תרצה להסיר",
  "אירעה שגיאה",
  "לעוד משרות ומידע",
  "עוד...",
  "Image:",
  "VIP",
];

function cleanText(text = "") {
  return String(text)
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
    // General search page. AllJobs sometimes returns relevant text even without a strong query param.
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=&region=&type=&freetxt=${encodedQuery}`,

    // QA Software, all Israel.
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=432&region=&type=`,

    // QA Software, Haifa / north-ish.
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=432&region=1&type=`,

    // Software testing, Haifa / north-ish.
    `${ALLJOBS_BASE_URL}/SearchResultsGuest.aspx?city=&page=1&position=1537&region=1&type=`,

    // QA category in Haifa city.
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

function looksLikeJobLink(href = "") {
  const lower = href.toLowerCase();

  return (
    lower.includes("jobid=") ||
    lower.includes("position=") ||
    lower.includes("/job/") ||
    lower.includes("searchresultsguest.aspx")
  );
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
      !maybeCompany.includes("דרישות")
    ) {
      return maybeCompany;
    }
  }

  const companyAfterImage = parts.find((part) => part.startsWith("דרושים ב"));
  if (companyAfterImage) {
    return companyAfterImage.replace("דרושים ב", "").trim();
  }

  return "AllJobs";
}

function extractTitle(text = "", linkText = "") {
  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  const badTitleSignals = [
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
  ];

  const candidateFromParts = parts.find((part) => {
    if (part.length < 5 || part.length > 120) return false;
    if (badTitleSignals.some((bad) => part.includes(bad))) return false;
    if (/לפני\s+\d+/.test(part)) return false;
    if (/^\d+$/.test(part)) return false;

    return (
      part.includes("QA") ||
      part.includes("qa") ||
      part.includes("בודק") ||
      part.includes("בודקת") ||
      part.includes("בדיקות") ||
      part.includes("תוכנה") ||
      part.includes("Data") ||
      part.includes("Risk") ||
      part.includes("Fraud") ||
      part.includes("מסמכים")
    );
  });

  if (candidateFromParts) return candidateFromParts;

  const cleanLinkText = normalizeSpace(linkText);

  if (
    cleanLinkText.length >= 5 &&
    cleanLinkText.length <= 120 &&
    !badTitleSignals.some((bad) => cleanLinkText.includes(bad))
  ) {
    return cleanLinkText;
  }

  return "";
}

function isProbablyRelevantToQuery(item, query) {
  const text =
    `${item.title} ${item.company} ${item.location} ${item.description}`.toLowerCase();
  const q = query.toLowerCase();

  // For QA/software-testing queries, don't require exact Hebrew query match.
  if (
    q.includes("qa") ||
    query.includes("בדיקות") ||
    query.includes("בודק") ||
    query.includes("בודקת") ||
    query.includes("תוכנה")
  ) {
    return (
      text.includes("qa") ||
      text.includes("בדיק") ||
      text.includes("בודק") ||
      text.includes("בודקת") ||
      text.includes("תוכנה")
    );
  }

  return q
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .some((word) => text.includes(word));
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

export async function searchAllJobs({ query }) {
  const urls = buildAllJobsSearchUrls(query);
  const allResults = [];

  for (const url of urls) {
    try {
      console.log(`AllJobs searching: ${url}`);

      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      const resultsFromPage = [];
      const seenOnPage = new Set();

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        const link = absoluteUrl(href);
        const linkText = cleanText($(el).text());

        if (!looksLikeJobLink(href)) return;

        const card =
          $(el).closest("article") ||
          $(el).closest("li") ||
          $(el).closest("[class*='job']") ||
          $(el).closest("[class*='Job']") ||
          $(el).closest("[class*='card']") ||
          $(el).closest("div");

        const description = cleanText(card.text());
        if (!description || description.length < 40) return;

        const title = extractTitle(description, linkText);
        if (!title) return;

        const jobKey = `${title}|${link}`;
        if (seenOnPage.has(jobKey)) return;
        seenOnPage.add(jobKey);

        const location = extractLocation(description);
        const company = extractCompany(description, title);

        resultsFromPage.push({
          title,
          company,
          location,
          description,
          link,
        });
      });

      // Fallback: AllJobs search result pages often include the job text in the HTML body
      // even when anchors are not easy to classify.
      if (resultsFromPage.length === 0) {
        const pageText = cleanText($("body").text());
        const chunks = pageText
          .split(/(?:לפני \d+ שעות|לפני \d+ ימים|לפני יום|לפני \d+ דקות)/)
          .map((chunk) => chunk.trim())
          .filter((chunk) => chunk.length > 80);

        for (const chunk of chunks.slice(0, 20)) {
          const title = extractTitle(chunk, "");
          if (!title) continue;

          resultsFromPage.push({
            title,
            company: extractCompany(chunk, title),
            location: extractLocation(chunk),
            description: chunk,
            link: url,
          });
        }
      }

      const relevantResults = resultsFromPage.filter((item) =>
        isProbablyRelevantToQuery(item, query),
      );

      allResults.push(...relevantResults);
      console.log(`AllJobs matched from page: ${relevantResults.length}`);
    } catch (error) {
      console.warn(`Skipped AllJobs URL for "${query}": ${error.message}`);
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of allResults) {
    const key = `${item.title}|${item.company}|${item.location}|${item.link}`;

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  console.log("AllJobs matched job links:", unique.length);

  return unique.slice(0, 30);
}
