const BAD_COMPANY_VALUES = new Set([
  "Drushim",
  "AllJobs",
  "JobMaster",
  "Matrix",
  "SerpApi",
  "Israel",
  "ללא נסיון",
  "ללא ניסיון",
  "1-2 שנים",
  "2-3 שנים",
  "3-4 שנים",
  "משרה מלאה",
]);

function cleanPart(value = "") {
  return String(value).replace(/\|.*/, "").replace(/\s+/g, " ").trim();
}

function isBadCompany(value = "") {
  const clean = cleanPart(value);

  return (
    !clean ||
    clean.length < 2 ||
    clean.length > 80 ||
    BAD_COMPANY_VALUES.has(clean) ||
    /^(לפני|פורסם|דרוש|דרושה)$/i.test(clean) ||
    /^#/.test(clean) ||
    /position\s*:/i.test(clean) ||
    /display\s*:/i.test(clean)
  );
}

export function extractCompany(job = {}) {
  const source = job.source || "";
  const description = String(job.description || "");

  if (source === "Drushim") {
    const parts = description.split("·").map(cleanPart).filter(Boolean);

    const possibleCompany = parts[1];

    if (!isBadCompany(possibleCompany)) {
      return {
        company: possibleCompany,
        companyConfidence: "drushim_description_parts",
      };
    }
  }

  if (job.company && !isBadCompany(job.company)) {
    return {
      company: job.company,
      companyConfidence: "job_company",
    };
  }

  return {
    company: job.source || "Unknown",
    companyConfidence: "fallback",
  };
}
