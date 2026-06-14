import { chromium } from "playwright";

const MAX_RESULTS = Number(process.env.JOBMASTER_MAX_RESULTS || 40);
const GOTO_TIMEOUT_MS = Number(process.env.JOBMASTER_GOTO_TIMEOUT_MS || 30000);

function buildJobMasterSearchUrl(query) {
  const params = new URLSearchParams({ q: query });
  return `https://www.jobmaster.co.il/jobs/?${params.toString()}`;
}

function cleanText(text = "") {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/שלח|קורות חיים|הגש מועמדות|פתח משרה|פרטים נוספים|דרושים|JobMaster|ג'וב מאסטר|נגישות/i.test(line))
    .join(" · ")
    .replace(/לפני\s+\d+\s+(?:שעות|ימים|דקות)/g, "")
    .replace(/לפני\s+יום/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/(?:\s*·\s*){2,}/g, " · ")
    .trim();
}

function absoluteUrl(href = "") {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `https://www.jobmaster.co.il${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractJobId(link = "") {
  return (
    String(link).match(/(?:job|jobs)[^\d]*(\d{4,})/i)?.[1] ||
    String(link).match(/[?&](?:jobid|id|job)=([^&#]+)/i)?.[1] ||
    link
  );
}

function extractLocation(text = "") {
  const value = String(text || "");

  const good = value.match(
    /חיפה|קריות|קריית\s*אתא|יקנעם|יוקנעם|נשר|טירת\s*כרמל|עכו|נהריה|כרמיאל|צפון|אזור\s*הצפון|איזור\s*הצפון|חדרה|היברידי|מרחוק|remote/i,
  );

  if (good) return good[0];

  const bad = value.match(
    /תל\s*אביב|ירושלים|רמת\s*גן|פתח\s*תקווה|הרצליה|רעננה|כפר\s*סבא|חולון|לוד|באר\s*שבע|אשדוד|אשקלון|ראשון\s*לציון|מרכז|דרום/i,
  );

  return bad?.[0] || "";
}

function chooseTitle({ anchorText = "", cardText = "", href = "" }) {
  const candidates = [
    anchorText,
    ...String(cardText || "").split("·"),
  ]
    .map((part) => cleanText(part))
    .map((part) => part.replace(/^דרושים\s+/i, "").trim())
    .filter(Boolean)
    .filter((part) => part.length >= 4 && part.length <= 120)
    .filter((part) => !/שלח|קורות חיים|הגש מועמדות|פרטים נוספים|JobMaster|ג'וב מאסטר|נגישות|סוכן חכם|חיפוש/i.test(part));

  const useful = candidates.find((part) =>
    /qa|בודק|בודקת|בדיקות|תוכנה|system|tester|automation|מידע|מערכות|data|back office|בק אופיס|מסמכים/i.test(part),
  );

  return useful || candidates[0] || "";
}

async function gotoWithFallback(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
  } catch (error) {
    console.warn(`JobMaster domcontentloaded timeout, continuing: ${error.message}`);
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // JobMaster can keep connections open.
  }

  await page.waitForTimeout(1500);

  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
  } catch {
    // ignore
  }
}

export async function searchJobMaster({ query }) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  try {
    const page = await browser.newPage({
      locale: "he-IL",
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    });

    const url = buildJobMasterSearchUrl(query);
    console.log(`JobMaster searching: ${url}`);

    await gotoWithFallback(page, url);

    const results = await page.evaluate(() => {
      function clean(text = "") {
        return String(text || "")
          .replace(/\u00a0/g, " ")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !/שלח|קורות חיים|הגש מועמדות|פתח משרה|פרטים נוספים|דרושים|JobMaster|ג'וב מאסטר|נגישות/i.test(line))
          .join(" · ")
          .replace(/לפני\s+\d+\s+(?:שעות|ימים|דקות)/g, "")
          .replace(/לפני\s+יום/g, "")
          .replace(/\s{2,}/g, " ")
          .replace(/(?:\s*·\s*){2,}/g, " · ")
          .trim();
      }

      function pickCard(anchor) {
        return (
          anchor.closest("[data-testid*='job']") ||
          anchor.closest("[class*='job']") ||
          anchor.closest("[class*='Job']") ||
          anchor.closest("[class*='card']") ||
          anchor.closest("[class*='Card']") ||
          anchor.closest("article") ||
          anchor.closest("li") ||
          anchor.closest("section") ||
          anchor.closest("tr") ||
          anchor.closest("div")
        );
      }

      function pickTitle(anchor, cardText) {
        const card = pickCard(anchor);
        const heading =
          anchor.querySelector("h1,h2,h3,h4")?.innerText ||
          card?.querySelector("h1,h2,h3,h4")?.innerText ||
          "";

        const candidates = [
          heading,
          anchor.innerText,
          anchor.getAttribute("title"),
          anchor.getAttribute("aria-label"),
          ...String(cardText || "").split("·"),
        ]
          .map((part) => clean(part))
          .map((part) => part.replace(/^דרושים\s+/i, "").trim())
          .filter(Boolean)
          .filter((part) => part.length >= 4 && part.length <= 120)
          .filter((part) => !/שלח|קורות חיים|הגש מועמדות|פרטים נוספים|JobMaster|ג'וב מאסטר|נגישות|סוכן חכם|חיפוש/i.test(part));

        const useful = candidates.find((part) =>
          /qa|בודק|בודקת|בדיקות|תוכנה|system|tester|automation|מידע|מערכות|data|back office|בק אופיס|מסמכים/i.test(part),
        );

        return useful || candidates[0] || "";
      }

      return [...document.querySelectorAll("a[href]")]
        .map((a) => {
          const rawHref = a.getAttribute("href") || "";
          const href = a.href || "";

          const looksLikeJob =
            /\/jobs?\/|jobid=|jobid\/|\/job\//i.test(rawHref) ||
            /\/jobs?\/|jobid=|jobid\/|\/job\//i.test(href);

          if (!looksLikeJob) return null;
          if (/\/jobs\/?\?q=|search|javascript:|mailto:/i.test(rawHref)) return null;

          const card = pickCard(a);
          const description = clean(card?.innerText || a.innerText || "");
          const title = pickTitle(a, description);

          if (!title || !href) return null;

          return {
            title,
            link: href,
            description,
          };
        })
        .filter(Boolean);
    });

    const unique = [];
    const seen = new Set();

    for (const item of results) {
      const link = absoluteUrl(item.link);
      const key = extractJobId(link);
      if (seen.has(key)) continue;
      seen.add(key);

      const description = cleanText(item.description);
      unique.push({
        title: chooseTitle({ anchorText: item.title, cardText: description, href: link }),
        company: "",
        location: extractLocation(description),
        link,
        description,
      });
    }

    const finalResults = unique.filter((item) => item.title && item.link).slice(0, MAX_RESULTS);

    console.log("JobMaster matched job links:", finalResults.length);
    console.log(finalResults.map((item) => `${item.title} -> ${item.link}`).slice(0, 10));

    return finalResults;
  } finally {
    await browser.close();
  }
}
