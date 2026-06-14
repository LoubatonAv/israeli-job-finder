const GOOD_LOCATION_KEYS = new Set([
  "haifa",
  "krayot",
  "kiryat_ata",
  "yokneam",
  "karmiel",
  "nahariya",
  "acre",
  "akko",
  "north",
  "remote",
  "nesher",
  "tirat_carmel",
  "hadera",
  "יזרעאל",
  "בית_שאן",
]);

const BAD_LOCATION_KEYS = new Set([
  "tel_aviv",
  "jerusalem",
  "center",
  "beer_sheva",
  "ashdod",
  "ashkelon",
  "sderot",
  "netivot",
  "holon",
  "rishon_lezion",
  "netanya",
  "petah_tikva",
  "raanana",
  "kfar_saba",
  "כפר_סבא",
  "bnei_brak",
  "בני_ברק",
  "ramat_gan",
  "hod_hasharon",
  "herzliya",
  "rehovot",
  "sharon",
  "shefela",
  "or_yehuda",
  "caesarea",
  "lod",
]);

function textOf(job = {}) {
  return [
    job.title,
    job.company,
    job.location,
    job.locationKey,
    job.description,
    job.via,
    job.source,
    job.roleFamily,
    job.roleType,
    ...(Array.isArray(job.roleSignals) ? job.roleSignals : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(String(text || "")));
}

function hasQaText(job = {}) {
  const text = textOf(job);
  const title = String(job.title || "");

  return (
    job.roleFamily === "qa" ||
    job.roleFamily === "automation" ||
    /(?:^|[^a-z])qa(?:$|[^a-z])/i.test(text) ||
    /tester|testing|test engineer|manual tester|system tester/i.test(text) ||
    /v\s*&\s*v|v\s*v|verification|validation/i.test(text) ||
    /בודק\s*[\/.]?\s*(?:\/ת|ת)?\s*תוכנה|בודק\/ת\s*תוכנה|בודק\.ת\s*תוכנה|בודקי\s*תוכנה|בודקות\s*תוכנה|בדיקות\s*תוכנה|מהנדס(?:\/ת)?\s*בדיקות|מהנדסת\s*בדיקות|מהנדס\s*בדיקות|בדיקות\s*ידניות|בדיקות\s*מערכת|בדיקות\s*שילובים/i.test(title)
  );
}

function hasSoftwareQaEvidence(job = {}) {
  const text = textOf(job);
  const title = String(job.title || "");

  return hasAny(text, [
    /תוכנה|בדיקות\s*תוכנה|איכות\s*תוכנה|software\s*quality/i,
    /בודק\s*[\/.]?\s*(?:\/ת|ת)?\s*תוכנה|בודק\/ת\s*תוכנה|בודק\.ת\s*תוכנה|בודקי\s*תוכנה|בודקות\s*תוכנה/i,
    /software\s*qa|sw\s*qa|software\s*tester|qa\s*tester|manual\s*tester|manual\s*qa|system\s*tester|software\s*testing|system\s*testing|test\s*plans|test\s*cases/i,
    /sw\s*test\s*engineer|software\s*test\s*engineer|r&d\s*sw\s*test/i,
    /test\s*automation|automation\s*qa|selenium|playwright|cypress/i,
    /api\s*testing|web\s*testing|mobile\s*testing|בדיקות\s*web|בדיקות\s*mobile|web\s*\/\s*mobile/i,
    /crm|salesforce|sap|erp|priority|מערכות\s*מידע|אפליקטיבי|אפליקציה/i,
    /stp|std|str|תסריטי\s*בדיקות|מסמכי\s*בדיקות/i,
  ]) || hasAny(title, [
    /בדיקות\s*שילובים|בדיקות\s*מערכת|בודק(?:\/ת)?\s*מערכתי/i,
  ]);
}

function hasAutomationEvidence(job = {}) {
  return hasAny(textOf(job), [
    /automation|אוטומציה|selenium|playwright|cypress|test\s*automation|automation\s*qa/i,
  ]);
}

function hasDeveloperAutomationSignal(job = {}) {
  const text = textOf(job);
  return hasAny(text, [
    /מפתח(?:\/ת)?\s*אוטומציה|automation\s*developer|develop\s*automation|פיתוח\s*אוטומציה/i,
  ]);
}

function hasBusinessQualityEvidence(job = {}) {
  return hasAny(textOf(job), [
    /הבטחת\s*איכות|בקרת\s*איכות|אבטחת\s*איכות|איכות/i,
    /מפעל|ייצור|יצורי|אספטי|סטרילי|סטרילית/i,
    /מכשור\s*רפואי|qa\s*\/\s*ra|ra\s*\/\s*qa|\bra\b|gmp|iso\s*13485/i,
    /פארמה|תרופות|מעבדה|מזון|regulatory|רגולציה|quality\s*assurance|quality\s*control/i,
  ]);
}

function hasInformationSystemsEvidence(job = {}) {
  return hasAny(textOf(job), [
    /מערכות\s*מידע|מטמיע|הטמעה|מיישם|יישום|crm|erp|sap|priority|salesforce|אפליקטיבי|תמיכה\s*אפליקטיבית/i,
  ]);
}

function hasDataOrOfficeEvidence(job = {}) {
  return hasAny(textOf(job), [
    /data\s*entry|בק\s*אופיס|back\s*office|בקרת\s*מסמכים|document\s*control|מידען|אקסל|excel|קלדנות/i,
  ]);
}

function hasHardExclude(job = {}) {
  return hasAny(textOf(job), [
    /שירות\s*לקוחות|נציג(?:\/ת)?|מוקד|טלפוני|שיחות|call\s*center|customer\s*service/i,
    /מכירות|איש\s*מכירות|אשת\s*מכירות|\bsales\b(?!\s*force)|business\s*development|account\s*executive/i,
    /משמרות|לילות|סופי\s*שבוע|שבת|חגים|24\/7|כוננות/i,
    /תיירות|חופשות|נופש|הכנסה\s*גבוהה|רווחים\s*גבוהים/i,
  ]);
}

function hasSeniorSignal(job = {}) {
  const title = String(job.title || "");
  const text = textOf(job);

  return hasAny(title, [
    /ראש\s*צוות|ר["״]?צ|team\s*lead|\blead\b|manager|מנהל(?:\/ת)?|בכיר|בכירה|מומחה|מומחית|מנוסה/i,
  ]) || hasAny(text, [
    /(?:4|5|6|7|8|9|10)\+?\s*(?:שנים|שנות|שנה|years?|yrs?)/i,
    /(?:ניסיון|נסיון|experience).{0,60}(?:4|5|6|7|8|9|10)\+?/i,
  ]);
}

function hasThreePlusExperience(job = {}) {
  const text = textOf(job);

  return hasAny(text, [
    /(?:3|4|5|6|7|8|9|10)\+?\s*(?:שנים|שנות|שנה|years?|yrs?)/i,
    /(?:ניסיון|נסיון|experience).{0,60}(?:3|4|5|6|7|8|9|10)\+?/i,
  ]);
}

function hasBadLocation(job = {}) {
  const locationKey = String(job.locationKey || "");
  const locationText = [job.location, job.locationKey, job.title, job.description]
    .filter(Boolean)
    .join(" ");

  return BAD_LOCATION_KEYS.has(locationKey) || hasAny(locationText, [
    /אור\s*יהודה|קיסריה|לוד|ראשון\s*לציון|חולון|רמת\s*גן|תל\s*אביב|ירושלים|באר\s*שבע|שדרות|אשדוד|אשקלון|נתיבות|דרום/i,
    /בני\s*ברק|כפר\s*סבא|פתח\s*תקווה|ראש\s*העין|מרכז\s*הארץ|איזור\s*המרכז|אזור\s*המרכז|מרכז|השרון|שרון|השפלה|שפלה/i,
    /tel\s*aviv|jerusalem|sderot|ashdod|ashkelon|beer\s*sheva|beersheba|bnei\s*brak|ramat\s*gan|petah\s*tikva|raanana|kfar\s*saba|hod\s*hasharon|hasharon|sharon|shefela|shfela|south|southern|central\s*israel|center|centre|merkaz/i,
  ]);
}

function hasGoodLocation(job = {}) {
  const locationKey = String(job.locationKey || "");
  const text = [job.location, job.locationKey].filter(Boolean).join(" ");

  return GOOD_LOCATION_KEYS.has(locationKey) || hasAny(text, [
    /חיפה|קריות|קריית\s*אתא|יקנעם|יוקנעם|נשר|טירת\s*כרמל|עכו|נהריה|כרמיאל|צפון|חדרה|יזרעאל|בית\s*שאן|remote|מרחוק/i,
  ]);
}

function hasUnknownLocation(job = {}) {
  const location = String(job.location || "").trim();
  const locationKey = String(job.locationKey || "").trim();

  return !locationKey || locationKey === "unknown" || !location || location === "Israel";
}

export function classifyJob(job = {}) {
  const qaText = hasQaText(job);
  const softwareQaEvidence = hasSoftwareQaEvidence(job);
  const automationEvidence = hasAutomationEvidence(job);
  const developerAutomationSignal = hasDeveloperAutomationSignal(job);
  const businessQualityEvidence = hasBusinessQualityEvidence(job);
  const informationSystemsEvidence = hasInformationSystemsEvidence(job);
  const dataOrOfficeEvidence = hasDataOrOfficeEvidence(job);

  let roleDomain = "unknown";
  let canApplyByRole = false;

  if (businessQualityEvidence && qaText && !softwareQaEvidence) {
    roleDomain = "business_quality";
  } else if (developerAutomationSignal && !softwareQaEvidence) {
    roleDomain = "automation_dev";
  } else if (qaText && automationEvidence && softwareQaEvidence) {
    roleDomain = "automation_qa";
    canApplyByRole = true;
  } else if (qaText && softwareQaEvidence) {
    roleDomain = "software_qa";
    canApplyByRole = true;
  } else if (qaText) {
    roleDomain = "qa_uncertain";
  } else if (informationSystemsEvidence || job.roleFamily === "information_systems") {
    roleDomain = "information_systems";
    canApplyByRole = true;
  } else if (
    dataOrOfficeEvidence ||
    ["data", "information", "analysis", "operations"].includes(String(job.roleFamily || ""))
  ) {
    roleDomain = "quiet_admin_data";
    canApplyByRole = true;
  } else if (job.roleFamily === "irrelevant" || job.isRelevantRole === false) {
    roleDomain = "irrelevant";
  }

  const hardExclude = hasHardExclude(job);
  const badLocation = hasBadLocation(job);
  const goodLocation = hasGoodLocation(job);
  const unknownLocation = hasUnknownLocation(job);
  const seniorSignal = hasSeniorSignal(job);
  const threePlusExperience = hasThreePlusExperience(job);

  return {
    roleDomain,
    roleConfidence:
      roleDomain === "software_qa" || roleDomain === "automation_qa" ? "high" :
      roleDomain === "qa_uncertain" || roleDomain === "automation_dev" ? "medium" :
      roleDomain === "unknown" ? "low" :
      "medium",
    isTargetRole: canApplyByRole || roleDomain === "qa_uncertain" || roleDomain === "automation_dev",
    canApplyByRole,
    isQaRole: qaText,
    hasSoftwareQaEvidence: softwareQaEvidence,
    hasAutomationEvidence: automationEvidence,
    hasDeveloperAutomationSignal: developerAutomationSignal,
    hasBusinessQualityEvidence: businessQualityEvidence,
    isBusinessQualityQa: roleDomain === "business_quality",
    hasInformationSystemsEvidence: informationSystemsEvidence,
    hasDataOrOfficeEvidence: dataOrOfficeEvidence,
    hasHardExclude: hardExclude,
    hasBadLocation: badLocation,
    hasGoodLocation: goodLocation,
    hasUnknownLocation: unknownLocation,
    hasSeniorSignal: seniorSignal,
    hasThreePlusExperience: threePlusExperience,
  };
}

export {
  GOOD_LOCATION_KEYS,
  BAD_LOCATION_KEYS,
  hasSoftwareQaEvidence,
  hasBusinessQualityEvidence,
  hasHardExclude,
  hasBadLocation,
  hasGoodLocation,
  hasUnknownLocation,
  hasSeniorSignal,
  hasThreePlusExperience,
};
