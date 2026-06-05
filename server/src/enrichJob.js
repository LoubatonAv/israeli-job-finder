import { extractCompany } from "./extractors/companyExtractor.js";
import { extractLocation } from "./extractors/locationExtractor.js";
import { extractRole } from "./extractors/roleExtractor.js";
import { extractSignals } from "./extractors/signalsExtractor.js";
import { applyRoleProfiles } from "./roleProfiles.js";

export function enrichJob(job = {}) {
  const company = extractCompany(job);
  const location = extractLocation({ ...job, ...company });
  const role = extractRole({ ...job, ...company, ...location });
  const profiledRole = applyRoleProfiles({ ...job, ...company, ...location, ...role });
  const signals = extractSignals({ ...job, ...company, ...location, ...profiledRole });

  return {
    ...job,
    ...company,
    ...location,
    ...profiledRole,
    ...signals,
  };
}
