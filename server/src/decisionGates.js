import { classifyJob } from "./jobClassifier.js";

function addUnique(items, value) {
  if (value && !items.includes(value)) items.push(value);
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function clampScore(value, max) {
  const score = Number(value || 0);
  return Math.max(0, Math.min(max, score));
}

export function getDecisionDimensions(job = {}) {
  return classifyJob(job);
}

export function applyDecisionGates(job = {}) {
  const next = {
    ...job,
    reasons: Array.isArray(job.reasons) ? [...job.reasons] : [],
    warnings: Array.isArray(job.warnings) ? [...job.warnings] : [],
  };

  const originalStatus = String(next.status || "");
  const score = Number(next.fitScore || 0);
  const d = classifyJob(next);

  next.roleDomain = d.roleDomain;
  next.roleConfidence = d.roleConfidence;
  next.decisionGates = d;

  if (d.hasHardExclude) {
    next.fitScore = clampScore(score, 20);
    next.recommendation = "skip";
    if (originalStatus !== "applied") next.status = "skipped";
    addUnique(next.warnings, "נפסל: שירות/טלפוני/מכירות/משמרות או מודל עבודה לא מתאים.");
  } else if (d.hasBadLocation) {
    next.fitScore = clampScore(score, 40);
    next.recommendation = "skip";
    if (originalStatus !== "applied") next.status = "skipped";
    addUnique(next.warnings, "נפסל: מיקום לא מתאים.");
  } else if (d.roleDomain === "business_quality") {
    next.fitScore = clampScore(score, 35);
    next.recommendation = "skip";
    if (originalStatus !== "applied") next.status = "skipped";
    addUnique(next.warnings, "נפסל: QA איכות/ייצור/רגולציה ולא בדיקות תוכנה.");
  } else if (d.roleDomain === "irrelevant") {
    next.fitScore = clampScore(score, 35);
    next.recommendation = "skip";
    if (originalStatus !== "applied") next.status = "skipped";
    addUnique(next.warnings, "נפסל: לא זוהה תפקיד יעד מתאים.");
  } else if (d.roleDomain === "qa_uncertain" || d.roleDomain === "automation_dev") {
    next.recommendation = score >= 45 ? "review" : "skip";
    addUnique(next.warnings, "נשאר לבדיקה: התפקיד קרוב, אבל חסר סימן ברור שזה QA תוכנה / תפקיד יעד מדויק.");
  } else if (!d.canApplyByRole) {
    next.recommendation = score >= 45 ? "review" : "skip";
    addUnique(next.warnings, "נשאר לבדיקה: התפקיד קרוב, אבל חסר סיווג יעד מספיק חזק.");
  } else if (d.hasUnknownLocation) {
    next.recommendation = "review";
    addUnique(next.warnings, "נשאר לבדיקה: המיקום לא זוהה בוודאות.");
  } else if (d.hasSeniorSignal || d.hasThreePlusExperience) {
    next.recommendation = "review";
    addUnique(next.warnings, "נשאר לבדיקה: יש סימן לניסיון/בכירות גבוהים מדי.");
  } else if (d.hasGoodLocation && score >= 75) {
    next.recommendation = "apply";
  } else if (score < 45) {
    next.recommendation = "skip";
  } else {
    next.recommendation = "review";
  }

  next.warnings = unique(next.warnings);
  next.reasons = unique(next.reasons);

  return next;
}
