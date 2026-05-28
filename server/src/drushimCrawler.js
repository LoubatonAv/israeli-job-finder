import { chromium } from "playwright";

const BAD_LOCATION_WORDS = [
  "ירושלים",
  "תל אביב",
  "רמת גן",
  "פתח תקווה",
  "הרצליה",
  "רעננה",
  "כפר סבא",
  "חולון",
  "לוד",
  "באר שבע",
  "אשדוד",
  "אשקלון",
  "מרכז",
  "דרום",
];

function buildDrushimSearchUrl(query) {
  return `https://www.drushim.co.il/jobs/search/${encodeURIComponent(query)}/`;
}

export async function searchDrushim({ query }) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  const page = await browser.newPage({
    locale: "he-IL",
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  });

  const url = buildDrushimSearchUrl(query);
  console.log(`Drushim searching: ${url}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(5000);

  console.log("Drushim page title:", await page.title());
  console.log("Drushim current url:", page.url());

  const results = await page.evaluate((badLocationWords) => {
    const anchors = [...document.querySelectorAll("a[href]")];

    function cleanText(text = "") {
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.includes("פתח משרה"))
        .filter((line) => !line.includes("נפתח בכרטיסיה"))
        .filter((line) => !line.includes("שלח/י קורות חיים"))
        .filter((line) => !line.includes("לצפייה בפרטי המשרה"))
        .filter((line) => !line.includes("נגישות"))
        .filter((line) => !line.includes("סרגל הכלים"))
        .filter((line) => !line.includes("TAP"))
        .join(" · ")
        .replace(/לפני \d+ שעות?/g, "")
        .replace(/לפני יום/g, "")
        .replace(/משרה מלאה/g, "")
        .replace(/מספר מקומות/g, "")
        .replace(/\+\s*/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/·\s*·/g, "·")
        .trim();
    }

    function extractTitle(description) {
      const badTitleParts = [
        "פתח משרה",
        "נפתח בכרטיסיה",
        "שלח/י קורות חיים",
        "לצפייה בפרטי המשרה",
      ];

      const parts = description
        .split("·")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => !badTitleParts.some((bad) => part.includes(bad)));

      return (
        parts.find(
          (part) =>
            part.length > 5 &&
            part.length < 90 &&
            !part.includes("שנים") &&
            !part.includes("משרה") &&
            !part.includes("לפני"),
        ) || ""
      );
    }

    return anchors
      .map((a) => {
        const rawHref = a.getAttribute("href") || "";
        const href = a.href || "";

        if (!rawHref.includes("/job/") && !href.includes("/job/")) return null;
        if (rawHref.includes("#") || href.includes("#")) return null;

        const card =
          a.closest("[class*='job']") ||
          a.closest("[class*='Job']") ||
          a.closest("[class*='card']") ||
          a.closest("[class*='Card']") ||
          a.closest("li") ||
          a.closest("article") ||
          a.closest("div");

        const description = cleanText(card?.innerText || "");
        const fallbackTitle =
          a.innerText?.trim() ||
          a.getAttribute("title") ||
          a.getAttribute("aria-label") ||
          "";

        const title = extractTitle(description);

        return {
          title,
          link: href,
          description,
        };
      })
      .filter(Boolean)
      .filter((item) => item.title)
      .filter((item) => item.title !== "משרה מדרושים")
      .filter(
        (item) =>
          !badLocationWords.some((word) =>
            `${item.title} ${item.description}`.includes(word),
          ),
      )
      .slice(0, 30);
  }, BAD_LOCATION_WORDS);

  await browser.close();

  const unique = [];
  const seen = new Set();

  for (const item of results) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    unique.push(item);
  }

  console.log("Drushim matched job links:", unique.length);
  console.log(
    unique.map((item) => `${item.title} -> ${item.link}`).slice(0, 10),
  );

  return unique;
}
