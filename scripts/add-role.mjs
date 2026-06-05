import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rootDir = process.cwd();
const roleProfilesPath = path.join(rootDir, 'data', 'roleProfiles.json');
const keywordsPath = path.join(rootDir, 'data', 'keywords.json');

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
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

const rl = readline.createInterface({ input, output });

try {
  console.log('הוספת תפקיד חדש למערכת');
  console.log('אפשר להשאיר שדות ריקים ולקבל ברירת מחדל.');

  const name = (await rl.question('שם התפקיד בעברית: ')).trim();
  if (!name) throw new Error('חייבים להזין שם תפקיד.');

  const idAnswer = (await rl.question(`מזהה פנימי (${slugify(name)}): `)).trim();
  const id = slugify(idAnswer || name);

  const family = (await rl.question('משפחה: qa / analysis / information_systems / operations / custom (ברירת מחדל custom): ')).trim() || 'custom';
  const type = (await rl.question(`סוג תפקיד פנימי (${id}): `)).trim() || id;
  const minScoreAnswer = (await rl.question('ציון מינימלי לרשימה הראשית (ברירת מחדל 58): ')).trim();
  const mainListMinScore = Number(minScoreAnswer || 58);

  const queryText = await rl.question('שאילתות חיפוש, מופרדות בפסיקים: ');
  const positiveText = await rl.question('מילים/ביטויים שמזהים את התפקיד, מופרדים בפסיקים: ');
  const negativeText = await rl.question('מילים שפוסלות או מחלישות, מופרדות בפסיקים: ');

  const queries = splitList(queryText);
  const positivePatterns = splitList(positiveText);
  const negativePatterns = splitList(negativeText);

  if (!queries.length) {
    queries.push(`${name} חיפה`, `${name} צפון`);
  }

  if (!positivePatterns.length) {
    positivePatterns.push(name);
  }

  const roleProfiles = await readJson(roleProfilesPath, []);
  const filteredProfiles = roleProfiles.filter((profile) => profile.id !== id);

  filteredProfiles.push({
    id,
    name,
    enabled: true,
    roleFamily: family,
    roleType: type,
    mainListMinScore: Number.isFinite(mainListMinScore) ? mainListMinScore : 58,
    scoreBonus: 28,
    queries,
    positivePatterns,
    negativePatterns,
  });

  await writeJson(roleProfilesPath, filteredProfiles);

  const keywords = await readJson(keywordsPath, { queries: [], exclude: [] });
  const querySet = new Set([...(keywords.queries || []), ...queries]);
  keywords.queries = [...querySet];
  await writeJson(keywordsPath, keywords);

  console.log('התפקיד נוסף בהצלחה.');
  console.log(`נוסף/עודכן: ${name} (${id})`);
  console.log('בסריקה הבאה המערכת תחפש ותדרג גם את התפקיד הזה.');
} finally {
  rl.close();
}
