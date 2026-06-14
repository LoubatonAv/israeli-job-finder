import { chromium } from "playwright";

const MAX_RESULTS = Number(process.env.DRUSHIM_MAX_RESULTS || 40);
const GOTO_TIMEOUT_MS = Number(process.env.DRUSHIM_GOTO_TIMEOUT_MS || 30000);

function buildDrushimSearchUrl(query) {
  return `https://www.drushim.co.il/jobs/search/${encodeURIComponent(query)}/`;
}

function cleanText(text = "") {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/פתח משרה|נפתח בכרטיסיה|שלח\/י קורות חיים|צפייה בפרטי|נגישות|סרגל הכלים|TAP/i.test(line))
    .join(" · ")
    .replace(/לפני\s+\d+\s+(?:שעות|ימים|דקות)/g, "")
    .replace(/לפני\s+יום/g, "")
    .replace(/משרה\s+מלאה/g, "")
    .replace(/מספר\s+מקומות/g, "")
    .replace(/\+\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/(?:\s*·\s*){2,}/g, " · ")
    .trim();
}

function absoluteUrl(href = "") {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `https://www.drushim.co.il${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractJobId(link = "") {
  return String(link).match(/\/job\/([^/?#]+)/i)?.[1] || link;
}

function extractLocation(text = "") {
  const value = String(text || "");
  const good = value.match(/חיפה|קריות|קריית\s*אתא|יקנעם|יוקנעם|נשר|טירת\s*כרמל|עכו|נהריה|כרמיאל|צפון|אזור\s*הצפון|איזור\s*הצפון|חדרה|היברידי|מרחוק|remote/i);
  if (good) return good[0];
  const bad = value.match(/תל\s*אביב|ירושלים|רמת\s*גן|פתח\s*תקווה|הרצליה|רעננה|כפר\s*סבא|חולון|לוד|באר\s*שבע|אשדוד|אשקלון|ראשון\s*לציון|מרכז|דרום/i);
  return bad?.[0] || "";
}

function chooseTitle({ anchorText = "", cardText = "" }) {
  const candidates = [anchorText, ...String(cardText || "").split("·")]
    .map((part) => cleanText(part))
    .map((part) => part.replace(/^דרושים\s+/i, "").trim())
    .filter(Boolean)
    .filter((part) => part.length >= 4 && part.length <= 120)
    .filter((part) => !/פתח משרה|שלח\/י|צפייה|לפני|משרה מלאה|מספר משרות|דרושים IL|נגישות/i.test(part));

  const useful = candidates.find((part) => /qa|בודק|בודקת|בדיקות|תוכנה|tester|test|automation|אוטומציה|מערכות|מידע|data|מסמכים|V&V/i.test(part));
  return useful || candidates[0] || "";
}

async function gotoWithFallback(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
  } catch (error) {
    console.warn(`Drushim domcontentloaded timeout, continuing: ${error.message}`);
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // Drushim sometimes keeps connections open. That is fine.
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

export async function searchDrushim({ query }) {
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

    const url = buildDrushimSearchUrl(query);
    console.log(`Drushim searching: ${url}`);
    await gotoWithFallback(page, url);

    console.log("Drushim page title:", await page.title());
    console.log("Drushim current url:", page.url());

    const results = await page.evaluate(() => {
      function clean(text = "") {
        return String(text || "")
          .replace(/\u00a0/g, " ")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !/פתח משרה|נפתח בכרטיסיה|שלח\/י קורות חיים|צפייה בפרטי|נגישות|סרגל הכלים|TAP/i.test(line))
          .join(" · ")
          .replace(/לפני\s+\d+\s+(?:שעות|ימים|דקות)/g, "")
          .replace(/לפני\s+יום/g, "")
          .replace(/משרה\s+מלאה/g, "")
          .replace(/מספר\s+מקומות/g, "")
          .replace(/\+\s*/g, "")
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
          .filter((part) => !/פתח משרה|שלח\/י|צפייה|לפני|משרה מלאה|מספר משרות|דרושים IL|נגישות/i.test(part));

        const useful = candidates.find((part) => /qa|בודק|בודקת|בדיקות|תוכנה|tester|test|automation|אוטומציה|מערכות|מידע|data|מסמכים|V&V/i.test(part));
        return useful || candidates[0] || "";
      }

      return [...document.querySelectorAll("a[href]")]
        .map((a) => {
          const rawHref = a.getAttribute("href") || "";
          const href = a.href || "";
          if (!rawHref.includes("/job/") && !href.includes("/job/")) return null;
          if (rawHref.includes("#") || href.includes("#")) return null;
          const card = pickCard(a);
          const description = clean(card?.innerText || a.innerText || "");
          const title = pickTitle(a, description);
          if (!title || !href) return null;
          return { title, link: href, description };
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
        title: chooseTitle({ anchorText: item.title, cardText: description }),
        company: "",
        location: extractLocation(description),
        link,
        description,
      });
    }

    const finalResults = unique.filter((item) => item.title && item.link).slice(0, MAX_RESULTS);
    console.log("Drushim matched job links:", finalResults.length);
    console.log(finalResults.map((item) => `${item.title} -> ${item.link}`).slice(0, 10));
    return finalResults;
  } finally {
    await browser.close();
  }
}
