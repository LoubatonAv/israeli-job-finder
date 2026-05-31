import { extractCompany } from "./extractors/companyExtractor.js";
import { extractLocation } from "./extractors/locationExtractor.js";
import { extractRole } from "./extractors/roleExtractor.js";
import { extractSignals } from "./extractors/signalsExtractor.js";

export function enrichJob(job = {}) {
  const company = extractCompany(job);
  const location = extractLocation({ ...job, ...company });
  const role = extractRole({ ...job, ...company, ...location });
  const signals = extractSignals({ ...job, ...company, ...location, ...role });

  return {
    ...job,
    ...company,
    ...location,
    ...role,
    ...signals,
  };
}
