import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rootDir = process.cwd();
const roleProfilesPath = path.join(rootDir, 'data', 'roleProfiles.json');
const keywordsPath = path.join(rootDir, 'data', 'keywords.json');

const PRESETS = {};

function parseArgs(argv = []) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;

    const key = item.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function slugify(value = '') {
  const fallback = `role_${Date.now()}`;
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, '_')
    .replace(/[^a-z0-9_א-ת-]/gi, '')
    .replace(/^_+|_+$/g, '');

  return slug || fallback;
}

function splitList(value = '') {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeUnique(existing = [], added = []) {
  return [...new Set([...existing, ...added].filter(Boolean))];
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function saveRoleProfile(profile) {
  const roleProfiles = await readJson(roleProfilesPath, []);
  const filteredProfiles = roleProfiles.filter((item) => item.id !== profile.id);

  filteredProfiles.push({
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled ?? true,
    roleFamily: profile.roleFamily || 'custom',
    roleType: profile.roleType || profile.id,
    mainListMinScore: Number.isFinite(Number(profile.mainListMinScore))
      ? Number(profile.mainListMinScore)
      : 58,
    scoreBonus: Number.isFinite(Number(profile.scoreBonus))
      ? Number(profile.scoreBonus)
      : 28,
    queries: splitList(profile.queries),
    positivePatterns: splitList(profile.positivePatterns),
    negativePatterns: splitList(profile.negativePatterns),
  });

  await writeJson(roleProfilesPath, filteredProfiles);

  const keywords = await readJson(keywordsPath, { queries: [], exclude: [] });
  keywords.queries = mergeUnique(keywords.queries || [], splitList(profile.queries));

  if (!Array.isArray(keywords.exclude)) {
    keywords.exclude = [];
  }

  await writeJson(keywordsPath, keywords);
}

function applyCliOverrides(baseProfile, args) {
  const profile = { ...baseProfile };

  if (args.id) profile.id = slugify(args.id);
  if (args.name) profile.name = args.name;
  if (args.family) profile.roleFamily = args.family;
  if (args.type) profile.roleType = args.type;
  if (args['min-score']) profile.mainListMinScore = Number(args['min-score']);
  if (args.bonus) profile.scoreBonus = Number(args.bonus);
  if (args.queries) profile.queries = splitList(args.queries);
  if (args.positive) profile.positivePatterns = splitList(args.positive);
  if (args.negative) profile.negativePatterns = splitList(args.negative);

  return profile;
}

async function askInteractiveProfile() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('Add a new role to the job finder');
    console.log('The questions are in English to avoid RTL issues in PowerShell. Hebrew values are supported.');
    console.log('');

    const name = (await rl.question('Display name: ')).trim();
    if (!name) throw new Error('Display name is required.');

    const idDefault = slugify(name);
    const idAnswer = (await rl.question(`Internal role id (${idDefault}): `)).trim();
    const id = slugify(idAnswer || idDefault);

    const family =
      (await rl.question('Role family: qa / analysis / information / information_systems / operations / custom (default custom): ')).trim() ||
      'custom';

    const type =
      (await rl.question(`Internal role type (${id}): `)).trim() ||
      id;

    const minScoreAnswer =
      (await rl.question('Minimum score for main list (default 58): ')).trim();

    const scoreBonusAnswer =
      (await rl.question('Score bonus when role matches (default 28): ')).trim();

    console.log('');
    console.log('Use comma-separated values.');
    console.log('');

    const queryText = await rl.question('Search queries: ');
    const positiveText = await rl.question('Positive role keywords/patterns: ');
    const negativeText = await rl.question('Negative keywords/patterns: ');

    const queries = splitList(queryText);
    const positivePatterns = splitList(positiveText);
    const negativePatterns = splitList(negativeText);

    if (!queries.length) {
      queries.push(`${name} חיפה`, `${name} צפון`);
    }

    if (!positivePatterns.length) {
      positivePatterns.push(name);
    }

    return {
      id,
      name,
      enabled: true,
      roleFamily: family,
      roleType: type,
      mainListMinScore: Number(minScoreAnswer || 58),
      scoreBonus: Number(scoreBonusAnswer || 28),
      queries,
      positivePatterns,
      negativePatterns,
    };
  } finally {
    rl.close();
  }
}

function printHelp() {
  console.log(`
Add a role to Israeli Job Finder

Usage:
  node ./scripts/add-role.mjs

Available presets:
  ${Object.keys(PRESETS).join(', ') || 'none'}

Manual CLI example:
  node ./scripts/add-role.mjs --id document_control --name "Document Control" --family information --type document_control --min-score 55 --queries "document control חיפה, בקרת מסמכים קריות" --positive "document control, בקרת מסמכים" --negative "senior, טלפוני, מרכז"

Notes:
  --queries, --positive and --negative are comma-separated.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    return;
  }

  let profile;

  if (args.preset) {
    const preset = PRESETS[args.preset];

    if (!preset) {
      throw new Error(
        `Unknown preset "${args.preset}". Available presets: ${Object.keys(PRESETS).join(', ')}`,
      );
    }

    profile = applyCliOverrides(preset, args);
  } else if (args.name || args.id) {
    const displayName = args.name || args.id;

    const baseProfile = {
      id: slugify(args.id || displayName),
      name: displayName,
      enabled: true,
      roleFamily: args.family || 'custom',
      roleType: args.type || slugify(args.id || displayName),
      mainListMinScore: Number(args['min-score'] || 58),
      scoreBonus: Number(args.bonus || 28),
      queries: splitList(args.queries || `${displayName} חיפה, ${displayName} צפון`),
      positivePatterns: splitList(args.positive || displayName),
      negativePatterns: splitList(args.negative || ''),
    };

    profile = applyCliOverrides(baseProfile, args);
  } else {
    profile = await askInteractiveProfile();
  }

  if (!profile.name) {
    throw new Error('Role name is required.');
  }

  profile.id = slugify(profile.id || profile.name);

  await saveRoleProfile(profile);

  console.log('');
  console.log('Role added/updated successfully.');
  console.log(`Name: ${profile.name}`);
  console.log(`ID: ${profile.id}`);
  console.log(`Queries: ${splitList(profile.queries).length}`);
  console.log('The next scan will search and score this role.');
}

main().catch((error) => {
  console.error('');
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
