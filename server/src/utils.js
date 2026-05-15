export function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function createJobId(job) {
  const raw = [job.title, job.company, job.location, job.url].filter(Boolean).join('|');
  return normalizeText(raw)
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9א-ת]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function uniqueById(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.id) continue;
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

export function getBestApplyLink(jobResult) {
  const relatedLinks = jobResult.related_links || [];
  const extensions = jobResult.detected_extensions || {};
  const applyOptions = jobResult.apply_options || [];

  if (applyOptions[0]?.link) return applyOptions[0].link;
  if (jobResult.share_link) return jobResult.share_link;
  if (relatedLinks[0]?.link) return relatedLinks[0].link;
  if (extensions?.link) return extensions.link;
  return '';
}
