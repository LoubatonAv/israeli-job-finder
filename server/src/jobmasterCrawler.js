import * as cheerio from "cheerio";

const MAX_RESULTS = Number(process.env.JOBMASTER_MAX_RESULTS || 40);

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
    .filter((line) => !/שלח|קורות חיים|הגש מועמדות|פתח משרה|פרטים נוספים|JobMaster|ג'וב מאסטר|נגישות|סוכן חכם/i.test(line))
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
  return String(link).match(/checknum\.asp\?key=(\d+)/i)?.[1] || link;
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
    .filter((part) => part.length >= 4 && part.length <= 130)
    .filter((part) => !/שלח|קורות חיים|הגש מועמדות|פרטים נוספים|JobMaster|ג'וב מאסטר|נגישות|סוכן חכם|חיפוש/i.test(part));

  const useful = candidates.find((part) => /qa|בודק|בודקת|בדיקות|תוכנה|system|tester|automation|אוטומציה|מידע|מערכות|data|back office|בק אופיס|מסמכים/i.test(part));
  return useful || candidates[0] || "";
}

export async function searchJobMaster({ query }) {
  const url = buildJobMasterSearchUrl(query);
  console.log(`JobMaster searching: ${url}`);

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!response.ok) {
    throw new Error(`JobMaster HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!/checknum\.asp\?key=\d+/i.test(href)) return;

    const link = absoluteUrl(href);
    const key = extractJobId(link);
    if (seen.has(key)) return;
    seen.add(key);

    const card = $(el).closest("article, li, tr, [class*='job'], [class*='Job'], [class*='card'], [class*='Card'], div");
    const fullText = cleanText(card.text() || $(el).text());
    const title = chooseTitle({ anchorText: $(el).text(), cardText: fullText });
    if (!title) return;

    results.push({
      title,
      company: "",
      location: extractLocation(fullText),
      link,
      description: fullText,
    });
  });

  const finalResults = results.slice(0, MAX_RESULTS);
  console.log("JobMaster matched job links:", finalResults.length);
  console.log(finalResults.map((item) => `${item.title} -> ${item.link}`).slice(0, 10));
  return finalResults;
}
