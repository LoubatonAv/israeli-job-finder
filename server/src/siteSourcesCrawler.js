import { searchWithPlaywright } from './playwrightCrawler.js';

const DEFAULT_RESULTS_PER_SOURCE = Number.parseInt(
  process.env.SITE_SOURCE_RESULTS_PER_SOURCE || '6',
  10,
);

function normalizeUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function hostnameMatches(url = '', domain = '') {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    const cleanDomain = String(domain || '').replace(/^www\./i, '').toLowerCase();
    return host === cleanDomain || host.endsWith(`.${cleanDomain}`);
  } catch {
    return false;
  }
}

function isBlockedByPath(url = '', patterns = []) {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(url);
    } catch {
      return String(url).toLowerCase().includes(String(pattern).toLowerCase());
    }
  });
}

function buildSiteQuery(query = '', source = {}) {
  const extra = source.extraQuery ? ` ${source.extraQuery}` : '';
  return `${query}${extra} site:${source.domain}`.replace(/\s+/g, ' ').trim();
}

function mapResult(result = {}, source = {}, originalQuery = '', searchQuery = '') {
  const title = result.title || result.snippet || 'משרה ללא כותרת';
  const snippet = result.snippet || result.description || '';

  return {
    title,
    company: result.company || source.companyFallback || source.name || 'אתר מקור',
    location: result.location || 'Israel',
    description: [snippet, source.description].filter(Boolean).join(' · '),
    sourceName: source.name || source.domain,
    via: source.name || source.domain,
    link: normalizeUrl(result.link),
    jobIdFromSource: normalizeUrl(result.link),
    originalQuery,
    searchQuery,
    sourceDomain: source.domain,
  };
}

export async function searchSiteSources({ query, siteSources = [] } = {}) {
  const enabledSources = (Array.isArray(siteSources) ? siteSources : [])
    .filter((source) => source && source.enabled !== false && source.domain)
    .slice(0, Number.parseInt(process.env.SITE_SOURCES_MAX_SOURCES || '8', 10));

  const resultsByUrl = new Map();

  for (const source of enabledSources) {
    const searchQuery = buildSiteQuery(query, source);

    try {
      console.log(`Searching ${source.name || source.domain}: "${searchQuery}"`);

      const rawResults = await searchWithPlaywright({ query: searchQuery });
      const limitedResults = rawResults
        .filter((result) => result?.link && result?.title)
        .filter((result) => hostnameMatches(result.link, source.domain))
        .filter((result) => !isBlockedByPath(result.link, source.blockedPathPatterns || []))
        .slice(0, Number.isFinite(DEFAULT_RESULTS_PER_SOURCE) ? DEFAULT_RESULTS_PER_SOURCE : 6);

      for (const result of limitedResults) {
        const mapped = mapResult(result, source, query, searchQuery);
        if (!mapped.link) continue;
        if (!resultsByUrl.has(mapped.link)) {
          resultsByUrl.set(mapped.link, mapped);
        }
      }
    } catch (error) {
      console.warn(
        `Skipped site source "${source.name || source.domain}" for query "${query}": ${error.message}`,
      );
      if (String(process.env.DEBUG_JOBS || '').toLowerCase() === 'true') {
        console.warn(error.stack || error);
      }
    }
  }

  return [...resultsByUrl.values()];
}
