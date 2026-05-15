import { normalizeText } from './utils.js';

function countMatches(text, words = []) {
  const normalized = normalizeText(text);
  return words.filter((word) => normalized.includes(normalizeText(word))).length;
}

function findMatches(text, words = []) {
  const normalized = normalizeText(text);
  return words.filter((word) => normalized.includes(normalizeText(word)));
}

export function scoreJob(job, profile, keywords) {
  const text = [job.title, job.company, job.location, job.description, job.via].filter(Boolean).join(' ');
  const reasons = [];
  const warnings = [];

  let score = 35;

  const roleMatches = findMatches(text, profile.targetRoles || []);
  if (roleMatches.length) {
    score += Math.min(30, roleMatches.length * 10);
    reasons.push(`Matches target role keywords: ${roleMatches.slice(0, 4).join(', ')}`);
  }

  const positiveMatches = findMatches(text, profile.positiveKeywords || []);
  if (positiveMatches.length) {
    score += Math.min(25, positiveMatches.length * 4);
    reasons.push(`Positive signals: ${positiveMatches.slice(0, 6).join(', ')}`);
  }

  const locationMatches = findMatches(text, profile.preferences?.preferredLocations || []);
  if (locationMatches.length || normalizeText(job.location).includes('israel')) {
    score += 15;
    reasons.push('Location looks relevant for Israel / remote Israel.');
  }

  const excludedMatches = findMatches(text, keywords.exclude || []);
  if (excludedMatches.length) {
    const penalty = Math.min(45, excludedMatches.length * 12);
    score -= penalty;
    warnings.push(`Possible mismatch: ${excludedMatches.slice(0, 5).join(', ')}`);
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
    reasons.push(`Your skills mentioned: ${skillMatches.slice(0, 5).join(', ')}`);
  }

  if (!job.url) {
    score -= 8;
    warnings.push('No direct application link was found.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = 'review';
  if (score >= 75) recommendation = 'apply';
  if (score < 45) recommendation = 'skip';

  return {
    fitScore: score,
    recommendation,
    reasons: reasons.length ? reasons : ['General match, but not enough strong positive signals.'],
    warnings
  };
}
