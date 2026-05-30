import { normalizeText } from './utils.js';

const POSITIVE_WEIGHTS = {
  saved: 6,
  applied: 12,
  interview: 16,
};

const NEGATIVE_WEIGHTS = {
  skipped: -10,
  rejected: -8,
  deleted: -12,
  not_relevant: -14,
};

export const REJECTION_REASONS = {
  location: {
    label: 'Location not relevant',
    penalty: -14,
  },
  shifts: {
    label: 'Shifts / nights / weekends',
    penalty: -16,
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
    ],
  },
  phone: {
    label: 'Too phone/customer-service heavy',
    penalty: -16,
    patterns: [
      /טלפוני/i,
      /מוקד/i,
      /שיחות/i,
      /שירות\s*לקוחות/i,
      /נציג/i,
      /call\s*center/i,
      /customer\s*service/i,
    ],
  },
  senior: {
    label: 'Too senior / management',
    penalty: -18,
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
  wrong_role: {
    label: 'Wrong role type',
    penalty: -12,
  },
  other: {
    label: 'Other reason',
    penalty: -8,
  },
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'role', 'job', 'jobs',
  'דרושים', 'משרה', 'תפקיד', 'עם', 'של', 'על', 'אל', 'או', 'גם', 'ללא', 'עבודה',
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
    job.description,
    job.source,
    job.via,
    job.sourceQuery,
  ].filter(Boolean).join(' ');
}

function hasPatternMatch(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function isGenericLocation(location = '') {
  const normalized = normalizeText(location);
  return !normalized || ['israel', 'ישראל', 'remote', 'hybrid', 'היברידי', 'מרחוק'].includes(normalized);
}

export function tokenizeJob(job = {}) {
  const text = safeText(getJobText(job));

  return new Set(
    text
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
      .slice(0, 120),
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
    source: job.source || job.via || '',
    sourceQuery: job.sourceQuery || '',
    description: String(job.description || '').slice(0, 600),
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

  if (config.patterns?.length && hasPatternMatch(text, config.patterns)) {
    return {
      adjustment: config.penalty,
      warning: `Learning penalty: you rejected similar ${config.label.toLowerCase()} jobs before (${config.penalty}).`,
    };
  }

  if (reason === 'location') {
    const rejectedLocation = normalizeText(feedbackItem.location || '');
    const currentLocation = normalizeText(job.location || '');

    if (rejectedLocation && currentLocation && rejectedLocation === currentLocation && !isGenericLocation(currentLocation)) {
      return {
        adjustment: config.penalty,
        warning: `Learning penalty: you rejected this location before (${job.location}).`,
      };
    }
  }

  if (reason === 'wrong_role') {
    const currentTitleTokens = tokenizeJob({ title: job.title, sourceQuery: job.sourceQuery });
    const rejectedTitleTokens = tokenizeJob({ title: feedbackItem.title, sourceQuery: feedbackItem.sourceQuery });
    const overlap = tokenOverlapScore(currentTitleTokens, rejectedTitleTokens);

    if (overlap >= 2) {
      return {
        adjustment: config.penalty,
        warning: `Learning penalty: you rejected similar role titles before (${config.penalty}).`,
      };
    }
  }

  return null;
}

export function getLearningAdjustment(job, feedback = []) {
  if (!Array.isArray(feedback) || feedback.length === 0) {
    return { adjustment: 0, reasons: [], warnings: [] };
  }

  const jobTokens = tokenizeJob(job);
  const reasons = [];
  const warnings = [];
  let adjustment = 0;

  for (const item of feedback.slice(-250)) {
    if (!item || item.jobId === job.id) continue;

    const reasonAdjustment = getReasonAdjustment(job, item);
    if (reasonAdjustment) {
      adjustment += reasonAdjustment.adjustment;
      warnings.push(reasonAdjustment.warning);
      continue;
    }

    const weight = POSITIVE_WEIGHTS[item.action] ?? NEGATIVE_WEIGHTS[item.action] ?? 0;
    if (!weight) continue;

    const feedbackTokens = tokenizeJob(item);
    const overlap = tokenOverlapScore(jobTokens, feedbackTokens);
    if (overlap < 2) continue;

    const sameLocation = item.location && job.location && normalizeText(item.location) === normalizeText(job.location);
    const sameSource = item.source && (job.source || job.via) && normalizeText(item.source) === normalizeText(job.source || job.via);

    let localAdjustment = Math.min(Math.abs(weight), overlap * 1.5);
    if (sameLocation && !isGenericLocation(job.location)) localAdjustment += 1.5;
    if (sameSource) localAdjustment += 1;

    adjustment += weight > 0 ? localAdjustment : -localAdjustment;
  }

  adjustment = Math.max(-24, Math.min(18, Math.round(adjustment)));

  if (adjustment >= 4) {
    reasons.push(`Learning boost: similar jobs were saved/applied before (+${adjustment}).`);
  } else if (adjustment <= -4) {
    warnings.push(`Learning penalty: similar jobs were rejected before (${adjustment}).`);
  }

  return {
    adjustment,
    reasons: [...new Set(reasons)].slice(0, 3),
    warnings: [...new Set(warnings)].slice(0, 5),
  };
}
