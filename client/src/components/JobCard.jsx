import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ExternalLink,
  MapPin,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

const rejectionReasons = [
  { value: "wrong_role", label: "תפקיד לא מתאים" },
  { value: "location", label: "מיקום לא מתאים" },
  { value: "senior", label: "בכיר / ניהולי מדי" },
  { value: "experience", label: "דורש יותר מדי ניסיון" },
  { value: "not_junior", label: "לא מספיק ג׳וניור / לא כניסה" },
  { value: "phone", label: "טלפוני / מוקד" },
  { value: "customer_service", label: "שירות לקוחות / תמיכה" },
  { value: "sales", label: "מכירות / ביזנס" },
  { value: "shifts", label: "משמרות / לילות / שבתות" },
  { value: "onsite", label: "נוכחות במשרד לא מתאימה" },
  { value: "tech_stack", label: "טכנולוגיות לא מתאימות" },
  { value: "already_applied", label: "כבר שלחתי / כפילות" },
  { value: "other", label: "סיבה אחרת" },
];

function getScoreTheme(score = 0) {
  if (score >= 85) {
    return {
      label: "התאמה מעולה",
      ring: "from-emerald-400 to-teal-500",
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      surface: "bg-emerald-50 text-emerald-900 ring-emerald-100",
      primary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200",
    };
  }

  if (score >= 70) {
    return {
      label: "התאמה טובה",
      ring: "from-sky-400 to-indigo-500",
      badge: "bg-sky-50 text-sky-700 ring-sky-200",
      surface: "bg-sky-50 text-sky-900 ring-sky-100",
      primary: "bg-sky-600 hover:bg-sky-700 text-white shadow-sky-200",
    };
  }

  if (score >= 55) {
    return {
      label: "שווה בדיקה",
      ring: "from-amber-300 to-orange-500",
      badge: "bg-amber-50 text-amber-700 ring-amber-200",
      surface: "bg-amber-50 text-amber-900 ring-amber-100",
      primary: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200",
    };
  }

  return {
    label: "התאמה חלשה",
    ring: "from-slate-300 to-slate-500",
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    surface: "bg-slate-50 text-slate-700 ring-slate-200",
    primary: "bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200",
  };
}

function statusMeta(status) {
  switch (status) {
    case "applied":
      return {
        label: "נשלח",
        hint: "סומן שכבר שלחת קורות חיים",
        className: "bg-emerald-500 text-white shadow-emerald-200",
        icon: CheckCircle2,
      };
    case "saved":
      return {
        label: "שמורה",
        hint: "ממתינה לטיפול מאוחר יותר",
        className: "bg-violet-500 text-white shadow-violet-200",
        icon: Bookmark,
      };
    case "interview":
      return {
        label: "ראיון",
        hint: "התקדמות בתהליך",
        className: "bg-sky-500 text-white shadow-sky-200",
        icon: Sparkles,
      };
    case "archived":
      return {
        label: "בארכיון",
        hint: "הוסרה מהרשימות הפעילות",
        className: "bg-slate-700 text-white shadow-slate-200",
        icon: Archive,
      };
    case "rejected":
    case "skipped":
      return {
        label: "הוסרה",
        hint: "לא תופיע ברשימות הפעילות",
        className: "bg-red-500 text-white shadow-red-200",
        icon: Trash2,
      };
    default:
      return {
        label: "טרם נשלח",
        hint: "עדיין לא סימנת שהגשת",
        className: "bg-slate-100 text-slate-700 shadow-slate-200",
        icon: CircleDot,
      };
  }
}

function recommendationLabel(value) {
  if (value === "apply") return "מומלץ לשלוח";
  if (value === "review") return "צריך בדיקה";
  if (value === "skip") return "לא מומלץ";
  return "צריך בדיקה";
}

function roleLabel(job = {}) {
  const role = String(job.roleFamily || job.roleType || "").toLowerCase();
  if (role.includes("automation")) return "אוטומציה";
  if (role.includes("qa")) return "בדיקות תוכנה";
  if (role.includes("information_systems")) return "מערכות מידע";
  if (role.includes("information")) return "מידע ומסמכים";
  return "תפקיד כללי";
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueLimited(list = [], max = 3) {
  return [...new Set(list.filter(Boolean))].slice(0, max);
}

export default function JobCard({ job, onStatusChange, onDelete, readOnly = false, manualReview = false, sourceLabel }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("wrong_role");
  const [busy, setBusy] = useState(false);

  const score = Number(job.fitScore || 0);
  const theme = getScoreTheme(score);
  const status = statusMeta(job.status);
  const StatusIcon = status.icon;
  const isApplied = job.status === "applied";
  const isSaved = job.status === "saved";

  const reasons = useMemo(() => uniqueLimited(job.reasons || [], expanded ? 8 : 3), [job.reasons, expanded]);
  const warnings = useMemo(() => uniqueLimited(job.warnings || [], expanded ? 8 : 2), [job.warnings, expanded]);

  const progress = Math.max(0, Math.min(100, score));
  const title = job.title || "משרה ללא כותרת";
  const company = job.company || "חברה לא ידועה";
  const location = job.location || "מיקום לא ידוע";

  async function safeAction(action) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`group relative overflow-hidden rounded-[2rem] border bg-white/95 shadow-xl shadow-slate-200/55 ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:shadow-2xl ${isApplied ? "border-emerald-200" : "border-slate-200"}`}>
      <div className={`absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b ${theme.ring}`} />

      <div className="grid gap-5 p-5 lg:grid-cols-[118px_1fr] lg:p-6">
        <aside className="flex lg:block">
          <div className="flex w-full items-center justify-between gap-4 rounded-3xl bg-slate-950 p-4 text-white lg:block lg:text-center">
            <div
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full p-1"
              style={{ background: `conic-gradient(rgb(16 185 129) ${progress * 3.6}deg, rgb(51 65 85) 0deg)` }}
            >
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950">
                <span className="text-2xl font-black leading-none">{score}</span>
                <span className="mt-1 text-[10px] font-black text-slate-400">ציון</span>
              </div>
            </div>

            <div className="mt-0 lg:mt-4">
              <p className="text-sm font-black">{theme.label}</p>
              <p className="mt-1 text-xs font-bold text-slate-400">{recommendationLabel(job.recommendation)}</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black shadow-sm ${status.className}`}>
                  <StatusIcon size={14} /> {status.label}
                </span>
                <span className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${theme.badge}`}>{recommendationLabel(job.recommendation)}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200">{roleLabel(job)}</span>
              </div>

              <h3 className="text-2xl font-black leading-9 tracking-tight text-slate-950">
                {title}
              </h3>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Building2 size={16} />{company}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin size={16} />{location}</span>
                <span className="inline-flex items-center gap-1.5"><Sparkles size={16} />{sourceLabel || job.source || "מקור לא ידוע"}</span>
              </div>

              {manualReview && (
                <div className="mt-4 rounded-3xl border border-indigo-100 bg-indigo-50/85 px-4 py-3 text-sm font-extrabold leading-7 text-indigo-800">
                  משרה לבדיקה ידנית: אם סימנת ששלחת או שמרת, היא תיעלם מהבדיקה הידנית, תעבור לטאב המתאים והמערכת תלמד לחזק משרות דומות בעתיד.
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 xl:items-end">
              <div className={`rounded-2xl px-4 py-2 text-xs font-black shadow-sm ${isApplied ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
                {status.hint}
              </div>

              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black shadow-lg transition hover:-translate-y-0.5 ${theme.primary}`}
                >
                  פתח משרה <ExternalLink size={17} />
                </a>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            <div className={`rounded-3xl p-4 ring-1 ${reasons.length ? "bg-emerald-50 text-emerald-900 ring-emerald-100" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
              <p className="mb-2 flex items-center gap-2 text-sm font-black"><CheckCircle2 size={17} /> למה כדאי לבדוק</p>
              {reasons.length > 0 ? (
                <ul className="grid gap-1.5 text-sm font-semibold leading-6">
                  {reasons.map((reason, index) => <li key={index}>• {reason}</li>)}
                </ul>
              ) : (
                <p className="text-sm font-semibold">אין סיבות התאמה מפורטות.</p>
              )}
            </div>

            <div className={`rounded-3xl p-4 ring-1 ${warnings.length ? "bg-amber-50 text-amber-900 ring-amber-100" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
              <p className="mb-2 flex items-center gap-2 text-sm font-black"><AlertTriangle size={17} /> מה עדיין לבדוק</p>
              {warnings.length > 0 ? (
                <ul className="grid gap-1.5 text-sm font-semibold leading-6">
                  {warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
                </ul>
              ) : (
                <p className="text-sm font-semibold">לא נמצאו אזהרות מיוחדות.</p>
              )}
            </div>
          </div>

          {expanded && job.description && (
            <div className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-700 ring-1 ring-slate-200">
              {cleanText(job.description).slice(0, 1400)}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 xl:flex-row xl:items-center xl:justify-between">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              {expanded ? "הסתר פרטים" : "הצג פרטים"}
            </button>

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || isSaved}
                  onClick={() => safeAction(() => onStatusChange(job.id, "saved"))}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition disabled:opacity-70 ${isSaved ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
                >
                  <Bookmark size={17} /> {isSaved ? "שמורה" : manualReview ? "שמור ולמד" : "שמור"}
                </button>

                <button
                  type="button"
                  disabled={busy || isApplied}
                  onClick={() => safeAction(() => onStatusChange(job.id, "applied"))}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black shadow-sm transition disabled:opacity-90 ${isApplied ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                >
                  {isApplied ? <CheckCircle2 size={17} /> : <Send size={17} />}
                  {isApplied ? "סומן כנשלח" : manualReview ? "שלחתי — למד מזה" : "סימנתי ששלחתי"}
                </button>

                <select
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 shadow-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-50"
                >
                  {rejectionReasons.map((reason) => (
                    <option key={reason.value} value={reason.value}>{reason.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => safeAction(() => onDelete(job.id, { rejectionReason: rejectReason }))}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={17} /> {manualReview ? "הסר מהבדיקה" : "לא מתאים"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
