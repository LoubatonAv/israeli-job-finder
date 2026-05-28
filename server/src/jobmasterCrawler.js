import * as cheerio from "cheerio";

function buildJobMasterSearchUrl(query) {
  const params = new URLSearchParams({ q: query });
  return `https://www.jobmaster.co.il/jobs/?${params.toString()}`;
}

function cleanText(text = "") {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function searchJobMaster({ query }) {
  const url = buildJobMasterSearchUrl(query);
  console.log(`JobMaster searching: ${url}`);

  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
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
    const text = cleanText($(el).text());

    if (!href.includes("/jobs/") && !href.includes("/job/")) return;
    if (href.includes("?q=")) return;
    if (!text || text.length < 4 || text.length > 120) return;

    const link = href.startsWith("http")
      ? href
      : `https://www.jobmaster.co.il${href.startsWith("/") ? "" : "/"}${href}`;

    if (seen.has(link)) return;
    seen.add(link);

    const card = $(el).closest("article, li, div");
    const description = cleanText(card.text());

    const fullText = cleanText(card.text());

    const locationMatch = fullText.match(/חיפה|קריות|יקנעם|נשר|טירת כרמל|עכו/i);

    const negativeLocationMatch = fullText.match(
      /תל אביב|בני ברק|פתח תקווה|רעננה|כפר סבא|הרצליה|ירושלים|ראשון לציון/i,
    );

    results.push({
      title: text,
      link,
      description: fullText,
      location: locationMatch?.[0] || negativeLocationMatch?.[0] || "",
    });
  });

  console.log("JobMaster matched job links:", results.length);

  return results.slice(0, 30);
}
