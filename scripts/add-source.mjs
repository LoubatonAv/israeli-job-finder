import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SOURCES_PATH = new URL('../data/siteSources.json', import.meta.url);

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9א-ת]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function readSources() {
  try {
    const parsed = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDomain(value = '') {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

const rl = readline.createInterface({ input, output });

try {
  console.log('הוספת מקור חיפוש חדש');
  console.log('המערכת תחפש במקור החדש דרך Google/Playwright עם site:domain.');
  console.log('');

  const name = (await rl.question('שם המקור בעברית: ')).trim();
  const domain = normalizeDomain(await rl.question('דומיין, למשל example.co.il: '));
  const extraQuery = (await rl.question('מילת עזר לחיפוש (אפשר להשאיר ריק, מומלץ: דרושים): ')).trim() || 'דרושים';
  const enabledAnswer = (await rl.question('להפעיל כבר עכשיו? כן/לא [כן]: ')).trim().toLowerCase();
  const blocked = (await rl.question('נתיבים לחסימה, מופרדים בפסיקים (למשל /blog,/article): ')).trim();

  if (!name || !domain) {
    throw new Error('חובה למלא שם ודומיין.');
  }

  const sources = await readSources();
  const id = slugify(domain.split('.')[0] || name);
  const nextSource = {
    id,
    name,
    domain,
    description: `מקור שנוסף ידנית: ${name}`,
    enabled: enabledAnswer !== 'לא' && enabledAnswer !== 'no',
    extraQuery,
    blockedPathPatterns: blocked
      ? blocked.split(',').map((item) => item.trim()).filter(Boolean)
      : [],
  };

  const withoutExisting = sources.filter((source) => source.id !== id && source.domain !== domain);
  withoutExisting.push(nextSource);

  await fs.writeFile(SOURCES_PATH, `${JSON.stringify(withoutExisting, null, 2)}\n`, 'utf8');

  console.log('');
  console.log(`נוסף מקור: ${name} (${domain})`);
  console.log('כדי להשתמש בו, ודא שב־SEARCH_PROVIDERS יש גם sites.');
} finally {
  rl.close();
}
