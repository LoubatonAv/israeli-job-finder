
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
  "or_yehuda",
  "caesarea",
  "lod",
]);

const TARGET_ROLE_FAMILIES = new Set([
  "qa",
  "automation",
  "information_systems",
  "information",
  "analysis",
  "operations",
  "data",
]);

function normalize(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function addUnique(items, value) {
  if (value && !items.includes(value)) {
    items.push(value);
  }
}

function textOf(job = {}) {
  return [
    job.title,
    job.company,
    job.location,
    job.locationKey,
    job.description,
    job.via,
    job.source,
  ]
    .filter(Boolean)
    .join(" ");
}

function isQaRole(job = {}) {
  const text = normalize([job.title, job.roleFamily, job.roleType].filter(Boolean).join(" "));

  return (
    job.roleFamily === "qa" ||
    job.roleFamily === "automation" ||
    /(?:^|[^a-z])qa(?:$|[^a-z])/i.test(text) ||
    /tester|testing|test engineer|automation/i.test(text) ||
    /בודק\s*[\/.]?\s*(?:\/ת|ת)?\s*תוכנה|בודק\/ת\s*תוכנה|בודק\.ת\s*תוכנה|בודקי\s*תוכנה|בודקות\s*תוכנה|בדיקות\s*תוכנה|איש\s*qa|אשת\s*qa|איש\s*\/אשת\s*qa/i.test(text)
  );
}

function hasSoftwareQaEvidence(job = {}) {
  const text = textOf(job);

  return /תוכנה|בדיקות\s*תוכנה|בודק\s*[\/.]?\s*(?:\/ת|ת)?\s*תוכנה|בודק\/ת\s*תוכנה|בודקי\s*תוכנה|בודקות\s*תוכנה|software|automation|automated|selenium|playwright|cypress|api|web|mobile|crm|salesforce|sap|erp|מערכות\s*מידע|אפליקטיבי|אפליקציה|system\s*qa|software\s*qa|software\s*tester|qa\s*tester|test\s*engineer/i.test(text);
}

function hasBusinessQualityEvidence(job = {}) {
  const text = textOf(job);

  return /הבטחת\s*איכות|בקרת\s*איכות|אבטחת\s*איכות|איכות|מפעל|ייצור|יצורי|אספטי|סטרילי|סטרילית|מכשור\s*רפואי|qa\s*\/\s*ra|ra\s*\/\s*qa|\bra\b|gmp|iso\s*13485|פארמה|תרופות|מעבדה|מזון|quality\s*assurance|quality\s*control|regulatory|רגולציה/i.test(text);
}

function isBusinessQualityQa(job = {}) {
  if (!isQaRole(job)) return false;

  return hasBusinessQualityEvidence(job) && !hasSoftwareQaEvidence(job);
}

function hasHardExclude(job = {}) {
  const text = textOf(job);

  return /שירות\s*לקוחות|נציג(?:\/ת)?|מוקד|טלפוני|שיחות|call\s*center|customer\s*service|מכירות|איש\s*מכירות|אשת\s*מכירות|\bsales\b(?!\s*force)|business\s*development|account\s*executive|משמרות|לילות|סופי\s*שבוע|שבת|חגים|24\/7|תיירות|חופשות|נופש/i.test(text);
}

function hasSeniorSignal(job = {}) {
  const title = String(job.title || "");
  const text = textOf(job);

  return (
    /ראש\s*צוות|ר["״]?צ|team\s*lead|\blead\b|manager|cto|מנהל(?:\/ת)?|בכיר|בכירה|מומחה|מומחית/i.test(title) ||
    /(?:4|5|6|7|8|9|10)\+?\s*(?:שנים|שנות|שנה|years?|yrs?)/i.test(text) ||
    /(?:ניסיון|נסיון|experience).{0,50}(?:4|5|6|7|8|9|10)\+?/i.test(text)
  );
}

function hasThreePlusExperience(job = {}) {
  const text = textOf(job);

  return (
    /(?:3|4|5|6|7|8|9|10)\+?\s*(?:שנים|שנות|שנה|years?|yrs?)/i.test(text) ||
    /(?:ניסיון|נסיון|experience).{0,50}(?:3|4|5|6|7|8|9|10)\+?/i.test(text)
  );
}

function hasBadLocation(job = {}) {
  const locationKey = String(job.locationKey || "");
  const locationText = [job.location, job.locationKey, job.title]
    .filter(Boolean)
    .join(" ");

  const badLocationText =
    /אור\s*יהודה|קיסריה|לוד|ראשון\s*לציון|חולון|רמת\s*גן|תל\s*אביב|ירושלים|באר\s*שבע|שדרות|אשדוד|אשקלון|נתיבות|דרום|פתח\s*תקווה|ראש\s*העין|מרכז\s*הארץ|איזור\s*המרכז|אזור\s*המרכז|מרכז|השרון|שרון|השפלה|שפלה|tel\s*aviv|jerusalem|sderot|ashdod|ashkelon|beer\s*sheva|beersheba|ramat\s*gan|petah\s*tikva|raanana|kfar\s*saba|hod\s*hasharon|hasharon|sharon|shefela|shfela|south|southern|central\s*israel|center|centre|merkaz/i;

  return BAD_LOCATION_KEYS.has(locationKey) || badLocationText.test(locationText);
}

function hasGoodLocation(job = {}) {
  return GOOD_LOCATION_KEYS.has(String(job.locationKey || ""));
}

function hasUnknownLocation(job = {}) {
  const location = String(job.location || "").trim();
  const locationKey = String(job.locationKey || "").trim();

  return !locationKey || locationKey === "unknown" || !location || location === "Israel";
}

function isTargetRole(job = {}) {
  if (isQaRole(job)) return true;
  return TARGET_ROLE_FAMILIES.has(String(job.roleFamily || ""));
}

function canApplyByRole(job = {}) {
  if (isBusinessQualityQa(job)) return false;

  if (isQaRole(job)) {
    return hasSoftwareQaEvidence(job);
  }

  return TARGET_ROLE_FAMILIES.has(String(job.roleFamily || ""));
}

export function getDecisionDimensions(job = {}) {
  return {
    isTargetRole: isTargetRole(job),
    canApplyByRole: canApplyByRole(job),
    isQaRole: isQaRole(job),
    hasSoftwareQaEvidence: hasSoftwareQaEvidence(job),
    hasBusinessQualityEvidence: hasBusinessQualityEvidence(job),
    isBusinessQualityQa: isBusinessQualityQa(job),
    hasHardExclude: hasHardExclude(job),
    hasBadLocation: hasBadLocation(job),
    hasGoodLocation: hasGoodLocation(job),
    hasUnknownLocation: hasUnknownLocation(job),
    hasSeniorSignal: hasSeniorSignal(job),
    hasThreePlusExperience: hasThreePlusExperience(job),
  };
}

export function applyDecisionGates(job = {}) {
  const next = {
    ...job,
    reasons: Array.isArray(job.reasons) ? [...job.reasons] : [],
    warnings: Array.isArray(job.warnings) ? [...job.warnings] : [],
  };

  const score = Number(next.fitScore || 0);
  const d = getDecisionDimensions(next);

  next.decisionGates = d;

  if (d.hasHardExclude) {
    next.fitScore = Math.min(score, 20);
    next.recommendation = "skip";
    addUnique(next.warnings, "נפסל: שירות/טלפוני/מכירות/משמרות או מודל עבודה לא מתאים.");
    return next;
  }

  if (d.hasBadLocation) {
    next.fitScore = Math.min(score, 40);
    next.recommendation = "skip";
    addUnique(next.warnings, "נפסל: מיקום לא מתאים.");
    return next;
  }

  if (d.isBusinessQualityQa) {
    next.fitScore = Math.min(score, 35);
    next.recommendation = "skip";
    addUnique(next.warnings, "נפסל: נראה QA איכות/ייצור/רגולציה ולא בדיקות תוכנה.");
    return next;
  }

  if (!d.isTargetRole) {
    next.fitScore = Math.min(score, 35);
    next.recommendation = "skip";
    addUnique(next.warnings, "נפסל: לא זוהה תפקיד יעד מתאים.");
    return next;
  }

  if (!d.canApplyByRole) {
    next.recommendation = score >= 45 ? "review" : "skip";
    addUnique(next.warnings, "נשאר לבדיקה: התפקיד נראה קרוב, אבל חסר סימן ברור שזה QA תוכנה / תפקיד יעד מדויק.");
    return next;
  }

  if (d.hasUnknownLocation) {
    next.recommendation = "review";
    addUnique(next.warnings, "נשאר לבדיקה: המיקום לא זוהה בוודאות.");
    return next;
  }

  if (d.hasSeniorSignal || d.hasThreePlusExperience) {
    next.recommendation = "review";
    addUnique(next.warnings, "נשאר לבדיקה: יש סימן לניסיון/בכירות גבוהים מדי.");
    return next;
  }

  if (d.hasGoodLocation && score >= 75) {
    next.recommendation = "apply";
    return next;
  }

  if (score < 45) {
    next.recommendation = "skip";
    return next;
  }

  next.recommendation = "review";
  return next;
}
