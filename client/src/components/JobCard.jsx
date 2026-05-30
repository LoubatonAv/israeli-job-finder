import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

const rejectionReasons = [
  { value: "location", label: "מיקום" },
  { value: "shifts", label: "משמרות / לילות" },
  { value: "phone", label: "טלפוני מדי" },
  { value: "senior", label: "סניור / ניהולי מדי" },
  { value: "wrong_role", label: "לא התפקיד שרציתי" },
  { value: "other", label: "אחר" },
];

function getScoreTheme(score = 0) {
  if (score >= 80) {
    return {
      label: "התאמה גבוהה",
      edge: "border-r-emerald-500",
      scoreBox: "border-emerald-200 bg-emerald-50 text-emerald-700",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    };
  }

  if (score >= 60) {
    return {
      label: "התאמה טובה",
      edge: "border-r-amber-500",
      scoreBox: "border-amber-200 bg-amber-50 text-amber-700",
      pill: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    };
  }

  if (score >= 40) {
    return {
      label: "התאמה בינונית",
      edge: "border-r-orange-500",
      scoreBox: "border-orange-200 bg-orange-50 text-orange-700",
      pill: "bg-orange-50 text-orange-700 border-orange-200",
      dot: "bg-orange-500",
    };
  }

  return {
    label: "כנראה לא מתאים",
    edge: "border-r-red-500",
    scoreBox: "border-red-200 bg-red-50 text-red-700",
    pill: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  };
}

function statusClass(status) {
  switch (status) {
    case "found":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "saved":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "applied":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "interview":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "rejected":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "skipped":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function splitDescription(text = "") {
  return String(text)
    .replace(/\s*·\s*/g, "\n")
    .replace(/\s*[•]\s*/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length > 2)
    .filter((line, index, arr) => arr.indexOf(line) === index);
}

function getShortBullets(description = "") {
  return splitDescription(description)
    .filter((line) => !/^found$/i.test(line))
    .filter((line) => !/^details$/i.test(line))
    .filter((line) => !/^apply$/i.test(line))
    .slice(0, 3);
}

function buildTags(job) {
  const text = [
    job.title,
    job.company,
    job.location,
    job.description,
    ...(job.reasons || []),
  ]
    .join(" ")
    .toLowerCase();

  const tags = [];

  if (/qa|בדיק|בודק|בודקת/.test(text)) tags.push("QA");
  if (/junior|ג׳וניור|ג'וניור|ללא ניסיון|ללא נסיון/.test(text)) {
    tags.push("Junior / ללא ניסיון");
  }
  if (/manual|ידני|ידניות/.test(text)) tags.push("Manual");
  if (/automation|אוטומציה|selenium|playwright|cypress/.test(text)) {
    tags.push("Automation");
  }
  if (/sql/.test(text)) tags.push("SQL");
  if (/document|בקרת מסמכים|מסמכים|plm/.test(text)) tags.push("Documents");
  if (/fraud|risk|סיכון|הונאה/.test(text)) tags.push("Risk/Fraud");

  return [...new Set(tags)].slice(0, 4);
}

function DetailBox({ title, icon, items, emptyText }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 text-right">
      <div className="mb-2 flex items-center justify-start gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </div>

      {items?.length ? (
        <ul className="space-y-1.5 text-sm leading-6 text-slate-700">
          {items.slice(0, 6).map((item, index) => (
            <li key={index} className="flex flex-row-reverse justify-end gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

export default function JobCard({ job, onStatusChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const score = job.fitScore ?? 0;
  const theme = getScoreTheme(score);

  const tags = useMemo(() => buildTags(job), [job]);
  const bullets = useMemo(
    () => getShortBullets(job.description),
    [job.description],
  );
  const descriptionLines = useMemo(
    () => splitDescription(job.description),
    [job.description],
  );

  const source = job.source || job.via || "Unknown source";
  const foundDate = job.foundAt
    ? new Date(job.foundAt).toLocaleDateString("he-IL")
    : "Unknown";

  return (
    <>
      <article
        dir="rtl"
        className={`group overflow-hidden rounded-3xl border border-r-4 border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg ${theme.edge}`}
      >
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[96px_minmax(0,1fr)_135px] md:items-start md:p-5">
          {/* Score - right side */}
          <div className="flex justify-start md:justify-center">
            <div
              className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl border ${theme.scoreBox}`}
            >
              <span className="text-3xl font-black leading-none">{score}</span>
              <span className="mt-1 text-xs font-bold">ציון התאמה</span>
            </div>
          </div>

          {/* Content - middle */}
          <div className="min-w-0 text-right">
            <div className="mb-2 flex flex-wrap items-center justify-start gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${theme.pill}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                {theme.label}
              </span>

              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(job.status)}`}
              >
                {job.status || "found"}
              </span>

              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {job.recommendation || "review"}
              </span>
            </div>

            <h2 className="text-lg font-black leading-snug text-slate-950 md:text-xl">
              {job.title}
            </h2>

            <div className="mt-2 flex flex-wrap items-center justify-start gap-x-4 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={15} />
                {job.company || source}
              </span>

              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} />
                {job.location || "Israel"}
              </span>

              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={15} />
                {source}
              </span>
            </div>

            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-start gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {bullets.length > 0 && (
              <ul className="mt-4 grid gap-1.5 text-right text-sm leading-6 text-slate-700">
                {bullets.map((bullet, index) => (
                  <li
                    key={index}
                    className="flex flex-row-reverse justify-end gap-2"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions - left side */}
          <div className="flex flex-row flex-wrap items-start justify-start gap-2 md:flex-col md:items-start">
            <div className="mb-1 text-left">
              <p className="text-sm font-black text-blue-700">{source}</p>
              <p className="mt-1 text-xs text-slate-500">{foundDate}</p>
            </div>

            <div className="flex flex-wrap justify-start gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onStatusChange(job.id, "saved");
                }}
                disabled={job.status === "saved" || job.status === "applied"}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  job.status === "saved" || job.status === "applied"
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                }`}
                title="שמור לבדיקה מאוחר יותר"
              >
                <Bookmark size={14} />
                {job.status === "saved" || job.status === "applied"
                  ? "שמור"
                  : "שמור"}
              </button>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onStatusChange(job.id, "applied");
                }}
                disabled={job.status === "applied"}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-80 ${
                  job.status === "applied"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
                title="סמן שהגשת קו״ח"
              >
                <CheckCircle2 size={14} />
                {job.status === "applied" ? "הוגש" : "הגשתי"}
              </button>
            </div>

            <div className="flex flex-wrap justify-start gap-2">
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  פתח משרה <ExternalLink size={14} />
                </a>
              )}

              <div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRejectOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  title="לא רלוונטי — בחר סיבה כדי שהמערכת תלמד"
                >
                  <Trash2 size={14} />
                  לא מתאים
                </button>

                {rejectOpen && (
                  <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRejectOpen(false);
                    }}
                  >
                    <div
                      dir="rtl"
                      className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-2xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-800">
                          למה לא מתאים?
                        </p>

                        <button
                          type="button"
                          onClick={() => setRejectOpen(false)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          title="סגור"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="grid gap-2">
                        {rejectionReasons.map((reason) => (
                          <button
                            key={reason.value}
                            type="button"
                            onClick={() => {
                              setRejectOpen(false);
                              onDelete(job.id, {
                                rejectionReason: reason.value,
                              });
                            }}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          >
                            {reason.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
            >
              {open ? "פחות פרטים" : "פרטים נוספים"}
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-slate-100 bg-white px-4 pb-5 md:px-5">
            <div className="grid gap-3 pt-4 lg:grid-cols-3">
              <DetailBox
                title="למה זה מתאים"
                icon={<Sparkles size={14} />}
                items={job.reasons || []}
                emptyText="אין סיבות התאמה מיוחדות."
              />

              <DetailBox
                title="אזהרות"
                icon={<AlertTriangle size={14} />}
                items={job.warnings || []}
                emptyText="אין אזהרות משמעותיות."
              />

              <DetailBox
                title="תיאור מסודר"
                icon={<ChevronDown size={14} />}
                items={descriptionLines}
                emptyText="אין תיאור משרה."
              />
            </div>
          </div>
        )}
      </article>

      {rejectOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={() => setRejectOpen(false)}
        >
          <div
            dir="rtl"
            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-800">למה לא מתאים?</p>

              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="סגור"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-2">
              {rejectionReasons.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => {
                    setRejectOpen(false);
                    onDelete(job.id, { rejectionReason: reason.value });
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  {reason.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
