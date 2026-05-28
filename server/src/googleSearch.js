const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

export async function searchGoogleOrganic({
  apiKey,
  query,
  location = "Israel",
}) {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    location,
    hl: "en",
    gl: "il",
    google_domain: "google.com",
    api_key: apiKey,
  });

  const url = `${SERPAPI_ENDPOINT}?${params.toString()}`;
  console.log(`Google Search URL: ${url.replace(apiKey, "HIDDEN_API_KEY")}`);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error || `Google Search failed with ${response.status}`,
    );
  }

  return data;
}
