import fs from 'node:fs';
import { ROLE_PROFILES_FILE } from './paths.js';
import { normalizeText } from './utils.js';

function readRoleProfiles() {
  try {
    if (!fs.existsSync(ROLE_PROFILES_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(ROLE_PROFILES_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`לא ניתן לקרוא את קובץ פרופילי התפקידים: ${error.message}`);
    return [];
  }
}

function toRegex(pattern = '') {
  const value = String(pattern || '').trim();
  if (!value) return null;

  try {
    return new RegExp(value, 'i');
  } catch {
    return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
}

function buildJobText(job = {}) {
  return [
    job.title,
    job.company,
    job.location,
    job.description,
    job.sourceQuery,
    job.rawText,
  ]
    .filter(Boolean)
    .join(' ');
}

function matchesAny(text, patterns = []) {
  return patterns
    .map(toRegex)
    .filter(Boolean)
    .some((regex) => regex.test(text));
}

export function getRoleProfiles() {
  return readRoleProfiles().filter((profile) => profile && profile.enabled !== false);
}

export function getRoleProfileById(id = '') {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return null;
  return getRoleProfiles().find((profile) => profile.id === normalizedId) || null;
}

export function applyRoleProfiles(job = {}) {
  const text = buildJobText(job);
  const normalizedText = normalizeText(text);

  for (const profile of getRoleProfiles()) {
    const positivePatterns = profile.positivePatterns || [];
    const negativePatterns = profile.negativePatterns || [];

    const matchedPositive =
      matchesAny(text, positivePatterns) ||
      positivePatterns.some((pattern) => normalizedText.includes(normalizeText(pattern)));

    if (!matchedPositive) continue;

    const matchedNegative = matchesAny(text, negativePatterns);
    if (matchedNegative) continue;

    const existingRoleLooksGood =
      job.isRelevantRole === true &&
      job.roleFamily &&
      job.roleFamily !== 'unknown' &&
      job.roleConfidence === 'high';

    if (existingRoleLooksGood && profile.overrideExisting !== true) {
      return {
        ...job,
        roleProfileId: profile.id,
        roleProfileName: profile.name,
        roleProfileMatched: true,
      };
    }

    return {
      ...job,
      roleFamily: profile.roleFamily || 'custom',
      roleType: profile.roleType || profile.id,
      isRelevantRole: true,
      roleConfidence: profile.roleConfidence || 'medium',
      roleSignals: [...(job.roleSignals || []), `profile:${profile.id}`],
      roleProfileId: profile.id,
      roleProfileName: profile.name,
      roleProfileMatched: true,
      mainListMinScore: Number(profile.mainListMinScore || 55),
      roleProfileScoreBonus: Number(profile.scoreBonus || 24),
    };
  }

  return job;
}
