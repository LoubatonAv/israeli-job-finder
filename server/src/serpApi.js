const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

export async function searchGoogleJobs({
  apiKey,
  query,
  location = "Israel",
  nextPageToken,
}) {
  const params = new URLSearchParams({
    engine: "google_jobs",
    q: query,
    location,
    hl: "en",
    gl: "il",
    google_domain: "google.com",
    api_key: apiKey,
  });

  if (nextPageToken) params.set("next_page_token", nextPageToken);

  const url = `${SERPAPI_ENDPOINT}?${params.toString()}`;
  console.log(`SerpApi URL: ${url.replace(apiKey, "HIDDEN_API_KEY")}`);

  const response = await fetch(url);
  const data = await response.json();
  console.log("SerpApi response keys:", Object.keys(data));
  console.log("SerpApi error:", data.error);
  console.log("Jobs count:", data.jobs_results?.length);
  console.log("Raw preview:", JSON.stringify(data, null, 2).slice(0, 1500));
  if (!response.ok) {
    throw new Error(
      data.error || `SerpApi request failed with ${response.status}`,
    );
  }

  if (data.error?.includes("Google hasn't returned any results")) {
    return {
      jobs_results: [],
      serpapi_pagination: null,
    };
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}
