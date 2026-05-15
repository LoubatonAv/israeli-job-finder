const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

export async function searchGoogleJobs({ apiKey, query, location = 'Israel', nextPageToken }) {
  const params = new URLSearchParams({
    engine: 'google_jobs',
    q: query,
    location,
    hl: 'en',
    gl: 'il',
    google_domain: 'google.co.il',
    api_key: apiKey
  });

  if (nextPageToken) params.set('next_page_token', nextPageToken);

  const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `SerpApi request failed with ${response.status}`);
  }

  return data;
}
