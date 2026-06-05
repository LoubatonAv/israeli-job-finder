import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const jsFiles = [
  'server/src/findJobs.js',
  'server/src/siteSourcesCrawler.js',
  'server/src/server.js',
  'server/src/scoring.js',
  'server/src/learning.js',
  'server/src/roleProfiles.js',
  'server/src/utils.js',
  'scripts/add-role.mjs',
  'scripts/add-source.mjs',
  'scripts/check-project.mjs',
];

const jsonFiles = [
  'data/keywords.json',
  'data/profile.json',
  'data/roleProfiles.json',
  'data/siteSources.json',
];

function checkJs(file) {
  if (!fs.existsSync(file)) return { file, ok: false, message: 'לא נמצא' };
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  return { file, ok: true };
}

function checkJson(file) {
  if (!fs.existsSync(file)) return { file, ok: false, message: 'לא נמצא' };
  JSON.parse(fs.readFileSync(file, 'utf8'));
  return { file, ok: true };
}

let failed = false;

console.log('בדיקת קבצי JavaScript');
for (const file of jsFiles) {
  try {
    const result = checkJs(file);
    console.log(`${result.ok ? '✓' : '✗'} ${file}${result.message ? ` — ${result.message}` : ''}`);
    if (!result.ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(`✗ ${file}`);
    console.log(String(error.stderr || error.message));
  }
}

console.log('');
console.log('בדיקת קבצי JSON');
for (const file of jsonFiles) {
  try {
    const result = checkJson(file);
    console.log(`${result.ok ? '✓' : '✗'} ${file}${result.message ? ` — ${result.message}` : ''}`);
    if (!result.ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(`✗ ${file}`);
    console.log(error.message);
  }
}

if (failed) {
  console.log('');
  console.log('נמצאו בעיות. תקן אותן לפני הרצה.');
  process.exit(1);
}

console.log('');
console.log('הכול נראה תקין. אפשר להריץ npm run dev.');
