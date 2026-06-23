import { normalizeText } from "./utils.js";
import { getLearningAdjustment } from "./learning.js";
import { getRoleProfileById } from "./roleProfiles.js";
import { applyDecisionGates } from "./decisionGates.js";

const HARD_EXCLUDE_REGEX = [
  /(?:^|\s)שירות(?:\s+לקוחות)?(?:\s|$|–|-)/i,
  /נציג(?:\/ת|י|ים|ות|י\/ות)?/i,
  /מוקד|טלפוני|שיחות/i,
  /(?:מכירות|איש\\s*מכירות|אשת\\s*מכירות|\\bsales\\b|sales\\s*(?:rep|representative|manager)|business\\s*development|account\\s*executive)/i,
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
  "nesher",
  "tirat_carmel",
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
  "ramat_gan",
  "hod_hasharon",
  "herzliya",
  "rehovot",
  "sharon",

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
  const normalized = normalizeText(text);

  const patterns = [
    /(\d+)\+?\s*(?:years?|yrs?|שנים|שנות|שנה)/gi,
    /(?:ניסיון|נסיון|experience).{0,50}?(\d+)\+?/gi,
    /(\d+)\+?.{0,25}?(?:ניסיון|נסיון|experience)/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...normalized.matchAll(pattern)];

    if (matches.some((match) => Number(match[1]) >= minYears)) {
      return true;
    }
  }

  return false;
}

function addUnique(items, value) {
  if (value && !items.includes(value)) {
    items.push(value);
  }
}

function hasAdminOrNonSoftwareNoise(text = "") {
  const value = String(text || "");

  const exactAdminRole =
    /(?:^|[^\p{L}\p{N}])פקיד(?:ה|ת)?(?:$|[^\p{L}\p{N}])/iu.test(value) ||
    /(?:^|[^\p{L}\p{N}])בק\s*אופיס(?:$|[^\p{L}\p{N}])/iu.test(value) ||
    /\bback\s*office\b/i.test(value);

  const otherNoise =
    /לוגיסטיקה|מעבדה|פארמה|אצוות|מחסן|אדמיניסטרציה/i.test(value);

  return exactAdminRole || otherNoise;
}

function isRecognizedQuietRole(job = {}, text = "") {
  const roleFamily = String(job.roleFamily || "");
  const roleText = [
    text,
    job.roleType,
    job.roleProfileId,
    job.roleProfileName,
  ]
    .filter(Boolean)
    .join(" ");

  const hasQuietRoleProfile =
    Boolean(job.roleProfileId) &&
    ["information", "operations", "analysis", "information_systems", "data"].includes(
      roleFamily,
    );

  const hasClearQuietRoleEvidence =
    /back\s*office|בק\s*אופיס|data\s*entry|הזנת\s*נתונים|קליטת\s*נתונים|document\s*control(?:ler)?|doc\s*control|בקרת\s*מסמכים|מידען|information\s*specialist|application\s*support|תמיכה\s*אפליקטיבית/i.test(
      roleText,
    );

  return hasQuietRoleProfile || hasClearQuietRoleEvidence;
}


function isSpecificLearningMessage(message = "") {
  return /ניסיון|נסיון|מיקום|טלפוני|טלפון|שירות|לקוחות|מכירות|משמרות|שבת|חגים|בכיר|ניהולי|מרכז|תל אביב|ירושלים|שרון|שפלה/i.test(
    String(message || ""),
  );
}

function cleanLearningForJob(job = {}, learning = {}) {
  const roleFamily = String(job.roleFamily || "");
  const reasons = Array.isArray(learning.reasons) ? learning.reasons : [];
  const warnings = Array.isArray(learning.warnings) ? learning.warnings : [];

  if (roleFamily !== "qa") {
    return {
      adjustment: Number(learning.adjustment || 0),
      reasons,
      warnings,
    };
  }

  const usefulReasons = reasons.filter((message) =>
    isSpecificLearningMessage(message),
  );

  const usefulWarnings = warnings.filter((message) =>
    isSpecificLearningMessage(message),
  );

  const hasOnlyGenericLearning =
    (reasons.length || warnings.length) &&
    usefulReasons.length === 0 &&
    usefulWarnings.length === 0;

  return {
    // Generic "similar QA was rejected" should not crush every QA result.
    adjustment: hasOnlyGenericLearning
      ? Math.max(Number(learning.adjustment || 0), -6)
      : Number(learning.adjustment || 0),
    reasons: usefulReasons,
    warnings: usefulWarnings,
  };
}


function hasExplicitSeniorSignal(job = {}, text = "") {
  const title = String(job.title || "");

  return (
    /ראש\s*צוות|ר["״]?צ|team\s*lead|\blead\b|manager|cto|מנהל(?:\/ת)?|בכיר|בכירה/i.test(title) ||
    /(?:4|5|6|7|8|9|10)\+?\s*(?:שנים|שנות|שנה|years?|yrs?)/i.test(text) ||
    /(?:ניסיון|נסיון|experience).{0,50}(?:4|5|6|7|8|9|10)\+?/i.test(text)
  );
}

function isActualClerkMatch(text = "") {
  return /(?:^|[^\p{L}\p{N}])פקיד(?:ה|ת)?(?:$|[^\p{L}\p{N}])/iu.test(
    String(text || ""),
  );
}

function filterExcludedMatchesForJob(job = {}, text = "", matches = []) {
  const roleFamily = String(job.roleFamily || "");
  const title = String(job.title || "");

  return matches.filter((match) => {
    const value = String(match || "").trim();

    // Do not match פקיד inside תפקיד.
    if (/פקיד/.test(value)) {
      return isActualClerkMatch(text);
    }

    // QA jobs often mention פיתוח as context; don't warn unless this is really a dev title.
    if (
      roleFamily === "qa" &&
      value === "פיתוח" &&
      !/מפתח|מפתחת|developer|software\s*engineer|frontend|backend|full\s*stack/i.test(title)
    ) {
      return false;
    }

    return true;
  });
}


function hasSoftwareQaSignalText(text = "") {
  const value = String(text || "");

  return /תוכנה|בדיקות\s*תוכנה|בודק\s*[\/.]?\s*(?:\/ת|ת)?\s*תוכנה|בודק\/ת\s*תוכנה|בודקי\s*תוכנה|בודקות\s*תוכנה|software|automation|automated|selenium|playwright|cypress|api|web|mobile|crm|salesforce|sap|erp|מערכות\s*מידע|system\s*qa|software\s*qa|software\s*tester|qa\s*tester|test\s*engineer/i.test(value);
}

function hasManufacturingQualitySignal(text = "") {
  const value = String(text || "");

  return /הבטחת\s*איכות|בקרת\s*איכות|אבטחת\s*איכות|מפעל|ייצור|יצורי|אספטי|סטרילי|סטרילית|מכשור\s*רפואי|qa\s*\/\s*ra|ra\s*\/\s*qa|\bra\b|gmp|iso\s*13485|פארמה|תרופות|מעבדה|מזון|quality\s*assurance|quality\s*control|regulatory|רגולציה/i.test(value);
}

function isManufacturingQualityQa(job = {}) {
  const text = [
    job.title,
    job.company,
    job.location,
    job.description,
    job.via,
  ]
    .filter(Boolean)
    .join(" ");

  const hasQaSignal =
    job.roleFamily === "qa" ||
    /(?:^|[^a-z])qa(?:$|[^a-z])/i.test(text) ||
    /הבטחת\s*איכות|בקרת\s*איכות|אבטחת\s*איכות/i.test(text);

  if (!hasQaSignal) return false;

  return hasManufacturingQualitySignal(text) && !hasSoftwareQaSignalText(text);
}


function getHardJobText(job = {}) {
  return [
    job.title,
    job.company,
    job.location,
    job.locationKey,
    job.description,
    job.source,
    job.via,
    job.url,
    job.jobType,
    ...(Array.isArray(job.reasons) ? job.reasons : []),
    ...(Array.isArray(job.warnings) ? job.warnings : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function getHardJobRejectionReason(job = {}) {
  const title = String(job.title || "");
  const source = String(job.source || "");
  const url = String(job.url || "");
  const text = getHardJobText(job);

  const isAllJobs = /alljobs/i.test([source, url, text].join(" "));

  if (
    isAllJobs &&
    /premium|פרימיום|למנויים בלבד|מנויים בלבד|מנוי בלבד|למנויי|דרוש חשבון|חשבון בתשלום|חשבון פרימיום/i.test(text)
  ) {
    return "נפסל אוטומטית: משרת AllJobs Premium / מנויים בלבד.";
  }

  const qaAutomationTitle =
    /(?:qa|בדיקות|בודק|בודקת|tester|testing).*(?:automation|אוטומציה)|(?:automation|אוטומציה).*(?:qa|בדיקות|בודק|בודקת|tester|testing)/i.test(title);

  const hardDeveloperTitle =
    /full\s*stack|software\s+developer|software\s+engineer|frontend|front\s*end|backend|back\s*end|\.net\s+developer|java\s+developer|react\s+developer|node(?:\.js)?\s+developer|מפתח(?:\/ת)?\s*(?:תוכנה|full\s*stack|frontend|backend|front|react|\.net|מערכות מידע)|מתכנת/i.test(title);

  if (hardDeveloperTitle && !qaAutomationTitle) {
    return "נפסל אוטומטית: תפקיד פיתוח תוכנה ולא QA/בדיקות.";
  }

  return "";
}

export function scoreJob(job, profile = {}, keywords = {}, feedback = []) {
  
  const hardRejectionReason = getHardJobRejectionReason(job);
  if (hardRejectionReason) {
    return {
      ...job,
      fitScore: 0,
      recommendation: "skip",
      status: "skipped",
      isRelevantRole: false,
      roleFamily: "irrelevant",
      roleType: "irrelevant",
      reasons: [],
      warnings: [...new Set([...(Array.isArray(job.warnings) ? job.warnings : []), hardRejectionReason])],
    };
  }

const text = [job.title, job.company, job.location, job.description, job.via]
    .filter(Boolean)
    .join(" ");

  const reasons = [];
  const warnings = [];

  if (isManufacturingQualityQa(job)) {
    return {
      fitScore: 0,
      recommendation: "skip",
      status: "skipped",
      reasons: [],
      warnings: ["נפסל: נראה QA איכות/ייצור/רגולציה ולא בדיקות תוכנה."],
    };
  }

  const hardRegexMatches = findRegexMatches(text, HARD_EXCLUDE_REGEX);

  if (hardRegexMatches.length) {
    return {
      fitScore: 0,
      recommendation: "skip",
      status: "skipped",
      reasons: [],
      warnings: ["נפסל אוטומטית: שירות לקוחות / טלפוני / מכירות / משמרות."],
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
  const roleProfile = job.roleProfileId ? getRoleProfileById(job.roleProfileId) : null;

  if (job.roleProfileId) {
    const bonus = Number(job.roleProfileScoreBonus || roleProfile?.scoreBonus || 26);
    score += bonus;
    addUnique(reasons, `זוהה תפקיד יעד: ${job.roleProfileName || roleProfile?.name || "תפקיד שהוגדר במערכת"}.`);
  }

  if (job.roleFamily === "qa") {
    score += 38;
    addUnique(reasons, "זוהה תפקיד QA / בדיקות תוכנה.");
  } else if (job.roleFamily === "information_systems") {
    score += 26;
    addUnique(reasons, "זוהה תפקיד מערכות מידע / הטמעה.");
  } else if (job.roleFamily === "information") {
    score += 16;
    addUnique(reasons, "תפקיד מידע / מסמכים — כיוון משני אפשרי.");
  } else if (job.roleFamily === "analysis") {
    score += 28;
    addUnique(reasons, "זוהה תפקיד אנליטי מתאים.");
  } else if (job.roleFamily === "operations") {
    score += 22;
    addUnique(reasons, "זוהה תפקיד תפעולי־טכני מתאים.");
  } else if (job.isRelevantRole === true) {
    score += 18;
    addUnique(reasons, "זוהה תפקיד רלוונטי לפי פרופיל מותאם.");
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

  if (job.roleType === "qa_sap" || job.roleType === "sap_implementer") {
    score += 4;
    addUnique(reasons, "SAP / ERP — עשוי להיות רלוונטי אם לא בכיר מדי.");
  }

  if (job.seniority === "junior" || job.hasNoExperienceSignal) {
    score += 18;
    addUnique(reasons, "מתאים לג׳וניור / ללא ניסיון.");
  }

  if (hasExplicitSeniorSignal(job, text)) {
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
    score -= 10;
    warnings.push("המיקום לא זוהה בוודאות.");
  }

  if (
    job.roleFamily !== "qa" &&
    hasAdminOrNonSoftwareNoise(text) &&
    !isRecognizedQuietRole(job, text)
  ) {
    score -= 28;
    warnings.push("נראה כמו אדמיניסטרציה / לוגיסטיקה / מעבדה ולא תפקיד תוכנה ברור.");
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

  const excludedMatches = filterExcludedMatchesForJob(
    job,
    text,
    findMatches(text, keywords.exclude || []),
  );
  if (excludedMatches.length) {
    const unique = [...new Set(excludedMatches)].slice(0, 5);
    score -= Math.min(35, unique.length * 8);
    warnings.push(`מילות אזהרה: ${unique.join(", ")}.`);
  }

  if (!job.url) {
    score -= 10;
    warnings.push("לא נמצא קישור ישיר להגשה.");
  }

  const learning = cleanLearningForJob(
    job,
    getLearningAdjustment(job, feedback),
  );
  score += learning.adjustment;
  reasons.push(...learning.reasons);
  warnings.push(...learning.warnings);

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = "review";
  if (score >= 75) recommendation = "apply";
  if (score < 45) recommendation = "skip";

  const isGoodApplyLocation =
    GOOD_LOCATION_KEYS.has(job.locationKey) ||
    job.locationKey === "remote";

  if (
    recommendation === "apply" &&
    (!isGoodApplyLocation ||
      BAD_LOCATION_KEYS.has(job.locationKey) ||
      job.seniority === "senior_or_lead" ||
      job.hasSeniorSignal ||
      hasExperience(text, 3))
  ) {
    recommendation = "review";
  }

  const isQaCandidateForReview =
    job.roleFamily === "qa" ||
    /\bqa\b|בודק\s*[\/.]?\s*ת?\s*תוכנה|בודקי\s*תוכנה|בדיקות\s*תוכנה/i.test(text);

  const isClearlyBadForQaReview =
    BAD_LOCATION_KEYS.has(job.locationKey) ||
    job.seniority === "senior_or_lead" ||
    job.hasSeniorSignal ||
    hasExperience(text, 3);

  if (
    recommendation === "skip" &&
    isQaCandidateForReview &&
    !isClearlyBadForQaReview &&
    score >= 30
  ) {
    recommendation = "review";
  }

  const rawScoreResult = {
    fitScore: score,
    recommendation,
    reasons: reasons.length
      ? [...new Set(reasons)].slice(0, 8)
      : ["התאמה כללית, אבל חסרים סימנים חזקים."],
    warnings: [...new Set(warnings)].slice(0, 8),
  };

  const gatedResult = applyDecisionGates({
    ...job,
    ...rawScoreResult,
  });

  return {
    fitScore: gatedResult.fitScore,
    recommendation: gatedResult.recommendation,
    reasons: gatedResult.reasons || rawScoreResult.reasons,
    warnings: gatedResult.warnings || rawScoreResult.warnings,
    decisionGates: gatedResult.decisionGates,
  };
}
