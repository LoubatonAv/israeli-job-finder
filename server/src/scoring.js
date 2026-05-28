import { normalizeText } from "./utils.js";

const HARD_EXCLUDE_REGEX = [
  /(?:^|\s)שירות(?:\s+לקוחות)?(?:\s|$|–|-)/i,
  /נציג(?:\/ת|י|ים|ות|י\/ות)?/i,
  /מוקד|טלפוני|שיחות/i,
  /מכירות|sales/i,

  /סוכנ(?:\/ית|ית|י|ים|ות|י\/ות)?/i,
  /תיירות|נסיעות/i,

  /ביטוח|אלמנטרי|פיננס/i,
  /רפרנט(?:\/ית|ית)?/i,

  /מסעדה|מלצר|קופאי|קופה/i,

  /senior|team\s*lead|manager|director|principal/i,
  /ראש\s*צוות|מנהל|בכיר|מנוסה/i,
  /\b[3-9]\+?\s*(years|yrs)\b/i,
  /[3-9]\s*שנים/i,

  /משמרות|לילות|סופי\s*שבוע|שבת|חגים|כוננות/i,
];

function findRegexMatches(text, regexList = []) {
  return regexList
    .filter((regex) => regex.test(text))
    .map((regex) => regex.toString());
}

function countMatches(text, words = []) {
  const normalized = normalizeText(text);
  return words.filter((word) => normalized.includes(normalizeText(word)))
    .length;
}

function findMatches(text, words = []) {
  const normalized = normalizeText(text);
  return words.filter((word) => normalized.includes(normalizeText(word)));
}

export function scoreJob(job, profile, keywords) {
  const text = [job.title, job.company, job.location, job.description, job.via]
    .filter(Boolean)
    .join(" ");
  const reasons = [];
  const warnings = [];

  let score = 35;

  const roleMatches = findMatches(text, profile.targetRoles || []);
  if (roleMatches.length) {
    score += Math.min(30, roleMatches.length * 10);
    reasons.push(
      `Matches target role keywords: ${roleMatches.slice(0, 4).join(", ")}`,
    );
  }

  const positiveMatches = findMatches(text, profile.positiveKeywords || []);
  if (positiveMatches.length) {
    score += Math.min(25, positiveMatches.length * 4);
    reasons.push(`Positive signals: ${positiveMatches.slice(0, 6).join(", ")}`);
  }

  const locationMatches = findMatches(
    text,
    profile.preferences?.preferredLocations || [],
  );
  if (
    locationMatches.length ||
    normalizeText(job.location).includes("israel")
  ) {
    score += 15;
    reasons.push("Location looks relevant for Israel / remote Israel.");
  }

  const excludedMatches = findMatches(text, keywords.exclude || []);
  if (excludedMatches.length) {
    const hardExcludes = [
      "senior",
      "lead",
      "manager",
      "director",
      "principal",
      "team lead",
      "ראש צוות",
      "מנהל",
      "מהנדס",
      "מהנדסת",
      "בכיר",
      "בכיר/ה",
      "מנוסה",
      "3 שנים",
      "4 שנים",
      "5 שנים",
      "6 שנים",
      "7 שנים",
      "3-4 שנים",
      "3+ years",
      "4+ years",
      "5+ years",
      "6+ years",
      "7+ years",
      "משמרות",
      "שבת",
      "חגים",
      "ירושלים",
      "תל אביב",
      "tel aviv",
      "jerusalem",
      "מרכז",
      "דרום",
    ];

    const hasHardExclude = excludedMatches.some((match) =>
      hardExcludes.includes(match.toLowerCase()),
    );

    score -= hasHardExclude ? 70 : Math.min(45, excludedMatches.length * 12);

    warnings.push(`Excluded: ${excludedMatches.slice(0, 5).join(", ")}`);

    if (hasHardExclude) {
      score = Math.min(score, 20);
    }
  }

  const yearsMatch = normalizeText(text).match(/(\d+)\+?\s*(years|yrs|שנים)/);
  if (yearsMatch) {
    const years = Number(yearsMatch[1]);
    if (years >= 4) {
      score -= 18;
      warnings.push(`May require ${years}+ years of experience.`);
    }
  }

  const skillMatches = findMatches(text, profile.skills || []);
  if (skillMatches.length) {
    score += Math.min(20, skillMatches.length * 4);
    reasons.push(
      `Your skills mentioned: ${skillMatches.slice(0, 5).join(", ")}`,
    );
  }

  if (!job.url) {
    score -= 8;
    warnings.push("No direct application link was found.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = "review";
  if (score >= 75) recommendation = "apply";
  if (score < 45) recommendation = "skip";
  const hardRegexMatches = findRegexMatches(text, HARD_EXCLUDE_REGEX);

  if (hardRegexMatches.length) {
    return {
      fitScore: 0,
      recommendation: "skip",
      status: "skipped",
      reasons: [],
      warnings: [
        `Hard excluded by regex: ${hardRegexMatches.slice(0, 3).join(", ")}`,
      ],
    };
  }
  return {
    fitScore: score,
    recommendation,
    reasons: reasons.length
      ? reasons
      : ["General match, but not enough strong positive signals."],
    warnings,
  };
}
