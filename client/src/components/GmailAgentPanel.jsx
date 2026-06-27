import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";


const REJECTION_REASONS = [
  { value: 'wrong_role', label: 'תפקיד לא מתאים' },
  { value: 'location', label: 'מיקום לא מתאים' },
  { value: 'senior', label: 'בכיר / ניהולי מדי' },
  { value: 'experience', label: 'דורש יותר מדי ניסיון' },
  { value: 'not_junior', label: 'לא מספיק ג׳וניור' },
  { value: 'phone', label: 'טלפוני / מוקד' },
  { value: 'customer_service', label: 'שירות לקוחות / תמיכה' },
  { value: 'sales', label: 'מכירות / ביזנס' },
  { value: 'shifts', label: 'משמרות / לילות / שבתות' },
  { value: 'onsite', label: 'נוכחות במשרד לא מתאימה' },
  { value: 'tech_stack', label: 'טכנולוגיות לא מתאימות' },
  { value: 'already_applied', label: 'כבר שלחתי / כפילות' },
  { value: 'other', label: 'אחר' },
];

const FILTERS = [
  { id: "all", label: "הכול מ-Gmail" },
  { id: "apply", label: "לטיפול מ-Gmail" },
  { id: "review", label: "בדיקה ידנית מ-Gmail" },
  { id: "digest", label: "תקצירי Gmail" },
  { id: "applied", label: "נשלחו מ-Gmail" },
  { id: "saved", label: "שמורות מ-Gmail" },
  { id: "archived", label: "ארכיון Gmail" },
];

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.jobs)) return value.jobs;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function isGmailJob(job) {
  return /gmail/i.test(String(job?.source || ""));
}

function isDigest(job) {
  return (
    job?.gmailDigest === true ||
    /^תקציר משרות לבדיקה:/i.test(String(job?.title || ""))
  );
}

function getStatusLabel(job) {
  if (job.status === "applied") return "נשלח";
  if (job.status === "saved") return "שמור";
  if (job.status === "archived") return "ארכיון";
  if (job.status === "rejected") return "נדחה";
  if (job.recommendation === "review") return "בדיקה ידנית";
  if (job.recommendation === "apply") return "לטיפול";
  return "חדש";
}

function getScoreBadgeClass(score) {
  const value = Number(score || 0);

  if (value >= 80) return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  if (value >= 60) return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function GmailAgentPanel() {
  const [jobs, setJobs] = useState([]);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [busyJobId, setBusyJobId] = useState("");
  const [message, setMessage] = useState("");
  const [importResult, setImportResult] = useState(null);

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [jobsResult, statusResult] = await Promise.all([
        apiGet("/api/jobs"),
        apiGet("/api/gmail/status").catch(() => null),
      ]);

      setJobs(asArray(jobsResult).filter(isGmailJob));
      setGmailStatus(statusResult);
    } catch (error) {
      setMessage(error.message || "טעינת Gmail Agent נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => {
    const gmailJobs = jobs;

    return {
      total: gmailJobs.length,
      apply: gmailJobs.filter(
        (job) =>
          job.status === "found" &&
          job.recommendation !== "review" &&
          job.status !== "archived" &&
          job.status !== "rejected",
      ).length,
      review: gmailJobs.filter(
        (job) => job.recommendation === "review" && job.status === "found",
      ).length,
      digest: gmailJobs.filter(isDigest).length,
      applied: gmailJobs.filter((job) => job.status === "applied").length,
      saved: gmailJobs.filter((job) => job.status === "saved").length,
      archived: gmailJobs.filter(
        (job) => job.status === "archived" || job.status === "rejected",
      ).length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return jobs
      .filter((job) => {
        if (activeFilter === "apply") {
          return job.status === "found" && job.recommendation !== "review";
        }

        if (activeFilter === "review") {
          return job.status === "found" && job.recommendation === "review";
        }

        if (activeFilter === "digest") {
          return isDigest(job);
        }

        if (activeFilter === "applied") {
          return job.status === "applied";
        }

        if (activeFilter === "saved") {
          return job.status === "saved";
        }

        if (activeFilter === "archived") {
          return job.status === "archived" || job.status === "rejected";
        }

        return true;
      })
      .filter((job) => {
        if (!query) return true;

        return [
          job.title,
          job.company,
          job.location,
          job.source,
          job.description,
          job.snippet,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const statusWeight = (job) => {
          if (job.status === "found" && job.recommendation === "apply")
            return 0;
          if (job.status === "found" && job.recommendation === "review")
            return 1;
          if (job.status === "saved") return 2;
          if (job.status === "applied") return 3;
          return 4;
        };

        const byStatus = statusWeight(a) - statusWeight(b);
        if (byStatus !== 0) return byStatus;

        return Number(b.fitScore || 0) - Number(a.fitScore || 0);
      });
  }, [jobs, activeFilter, search]);

  async function importFromGmail() {
    setImporting(true);
    setMessage("");
    setImportResult(null);

    try {
      const result = await apiPost("/api/gmail/import-to-jobs", {
        days: 14,
        maxResults: 60,
      });

      setImportResult(result);
      setMessage(
        `ייבוא הסתיים: עובדו עכשיו ${result.processedNow ?? 0}, נוספו ${result.addedToJobs ?? 0}, לבדיקה ${result.reviewCandidates ?? 0}.`,
      );

      await loadData();
    } catch (error) {
      setMessage(error.message || "ייבוא מ-Gmail נכשל");
    } finally {
      setImporting(false);
    }
  }

  async function updateJobStatus(job, status, reason = "") {
    if (!job?.id) return;

    setBusyJobId(job.id);
    setMessage("");

    try {
      await apiPost(`/api/gmail-agent/jobs/${encodeURIComponent(job.id)}/status`, {
        status,
        reason,
      });

      await loadData();
    } catch (error) {
      setMessage(error.message || "עדכון הסטטוס נכשל");
    } finally {
      setBusyJobId("");
    }
  }

  return (
    <section dir="rtl" className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              Gmail Agent
            </div>

            <h2 className="text-2xl font-black text-slate-950">
              Gmail Agent — רק משרות מהמייל
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              המסך הזה מציג רק משרות שהגיעו דרך Gmail. הטאבים הכלליים למעלה
              מציגים את כל המקורות יחד: Gmail + סריקות אתרים רגילות. מייל מאתר
              משרות אמין לא נמחק בגלל ניקוד נמוך — אם המערכת לא בטוחה, הוא עובר
              לבדיקה ידנית מ-Gmail.
            </p>

            <p className="mt-1 text-xs text-slate-400">
              סטטוס חיבור:{" "}
              <span
                className={
                  gmailStatus?.connected ? "text-emerald-700" : "text-rose-700"
                }
              >
                {gmailStatus?.connected ? "מחובר" : "לא מחובר"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={importFromGmail}
              disabled={importing || !gmailStatus?.connected}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "מייבא..." : "ייבא עכשיו מ-Gmail"}
            </button>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              רענן
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
            {message}
          </div>
        ) : null}

        {importResult ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <MiniStat label="נסרקו" value={importResult.scanned ?? 0} />
            <MiniStat
              label="עובדו עכשיו"
              value={importResult.processedNow ?? 0}
            />
            <MiniStat
              label="נוספו למערכת"
              value={importResult.addedToJobs ?? 0}
            />
            <MiniStat
              label="לבדיקה"
              value={importResult.reviewCandidates ?? 0}
            />
          </div>
        ) : null}
      </div>

      <StatCard label="סה״כ מ-Gmail בלבד" value={stats.total} />
      <StatCard label="לטיפול מ-Gmail" value={stats.apply} tone="emerald" />
      <StatCard label="בדיקה ידנית מ-Gmail" value={stats.review} tone="amber" />
      <StatCard label="תקצירי Gmail" value={stats.digest} tone="violet" />
      <StatCard label="נשלחו מ-Gmail" value={stats.applied} tone="blue" />
      <StatCard label="ארכיון Gmail" value={stats.archived} tone="slate" />

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-bold transition",
                  activeFilter === filter.id
                    ? "bg-slate-950 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש בכותרת, מקור, מיקום..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 lg:w-80"
          />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            טוען משרות Gmail...
          </div>
        ) : filteredJobs.length ? (
          filteredJobs.map((job) => (
            <GmailJobCard
              key={job.id}
              job={job}
              busy={busyJobId === job.id}
              onStatus={updateJobStatus}
            />
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div className="text-lg font-black text-slate-900">
              אין משרות להצגה במסנן הזה
            </div>
            <div className="mt-2 text-sm text-slate-500">
              נסה לבחור מסנן אחר או להריץ ייבוא מ-Gmail.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-xs font-bold text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function StatCard({ label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-950 ring-slate-200",
    emerald: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    violet: "bg-violet-50 text-violet-900 ring-violet-200",
    blue: "bg-blue-50 text-blue-900 ring-blue-200",
  };

  return (
    <div className={`rounded-3xl p-4 ring-1 ${tones[tone] || tones.slate}`}>
      <div className="text-sm font-bold opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}

function GmailJobCard({ job, busy, onStatus }) {
  const [rejectReason, setRejectReason] = useState('wrong_role');
  const warnings = Array.isArray(job.warnings)
    ? job.warnings.filter(Boolean)
    : [];
  const reasons = Array.isArray(job.reasons) ? job.reasons.filter(Boolean) : [];
  const digest = isDigest(job);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {job.source || "Gmail"}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${getScoreBadgeClass(job.fitScore)}`}
            >
              ציון {job.fitScore ?? 0}
            </span>

            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {getStatusLabel(job)}
            </span>

            {digest ? (
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                תקציר מייל
              </span>
            ) : null}

            {job.location ? (
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                {job.location}
              </span>
            ) : null}
          </div>

          <h3 className="text-lg font-black leading-7 text-slate-950">
            {job.title || "משרה מ-Gmail"}
          </h3>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {job.company ? <span>{job.company}</span> : null}
            {job.publishedAt ? (
              <span>{formatDate(job.publishedAt)}</span>
            ) : null}
          </div>

          {job.snippet || job.description ? (
            <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
              {job.snippet || job.description}
            </p>
          ) : null}

          {warnings.length ? (
            <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm leading-7 text-amber-900">
              <div className="font-black">אזהרות</div>
              <ul className="mt-1 list-inside list-disc">
                {warnings.slice(0, 3).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {reasons.length ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm leading-7 text-emerald-900">
              <div className="font-black">למה זה נכנס</div>
              <ul className="mt-1 list-inside list-disc">
                {reasons.slice(0, 3).map((reason, index) => (
                  <li key={`${reason}-${index}`}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 xl:w-44">
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800"
            >
              פתח משרה
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-bold text-slate-400"
            >
              אין קישור
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onStatus(job, "applied", "סומן כנשלח מתוך Gmail Agent")
            }
            className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            סימנתי ששלחתי
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(job, "saved", "נשמר מתוך Gmail Agent")}
            className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
          >
            שמור
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onStatus(job, "archived", "הועבר לארכיון מתוך Gmail Agent")
            }
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ארכיון
          </button>

          <select
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            disabled={busy}
            className="rounded-2xl border border-rose-200 bg-white px-3 py-3 text-sm font-bold text-rose-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-50 disabled:opacity-50"
          >
            {REJECTION_REASONS.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(job, "rejected", rejectReason)}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
          >
            לא מתאים — למד מזה
          </button>
        </div>
      </div>
    </article>
  );
}
