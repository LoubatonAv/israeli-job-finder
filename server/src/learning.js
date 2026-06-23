import { normalizeText } from './utils.js';

const POSITIVE_WEIGHTS = {
  saved: 7,
  applied: 14,
  interview: 18,
};

const NEGATIVE_WEIGHTS = {
  deleted: -14,
  skipped: -12,
  rejected: -10,
  not_relevant: -16,
};

export const REJECTION_REASONS = {
  location: {
    label: 'מיקום לא רלוונטי',
    penalty: -18,
  },
  shifts: {
    label: 'משמרות / לילות / סופי שבוע',
    penalty: -18,
    patterns: [
      /משמרות/i,
      /לילות/i,
      /סופי\s*שבוע/i,
      /סופש/i,
      /שבת/i,
      /חגים/i,
      /כוננות/i,
      /shift/i,
      /night/i,
      /weekend/i,
      /24\/7/i,
    ],
  },
  phone: {
    label: 'טלפוני מדי / מוקד',
    penalty: -18,
    patterns: [
      /טלפוני/i,
      /מוקד/i,
      /שיחות/i,
      /נציג/i,
      /call\s*center/i,
    ],
  },
  customer_service: {
    label: 'שירות לקוחות / תמיכה מדי',
    penalty: -18,
    patterns: [
      /שירות\s*לקוחות/i,
      /help\s*desk/i,
      /customer\s*service/i,
      /customer\s*support/i,
      /phone\s*support/i,
      /support\s*representative/i,
      /נציג(?:\/ת)?\s*תמיכה/i,
      /תמיכה\s*טלפונית/i,
    ],
  },
  sales: {
    label: 'מכירות / ביזנס מדי',
    penalty: -18,
    patterns: [
      /מכירות/i,
      /איש\/?ת\s*מכירות/i,
      /sales/i,
      /account\s*executive/i,
      /business\s*development/i,
      /bd\b/i,
    ],
  },
  senior: {
    label: 'בכיר / ניהולי מדי',
    penalty: -20,
    patterns: [
      /senior/i,
      /team\s*lead/i,
      /manager/i,
      /director/i,
      /principal/i,
      /ראש\s*צוות/i,
      /מנהל/i,
      /בכיר/i,
      /מנוסה/i,
      /\b[3-9]\+?\s*(years|yrs)\b/i,
      /[3-9]\s*שנים/i,
    ],
  },
  experience: {
    label: 'דורש יותר מדי ניסיון',
    penalty: -18,
    patterns: [
      /ניסיון\s*של\s*[3-9]/i,
      /[3-9]\s*שנות\s*ניסיון/i,
      /[3-9]\+\s*שנים/i,
      /[3-9]\+?\s*(years|yrs)/i,
      /לפחות\s*[3-9]\s*שנים/i,
    ],
  },
  wrong_role: {
    label: 'סוג תפקיד לא מתאים',
    penalty: -16,
  },
  not_junior: {
    label: 'לא מספיק ג׳וניור / לא כניסה',
    penalty: -16,
    patterns: [
      /senior/i,
      /middle/i,
      /מנוסה/i,
      /לא\s*ג[׳']?וניור/i,
      /ניסיון\s*חובה/i,
    ],
  },
  tech_stack: {
    label: 'טכנולוגיות לא מתאימות',
    penalty: -12,
  },
  onsite: {
    label: 'נוכחות במשרד / היברידי לא מתאים',
    penalty: -12,
    patterns: [
      /משרה\s*מלאה\s*מהמשרד/i,
      /עבודה\s*מהמשרד/i,
      /onsite/i,
      /on-site/i,
      /5\s*ימים\s*מהמשרד/i,
    ],
  },
  already_applied: {
    label: 'כבר שלחתי / כפילות',
    penalty: -8,
  },
  other: {
    label: 'סיבה אחרת',
    penalty: -10,
  },
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'role', 'job', 'jobs',
  'דרושים', 'משרה', 'תפקיד', 'עם', 'של', 'על', 'אל', 'או', 'גם', 'ללא', 'עבודה',
  'דרוש', 'דרושה', 'דרוש/ה', 'חברה', 'לחברה', 'באזור', 'תחום', 'עבור', 'את',
]);

function safeText(value = '') {
  return normalizeText(value).replace(/[^a-z0-9א-ת+#.\s-]/gi, ' ');
}

function normalizeReason(reason = '') {
  const normalized = String(reason || '').trim();
  return REJECTION_REASONS[normalized] ? normalized : '';
}

function getJobText(job = {}) {
  return [
    job.title,
    job.company,
    job.location,
    job.locationKey,
    job.description,
    job.source,
    job.via,
    job.sourceQuery,
    job.roleFamily,
    job.roleType,
    job.roleProfileName,
  ]
    .filter(Boolean)
    .join(' ');
}

function hasPatternMatch(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function shouldApplyCustomerServiceLearningPenalty(text = '') {
  const hasApplicationSupportEvidence =
    /application\s*support|תמיכה\s*אפליקטיבית/i.test(text);

  if (!hasApplicationSupportEvidence) return true;

  return /שירות\s*לקוחות|customer\s*(?:service|support)|phone\s*support|call\s*center|help\s*desk|support\s*representative|נציג(?:\/ת)?\s*תמיכה|תמיכה\s*טלפונית|מוקד|טלפוני|שיחות/i.test(
    text,
  );
}

function isGenericLocation(location = '') {
  const normalized = normalizeText(location);
  return !normalized || ['israel', 'ישראל', 'remote', 'hybrid', 'היברידי', 'מרחוק'].includes(normalized);
}

function sameNormalized(a = '', b = '') {
  return Boolean(a && b && normalizeText(a) === normalizeText(b));
}

export function tokenizeJob(job = {}) {
  const text = safeText(getJobText(job));

  return new Set(
    text
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
      .slice(0, 160),
  );
}

function tokenOverlapScore(jobTokens, feedbackTokens) {
  let matches = 0;
  for (const token of jobTokens) {
    if (feedbackTokens.has(token)) matches += 1;
  }
  return matches;
}

function makeFeedbackSnapshot(job, action, metadata = {}) {
  const rejectionReason = normalizeReason(metadata.rejectionReason || metadata.reason);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: job.id,
    action,
    rejectionReason: rejectionReason || undefined,
    rejectionReasonLabel: rejectionReason ? REJECTION_REASONS[rejectionReason].label : undefined,
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    locationKey: job.locationKey || '',
    source: job.source || job.via || '',
    sourceQuery: job.sourceQuery || '',
    roleFamily: job.roleFamily || '',
    roleType: job.roleType || '',
    roleProfileId: job.roleProfileId || '',
    roleProfileName: job.roleProfileName || '',
    fitScore: job.fitScore ?? null,
    description: String(job.description || '').slice(0, 900),
    reviewKey: metadata.reviewKey || job.reviewKey || '',
    fromManualReview: Boolean(metadata.fromManualReview || job.fromManualReview),
    createdAt: new Date().toISOString(),
  };
}

export function createFeedbackEntry(job, action, metadata = {}) {
  if (!job?.id) throw new Error('Cannot save feedback without job id');
  if (!POSITIVE_WEIGHTS[action] && !NEGATIVE_WEIGHTS[action]) {
    throw new Error(`Unsupported feedback action: ${action}`);
  }
  return makeFeedbackSnapshot(job, action, metadata);
}

function getReasonAdjustment(job, feedbackItem) {
  const reason = normalizeReason(feedbackItem.rejectionReason);
  if (!reason) return null;

  const config = REJECTION_REASONS[reason];
  const text = getJobText(job);

  const canApplyPatternPenalty =
    reason !== 'customer_service' ||
    shouldApplyCustomerServiceLearningPenalty(text);

  if (
    canApplyPatternPenalty &&
    config.patterns?.length &&
    hasPatternMatch(text, config.patterns)
  ) {
    return {
      adjustment: config.penalty,
      warning: `למידה: בעבר פסלת משרות עם מאפיין דומה — ${config.label}.`,
    };
  }

  if (reason === 'location') {
    const sameLocationKey = sameNormalized(feedbackItem.locationKey, job.locationKey);
    const sameLocation = sameNormalized(feedbackItem.location, job.location);

    if ((sameLocationKey || sameLocation) && !isGenericLocation(job.location)) {
      return {
        adjustment: config.penalty,
        warning: `למידה: בעבר פסלת מיקום דומה (${job.location}).`,
      };
    }
  }

  if (reason === 'wrong_role') {
    const currentTitleTokens = tokenizeJob({
      title: job.title,
      sourceQuery: job.sourceQuery,
      roleFamily: job.roleFamily,
      roleType: job.roleType,
      roleProfileName: job.roleProfileName,
    });
    const rejectedTitleTokens = tokenizeJob({
      title: feedbackItem.title,
      sourceQuery: feedbackItem.sourceQuery,
      roleFamily: feedbackItem.roleFamily,
      roleType: feedbackItem.roleType,
      roleProfileName: feedbackItem.roleProfileName,
    });
    const overlap = tokenOverlapScore(currentTitleTokens, rejectedTitleTokens);

    if (overlap >= 2 || sameNormalized(feedbackItem.roleType, job.roleType)) {
      return {
        adjustment: config.penalty,
        warning: 'למידה: בעבר פסלת תפקיד דומה.',
      };
    }
  }

  return null;
}

function getDirectSimilarityAdjustment(job, item) {
  const weight = POSITIVE_WEIGHTS[item.action] ?? NEGATIVE_WEIGHTS[item.action] ?? 0;
  if (!weight) return 0;

  let multiplier = 0;

  if (sameNormalized(item.company, job.company) && item.company) multiplier += 0.5;
  if (sameNormalized(item.locationKey, job.locationKey) && job.locationKey) multiplier += 0.45;
  if (sameNormalized(item.roleType, job.roleType) && job.roleType) multiplier += 0.55;
  if (sameNormalized(item.roleProfileId, job.roleProfileId) && job.roleProfileId) multiplier += 0.65;
  if (sameNormalized(item.source, job.source || job.via) && item.source) multiplier += 0.25;

  if (multiplier === 0) return 0;
  return weight * Math.min(1.2, multiplier);
}

export function getLearningAdjustment(job, feedback = []) {
  if (!Array.isArray(feedback) || feedback.length === 0) {
    return { adjustment: 0, reasons: [], warnings: [] };
  }

  const jobTokens = tokenizeJob(job);
  const reasons = [];
  const warnings = [];
  let adjustment = 0;

  for (const item of feedback.slice(-400)) {
    if (!item || item.jobId === job.id) continue;

    const reasonAdjustment = getReasonAdjustment(job, item);
    if (reasonAdjustment) {
      adjustment += reasonAdjustment.adjustment;
      warnings.push(reasonAdjustment.warning);
      continue;
    }

    const directAdjustment = getDirectSimilarityAdjustment(job, item);
    if (directAdjustment) {
      adjustment += directAdjustment;
    }

    const weight = POSITIVE_WEIGHTS[item.action] ?? NEGATIVE_WEIGHTS[item.action] ?? 0;
    if (!weight) continue;

    const feedbackTokens = tokenizeJob(item);
    const overlap = tokenOverlapScore(jobTokens, feedbackTokens);
    if (overlap < 2) continue;

    const sameLocation = item.location && job.location && sameNormalized(item.location, job.location);
    const sameSource = item.source && (job.source || job.via) && sameNormalized(item.source, job.source || job.via);

    let localAdjustment = Math.min(Math.abs(weight), overlap * 1.4);
    if (sameLocation && !isGenericLocation(job.location)) localAdjustment += 2;
    if (sameSource) localAdjustment += 1;

    adjustment += weight > 0 ? localAdjustment : -localAdjustment;
  }

  adjustment = Math.max(-32, Math.min(22, Math.round(adjustment)));

  if (adjustment >= 4) {
    reasons.push(`למידה: משרות דומות נשמרו או סומנו כהוגשו בעבר (+${adjustment}).`);
  } else if (adjustment <= -4) {
    warnings.push(`למידה: משרות דומות נדחו בעבר (${adjustment}).`);
  }

  return {
    adjustment,
    reasons: [...new Set(reasons)].slice(0, 3),
    warnings: [...new Set(warnings)].slice(0, 6),
  };
}
