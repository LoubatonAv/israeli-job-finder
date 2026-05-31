import { normalizeText } from "./utils.js";
import { getLearningAdjustment } from "./learning.js";

const HARD_EXCLUDE_REGEX = [
  /(?:^|\s)שירות(?:\s+לקוחות)?(?:\s|$|–|-)/i,
  /נציג(?:\/ת|י|ים|ות|י\/ות)?/i,
  /מוקד|טלפוני|שיחות/i,
  /מכירות|sales/i,
  /משמרות|לילות|סופי\s*שבוע|שבת|חגים|כוננות|24\/7/i,
  /תיירות|חופשות|נופש|סוכני(?:\/ות)?\s*תיירות/i,
  /רווחים\s*גבוהים|הכנסה\s*גבוהה/i,
  /פנה(?:\/י)?\s*ללא\s*קו[״"]?ח/i,
];

const GOOD_LOCATION_KEYS = new Set([
  "haifa",
  "krayot",
  "yokneam",
  "karmiel",
  "nahariya",
  "acre",
  "north",
  "remote",
]);

const BAD_LOCATION_KEYS = new Set([
  "tel_aviv",
  "jerusalem",
  "center",
  "beer_sheva",
  "ashdod",
  "ashkelon",
  "holon",
  "rishon_lezion",
  "netanya",
  "petah_tikva",
  "raanana",
]);

function findRegexMatches(text, regexList = []) {
  return regexList
    .filter((regex) => regex.test(text))
    .map((regex) => regex.toString());
}

function findMatches(text, words = []) {
  const normalized = normalizeText(text);

  return words
    .filter(Boolean)
    .map((word) => String(word).trim())
    .filter((word) => {
      if (!word) return false;

      const clean = word.replace(/[^\p{L}\p{N}+#.-]/gu, "");

      const isAsciiOnly = /^[a-z0-9\s.+#-]+$/i.test(clean);
      if (isAsciiOnly && clean.length < 3) return false;

      return clean.length >= 2;
    })
    .filter((word) => normalized.includes(normalizeText(word)));
}

function hasExperience(text, minYears) {
  const matches = [
    ...normalizeText(text).matchAll(/(\d+)\+?\s*(years|yrs|שנים)/g),
  ];

  return matches.some((match) => Number(match[1]) >= minYears);
}

function addUnique(items, value) {
  if (value && !items.includes(value)) {
    items.push(value);
  }
}

export function scoreJob(job, profile = {}, keywords = {}, feedback = []) {
  const text = [job.title, job.company, job.location, job.description, job.via]
    .filter(Boolean)
    .join(" ");

  const reasons = [];
  const warnings = [];

  const hardRegexMatches = findRegexMatches(text, HARD_EXCLUDE_REGEX);

  if (hardRegexMatches.length) {
    return {
      fitScore: 0,
      recommendation: "skip",
      status: "skipped",
      reasons: [],
      warnings: [`נפסל אוטומטית: שירות לקוחות / טלפוני / מכירות / משמרות.`],
    };
  }

  if (
    job.roleFamily === "irrelevant" ||
    (job.isRelevantRole === false && job.roleConfidence === "high")
  ) {
    return {
      fitScore: 0,
      recommendation: "skip",
      status: "skipped",
      reasons: [],
      warnings: ["נפסל: התפקיד לא שייך למסלול החיפוש שלך."],
    };
  }

  let score = 20;

  if (job.roleFamily === "qa") {
    score += 38;
    addUnique(reasons, "זוהה תפקיד QA / בדיקות תוכנה.");
  } else if (job.roleFamily === "information_systems") {
    score += 26;
    addUnique(reasons, "זוהה תפקיד מערכות מידע / הטמעה.");
  } else if (job.roleFamily === "information") {
    score += 16;
    addUnique(reasons, "תפקיד מידע / בק אופיס / מסמכים — כיוון משני אפשרי.");
  } else {
    score -= 25;
    warnings.push("לא זוהה תפקיד יעד ברור.");
  }

  if (job.roleType === "qa_manual") {
    score += 10;
    addUnique(reasons, "בדיקות ידניות — מתאים לכניסה לתחום.");
  }

  if (job.roleType === "qa_automation") {
    score += 6;
    addUnique(reasons, "אוטומציה מוזכרת — יתרון, אבל לבדוק דרישות ניסיון.");
  }

  if (job.roleType === "qa_sap") {
    score += 4;
    addUnique(reasons, "QA על SAP — עשוי להיות רלוונטי אם לא בכיר מדי.");
  }

  if (job.seniority === "junior" || job.hasNoExperienceSignal) {
    score += 18;
    addUnique(reasons, "מתאים לג׳וניור / ללא ניסיון.");
  }

  if (job.seniority === "senior_or_lead" || job.hasSeniorSignal) {
    score -= 35;
    warnings.push("נראה בכיר/ניהולי מדי.");
  }

  if (hasExperience(text, 4)) {
    score -= 35;
    warnings.push("נראה שדורש 4 שנות ניסיון ומעלה.");
  } else if (hasExperience(text, 3)) {
    score -= 18;
    warnings.push("ייתכן שדורש 3 שנות ניסיון ומעלה.");
  }

  if (GOOD_LOCATION_KEYS.has(job.locationKey)) {
    score += 16;
    addUnique(reasons, `מיקום מתאים: ${job.location}.`);
  } else if (BAD_LOCATION_KEYS.has(job.locationKey)) {
    score -= 22;
    warnings.push(`מיקום פחות מתאים: ${job.location}.`);
  } else if (!job.locationKey) {
    score -= 8;
    warnings.push("המיקום לא זוהה בוודאות.");
  }

  const targetMatches = findMatches(text, profile.targetRoles || []);
  if (targetMatches.length) {
    score += Math.min(12, targetMatches.length * 4);
    reasons.push(`מילות יעד שנמצאו: ${targetMatches.slice(0, 4).join(", ")}.`);
  }

  const skillMatches = findMatches(text, profile.skills || []);
  if (skillMatches.length) {
    score += Math.min(12, skillMatches.length * 3);
    reasons.push(
      `כישורים שלך שמופיעים במשרה: ${skillMatches.slice(0, 4).join(", ")}.`,
    );
  }

  const excludedMatches = findMatches(text, keywords.exclude || []);
  if (excludedMatches.length) {
    const unique = [...new Set(excludedMatches)].slice(0, 5);
    score -= Math.min(35, unique.length * 8);
    warnings.push(`מילות אזהרה: ${unique.join(", ")}.`);
  }

  if (!job.url) {
    score -= 10;
    warnings.push("לא נמצא קישור ישיר להגשה.");
  }

  const learning = getLearningAdjustment(job, feedback);
  score += learning.adjustment;
  reasons.push(...learning.reasons);
  warnings.push(...learning.warnings);

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = "review";
  if (score >= 75) recommendation = "apply";
  if (score < 45) recommendation = "skip";

  return {
    fitScore: score,
    recommendation,
    reasons: reasons.length
      ? reasons
      : ["התאמה כללית, אבל חסרים סימנים חזקים."],
    warnings,
  };
}
