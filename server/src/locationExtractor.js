const LOCATION_ALIASES = [
  {
    key: "haifa",
    display: "חיפה",
    patterns: [/חיפה/i, /haifa/i],
  },
  {
    key: "krayot",
    display: "קריות",
    patterns: [
      /קריות/i,
      /קרית\s*אתא/i,
      /קריית\s*אתא/i,
      /קרית\s*ביאליק/i,
      /קריית\s*ביאליק/i,
      /קרית\s*ים/i,
      /קריית\s*ים/i,
      /קרית\s*מוצקין/i,
      /קריית\s*מוצקין/i,
      /kiryat/i,
      /krayot/i,
    ],
  },
  {
    key: "yokneam",
    display: "יקנעם",
    patterns: [/יקנעם/i, /יקנעם\s*עילית/i, /yokneam/i],
  },
  {
    key: "netanya",
    display: "נתניה",
    patterns: [/נתניה/i, /netanya/i],
  },
  {
    key: "tel_aviv",
    display: "תל אביב",
    patterns: [/תל\s*אביב/i, /tel\s*aviv/i],
  },
  {
    key: "herzliya",
    display: "הרצליה",
    patterns: [/הרצליה/i, /herzliya/i],
  },
  {
    key: "raanana",
    display: "רעננה",
    patterns: [/רעננה/i, /raanana/i],
  },
  {
    key: "petah_tikva",
    display: "פתח תקווה",
    patterns: [/פתח\s*תקווה/i, /פתח\s*תקוה/i, /petah\s*tikva/i],
  },
  {
    key: "ramat_gan",
    display: "רמת גן",
    patterns: [/רמת\s*גן/i, /ramat\s*gan/i],
  },
  {
    key: "holon",
    display: "חולון",
    patterns: [/חולון/i, /holon/i],
  },
  {
    key: "remote",
    display: "Remote",
    patterns: [/remote/i, /hybrid/i, /היברידי/i, /מרחוק/i, /עבודה\s*מהבית/i],
  },
  {
    key: "north",
    display: "צפון",
    patterns: [/צפון/i, /northern/i],
  },
  {
    key: "center",
    display: "מרכז",
    patterns: [/מרכז/i, /גוש\s*דן/i, /center/i],
  },
];

function normalizeText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/[|:,;()[\]{}]/g, " ")
    .trim();
}

export function extractLocation(job = {}) {
  const text = normalizeText(
    [job.location, job.title, job.company, job.description, job.rawText]
      .filter(Boolean)
      .join(" "),
  );

  if (!text) {
    return {
      locationKey: null,
      locationDisplay: job.location || "Israel",
      locationConfidence: "none",
    };
  }

  for (const location of LOCATION_ALIASES) {
    if (location.patterns.some((pattern) => pattern.test(text))) {
      return {
        locationKey: location.key,
        locationDisplay: location.display,
        locationConfidence: "matched_text",
      };
    }
  }

  if (job.location && job.location !== "Israel") {
    return {
      locationKey: normalizeText(job.location).toLowerCase(),
      locationDisplay: job.location,
      locationConfidence: "job_location",
    };
  }

  return {
    locationKey: null,
    locationDisplay: job.location || "Israel",
    locationConfidence: "unknown",
  };
}
