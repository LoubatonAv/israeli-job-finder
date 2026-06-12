import { chromium } from "playwright";

function cleanGoogleUrl(href = "") {
  try {
    const url = new URL(href);

    if (url.pathname === "/url") {
      return url.searchParams.get("q") || href;
    }

    return href;
  } catch {
    return href;
  }
}

export async function searchWithPlaywright({ query }) {
  const browser = await chromium.launch({
    headless: String(process.env.PLAYWRIGHT_HEADLESS || "true").toLowerCase() !== "false",
  });

  const page = await browser.newPage({
    locale: "he-IL",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  });

  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=he&gl=il`;

  console.log(`Playwright searching: ${query}`);

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: Number.parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS || "15000", 10),
  });

  await page.waitForTimeout(Number.parseInt(process.env.PLAYWRIGHT_WAIT_MS || "800", 10));

  const results = await page.evaluate(() => {
    return [...document.querySelectorAll("a")]
      .map((a) => {
        const h3 = a.querySelector("h3");
        const title = h3?.innerText?.trim() || a.innerText?.trim();
        const href = a.href;

        if (!href || !title) return null;

        return {
          title,
          link: href,
        };
      })
      .filter(Boolean);
  });

  await browser.close();

  const cleaned = results
    .map((item) => ({
      ...item,
      link: cleanGoogleUrl(item.link),
    }))
    .filter((item) => {
      return (
        item.link.includes("drushim.co.il") ||
        item.link.includes("alljobs.co.il") ||
        item.link.includes("comeet.com/jobs") ||
        item.link.includes("jobs.lever.co") ||
        item.link.includes("greenhouse.io")
      );
    })
    .slice(0, 10);

  console.log("Playwright raw results:", results.length);
  console.log("Playwright filtered results:", cleaned.length);
  console.log(cleaned.map((item) => item.link));

  return cleaned;
}
