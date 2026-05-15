import { JOBS_FILE, KEYWORDS_FILE, PROFILE_FILE } from './paths.js';
import { readJson, writeJson } from './fileStore.js';
import { createJobId, getBestApplyLink, uniqueById } from './utils.js';
import { scoreJob } from './scoring.js';
import { searchGoogleJobs } from './serpApi.js';

function normalizeSerpJob(result, sourceQuery) {
  const job = {
    title: result.title || 'Untitled job',
    company: result.company_name || 'Unknown company',
    location: result.location || 'Israel',
    description: result.description || '',
    via: result.via || '',
    source: 'SerpApi Google Jobs',
    sourceQuery,
    url: getBestApplyLink(result),
    jobIdFromSource: result.job_id || '',
    foundAt: new Date().toISOString(),
    status: 'found'
  };

  return {
    id: createJobId(job),
    ...job
  };
}

export async function findJobs({ useMock = false } = {}) {
  const [profile, keywords, existingJobs] = await Promise.all([
    readJson(PROFILE_FILE, {}),
    readJson(KEYWORDS_FILE, {}),
    readJson(JOBS_FILE, [])
  ]);

  let incomingJobs = [];

  if (useMock) {
    incomingJobs = getMockJobs();
  } else {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey || apiKey === 'put_your_key_here') {
      throw new Error('Missing SERPAPI_API_KEY. Add it to server/.env or use mock mode.');
    }

    const allQueries = [...(keywords.queries || []), ...(keywords.siteQueries || [])];
    const pagesPerQuery = Math.max(1, Number(process.env.SERPAPI_PAGES_PER_QUERY || 1));

    for (const query of allQueries) {
      for (const location of keywords.locations || ['Israel']) {
        let nextPageToken;
        for (let page = 0; page < pagesPerQuery; page += 1) {
          const data = await searchGoogleJobs({ apiKey, query, location, nextPageToken });
          const results = data.jobs_results || [];
          incomingJobs.push(...results.map((result) => normalizeSerpJob(result, query)));
          nextPageToken = data.serpapi_pagination?.next_page_token;
          if (!nextPageToken) break;
        }
      }
    }
  }

  const scoredIncoming = incomingJobs.map((job) => ({
    ...job,
    ...scoreJob(job, profile, keywords)
  }));

  const existingById = new Map(existingJobs.map((job) => [job.id, job]));
  const newJobs = [];

  for (const job of scoredIncoming) {
    if (!existingById.has(job.id)) {
      newJobs.push(job);
      existingById.set(job.id, job);
    }
  }

  const merged = uniqueById([...existingById.values()])
    .sort((a, b) => new Date(b.foundAt) - new Date(a.foundAt));

  await writeJson(JOBS_FILE, merged);

  return {
    scanned: incomingJobs.length,
    newJobs: newJobs.length,
    totalJobs: merged.length,
    jobs: merged,
    added: newJobs
  };
}

export function getMockJobs() {
  const now = new Date().toISOString();
  return [
    {
      id: 'mock-qa-automation-tel-aviv',
      title: 'Junior QA Automation Engineer',
      company: 'Example Security Company',
      location: 'Tel Aviv, Israel',
      description: 'Junior QA role working with API testing, JavaScript, automation scripts and Playwright. Hybrid work.',
      via: 'Mock',
      source: 'Mock',
      sourceQuery: 'Junior QA Israel',
      url: 'https://example.com/jobs/qa-automation',
      foundAt: now,
      status: 'found'
    },
    {
      id: 'mock-risk-analyst-israel',
      title: 'Junior Risk Analyst',
      company: 'Example Fintech',
      location: 'Ramat Gan, Israel',
      description: 'Entry level risk analyst role. SQL advantage. Fraud monitoring, suspicious patterns, operational analysis.',
      via: 'Mock',
      source: 'Mock',
      sourceQuery: 'Risk Analyst Israel junior',
      url: 'https://example.com/jobs/risk-analyst',
      foundAt: now,
      status: 'found'
    },
    {
      id: 'mock-senior-manager-skip',
      title: 'Senior QA Team Lead',
      company: 'Example Enterprise',
      location: 'Israel',
      description: 'Senior manager role, 7+ years experience, team lead responsibilities.',
      via: 'Mock',
      source: 'Mock',
      sourceQuery: 'QA Israel',
      url: 'https://example.com/jobs/senior-qa-lead',
      foundAt: now,
      status: 'found'
    }
  ];
}
