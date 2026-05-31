const LOCATION_ALIASES = [
  { key: "haifa", display: "חיפה", patterns: [/חיפה/i, /haifa/i] },
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
      /krayot/i,
      /kiryat/i,
    ],
  },
  {
    key: "yokneam",
    display: "יקנעם",
    patterns: [/יקנעם/i, /יקנעם\s*עילית/i, /yokneam/i],
  },
  { key: "netanya", display: "נתניה", patterns: [/נתניה/i, /netanya/i] },
  {
    key: "hod_hasharon",
    display: "הוד השרון",
    patterns: [/הוד\s*השרון/i, /hod\s*hasharon/i],
  },
  {
    key: "tel_aviv",
    display: "תל אביב",
    patterns: [/תל\s*אביב/i, /tel\s*aviv/i],
  },
  { key: "herzliya", display: "הרצליה", patterns: [/הרצליה/i, /herzliya/i] },
  { key: "raanana", display: "רעננה", patterns: [/רעננה/i, /raanana/i] },
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
  { key: "holon", display: "חולון", patterns: [/חולון/i, /holon/i] },
  {
    key: "rishon_lezion",
    display: "ראשון לציון",
    patterns: [/ראשון\s*לציון/i, /rishon/i],
  },
  { key: "rehovot", display: "רחובות", patterns: [/רחובות/i, /rehovot/i] },
  {
    key: "jerusalem",
    display: "ירושלים",
    patterns: [/ירושלים/i, /jerusalem/i],
  },
  {
    key: "beer_sheva",
    display: "באר שבע",
    patterns: [/באר\s*שבע/i, /beer\s*sheva/i],
  },
  { key: "ashdod", display: "אשדוד", patterns: [/אשדוד/i, /ashdod/i] },
  { key: "ashkelon", display: "אשקלון", patterns: [/אשקלון/i, /ashkelon/i] },
  { key: "karmiel", display: "כרמיאל", patterns: [/כרמיאל/i, /karmiel/i] },
  { key: "nahariya", display: "נהריה", patterns: [/נהריה/i, /nahariya/i] },
  { key: "acre", display: "עכו", patterns: [/עכו/i, /acre/i, /akko/i] },
  {
    key: "remote",
    display: "Remote",
    patterns: [/remote/i, /hybrid/i, /היברידי/i, /מרחוק/i, /עבודה\s*מהבית/i],
  },
  { key: "north", display: "צפון", patterns: [/צפון/i, /northern/i] },
  {
    key: "center",
    display: "מרכז",
    patterns: [/מרכז/i, /גוש\s*דן/i, /center/i],
  },
  { key: "sharon", display: "השרון", patterns: [/השרון/i, /sharon/i] },
];

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function extractLocation(job = {}) {
  const text = cleanText(
    [job.location, job.title, job.company, job.description, job.rawText]
      .filter(Boolean)
      .join(" "),
  );

  for (const location of LOCATION_ALIASES) {
    if (location.patterns.some((pattern) => pattern.test(text))) {
      return {
        location: location.display,
        locationKey: location.key,
        locationConfidence: "matched_text",
      };
    }
  }

  if (job.location && job.location !== "Israel") {
    return {
      location: job.location,
      locationKey: cleanText(job.location).toLowerCase().replace(/\s+/g, "_"),
      locationConfidence: "job_location",
    };
  }

  return {
    location: job.location || "Israel",
    locationKey: null,
    locationConfidence: "unknown",
  };
}
