export function isLikelyPageDump(job = {}) {
  const description = String(job.description || "");
  const title = String(job.title || "").trim();

  if (description.length > 12000) return true;

  const pageDumpSignals = [
    "#backOverlay",
    "SearchResultsPopUp",
    "DisplayBnrOpenXScript",
    "google_tag_params",
    "googletagmanager",
    "lpTag",
    "דלג לתוכן ראשי",
    "כל הזכויות שמורות",
  ];

  const signalCount = pageDumpSignals.filter((signal) =>
    description.includes(signal),
  ).length;

  if (signalCount >= 2) return true;

  const genericTitles = ["אבטחת איכות QA", "תוכנה", "QA תוכנה", "בדיקות תוכנה"];

  if (genericTitles.includes(title) && description.length > 3000) {
    return true;
  }

  return false;
}

export function isLikelySearchOrCategoryPage(job = {}) {
  const title = String(job.title || "").trim();
  const company = String(job.company || "").trim();
  const description = String(job.description || "").trim();
  const source = String(job.source || "").trim();
  const url = String(job.url || "");

  const cityCategoryTitle = /^דרושים\s+[\u0590-\u05FF\s'"-]+$/i.test(title);

  if (source === "JobMaster" && cityCategoryTitle) {
    return true;
  }

  if (
    source === "JobMaster" &&
    company === "JobMaster" &&
    description === title
  ) {
    return true;
  }

  if (
    source === "JobMaster" &&
    !/\/jobs\/checknum\.asp/i.test(url) &&
    cityCategoryTitle
  ) {
    return true;
  }

  return false;
}

export function isLikelyJobMasterNoise(job = {}) {
  const title = String(job.title || "").trim();
  const description = String(job.description || "").trim();
  const company = String(job.company || "").trim();
  const source = String(job.source || "").trim();

  if (source !== "JobMaster") return false;

  const genericTitles = [
    "משרות נוספות",
    "משרות דומות",
    "הגש מועמדות",
    "שמור למועדפים",
    "דרושים",
  ];

  if (genericTitles.includes(title)) {
    return true;
  }

  if (
    title === "משרות נוספות" ||
    description === "משרות נוספות" ||
    description.includes("הגש מועמדות שמור למועדפים משרות נוספות")
  ) {
    return true;
  }

  if (
    company === "JobMaster" &&
    /^(הגש מועמדות|שמור למועדפים|משרות נוספות|\s*)$/i.test(description)
  ) {
    return true;
  }

  const weakJobMasterDescription =
    description.length < 80 &&
    /^(פורסם לפני|ע"י|הגש מועמדות|שמור למועדפים|משרות נוספות)/.test(
      description,
    );

  if (weakJobMasterDescription) {
    return true;
  }

  return false;
}

export function shouldSkipBadJob(job = {}) {
  return (
    isLikelyPageDump(job) ||
    isLikelySearchOrCategoryPage(job) ||
    isLikelyJobMasterNoise(job)
  );
}
