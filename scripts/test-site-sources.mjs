import { readFile } from 'node:fs/promises';
import { searchSiteSources } from '../server/src/siteSourcesCrawler.js';

const query = process.argv.slice(2).join(' ') || 'QA חיפה';
const siteSources = JSON.parse(await readFile('./data/siteSources.json', 'utf8'));

console.log(`בודק מקורות אתרים עבור: ${query}`);
const results = await searchSiteSources({ query, siteSources });

console.log(`נמצאו ${results.length} תוצאות גולמיות`);
console.table(
  results.slice(0, 15).map((item) => ({
    מקור: item.sourceName,
    כותרת: item.title,
    קישור: item.link,
  })),
);
