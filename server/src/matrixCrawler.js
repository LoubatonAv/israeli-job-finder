import * as cheerio from "cheerio";

const MATRIX_BASE_URL = "https://www.matrix.co.il";

const BAD_UI_LINES = [
  "פרטי המשרה",
  "שליחת קורות חיים",
  "הגש מועמדות",
  "חיפוש משרות",
  "משרות חמות",
  "כל הזכויות שמורות",
  "מדיניות פרטיות",
  "צור קשר",
  "קרא עוד",
  "לתפקיד הבא",
  "לתפקיד הקודם",
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

function absoluteUrl(href = "") {
  if (!href) return MATRIX_BASE_URL;

  if (href.startsWith("http")) return href;

  return `${MATRIX_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function buildMatrixSearchUrls(query) {
  const encodedQuery = encodeURIComponent(query);

  return [
    `${MATRIX_BASE_URL}/jobs/?search=${encodedQuery}`,
    `${MATRIX_BASE_URL}/jobs/`,
  ];
}

function looksRelevantToQuery(item, query) {
  const text = [item.title, item.company, item.location, item.description]
    .join(" ")
    .toLowerCase();

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
      text.includes("בדיק") ||
      text.includes("בודק") ||
      text.includes("בודקת") ||
      text.includes("תוכנה") ||
      text.includes("איכות")
    );
  }

  if (
    query.includes("מידען") ||
    query.includes("מסמכים") ||
    q.includes("document")
  ) {
    return (
      text.includes("מידען") ||
      text.includes("מסמכים") ||
      text.includes("document") ||
      text.includes("plm")
    );
  }

  if (q.includes("data")) {
    return text.includes("data") || text.includes("נתונים");
  }

  return q
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .some((word) => text.includes(word));
}

function extractLocation(text = "") {
  const knownLocations = [
    "חיפה",
    "קריות",
    "יקנעם",
    "יוקנעם",
    "נשר",
    "טירת כרמל",
    "עכו",
    "צפון",
    "מרכז",
    "תל אביב",
    "רמת גן",
    "פתח תקווה",
    "ירושלים",
    "רחובות",
    "לוד",
  ];

  return knownLocations.find((location) => text.includes(location)) || "Israel";
}

function extractTitle(text = "", linkText = "") {
  const cleanLinkText = cleanText(linkText);

  if (
    cleanLinkText &&
    cleanLinkText.length >= 4 &&
    cleanLinkText.length <= 120 &&
    !BAD_UI_LINES.some((bad) => cleanLinkText.includes(bad))
  ) {
    return cleanLinkText;
  }

  const parts = cleanText(text)
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    parts.find((part) => {
      if (part.length < 4 || part.length > 120) return false;
      if (BAD_UI_LINES.some((bad) => part.includes(bad))) return false;

      return (
        part.includes("QA") ||
        part.includes("בודק") ||
        part.includes("בודקת") ||
        part.includes("בדיקות") ||
        part.includes("Data") ||
        part.includes("מידען") ||
        part.includes("מסמכים") ||
        part.includes("System") ||
        part.includes("סיסטם")
      );
    }) || ""
  );
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
    throw new Error(`Matrix HTTP ${response.status}`);
  }

  return response.text();
}

export async function searchMatrix({ query }) {
  const urls = buildMatrixSearchUrls(query);
  const allResults = [];

  for (const url of urls) {
    try {
      console.log(`Matrix searching: ${url}`);

      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      const pageResults = [];
      const seenOnPage = new Set();

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        const link = absoluteUrl(href);
        const linkText = cleanText($(el).text());

        if (!link.includes("/jobs/")) return;
        if (link === `${MATRIX_BASE_URL}/jobs/`) return;

        const card =
          $(el).closest("article") ||
          $(el).closest("li") ||
          $(el).closest("[class*='job']") ||
          $(el).closest("[class*='Job']") ||
          $(el).closest("[class*='card']") ||
          $(el).closest("div");

        const description = cleanText(card.text());

        if (!description || description.length < 30) return;

        const title = extractTitle(description, linkText);
        if (!title) return;

        const key = `${title}|${link}`;
        if (seenOnPage.has(key)) return;
        seenOnPage.add(key);

        pageResults.push({
          title,
          company: "Matrix",
          location: extractLocation(description),
          description,
          link,
        });
      });

      const relevant = pageResults.filter((item) =>
        looksRelevantToQuery(item, query),
      );

      allResults.push(...relevant);

      console.log(`Matrix matched from page: ${relevant.length}`);
    } catch (error) {
      console.warn(`Skipped Matrix URL for "${query}": ${error.message}`);
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of allResults) {
    const key = `${item.title}|${item.link}`;

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  console.log("Matrix matched job links:", unique.length);

  return unique.slice(0, 30);
}
