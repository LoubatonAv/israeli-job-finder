function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function extractSignals(job = {}) {
  const text = [
    job.title,
    job.company,
    job.location,
    job.description,
    job.sourceQuery,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const signals = {
    hasShiftSignal: false,
    hasPhoneSignal: false,
    hasSeniorSignal: false,
    hasSalesSignal: false,
    hasNoExperienceSignal: false,
    badSignals: [],
  };

  if (hasAny(text, [/משמרות/i, /לילות/i, /שבת/i, /חגים/i, /סופי\s*שבוע/i, /כוננות/i, /shift/i, /night/i, /weekend/i])) {
    signals.hasShiftSignal = true;
    signals.badSignals.push("shifts");
  }

  if (hasAny(text, [/טלפוני/i, /מוקד/i, /שיחות/i, /שירות\s*לקוחות/i, /נציג/i, /call\s*center/i, /customer\s*service/i])) {
    signals.hasPhoneSignal = true;
    signals.badSignals.push("phone");
  }

  if (hasAny(text, [/senior/i, /ראש\s*צוות/i, /ר["״]?צ/i, /team\s*lead/i, /manager/i, /ניהול/i, /מנהל/i, /בכיר/i])) {
    signals.hasSeniorSignal = true;
    signals.badSignals.push("senior");
  }

  if (hasAny(text, [/מכירות/i, /\\bsales\\b/i, /sales\\s*(?:rep|representative|manager)/i, /business\\s*development/i, /account\\s*executive/i])) {
    signals.hasSalesSignal = true;
    signals.badSignals.push("sales");
  }

  if (hasAny(text, [/ללא ניסיון/i, /ללא נסיון/i, /junior/i, /ג׳וניור/i, /ג'וניור/i])) {
    signals.hasNoExperienceSignal = true;
  }

  return signals;
}
