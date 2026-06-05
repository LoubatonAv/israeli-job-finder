import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Network,
  PartyPopper,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import JobCard from "./components/JobCard.jsx";
import { apiDelete, apiGet, apiPatch, apiPost } from "./lib/api.js";

const DAILY_GOAL = 5;

const tabs = [
  { value: "main", label: "לטיפול" },
  { value: "review", label: "לבדיקה ידנית" },
  { value: "saved", label: "שמורות" },
  { value: "applied", label: "נשלחו" },
  { value: "archive", label: "ארכיון" },
];

function getScoreBand(score = 0) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "medium";
  return "low";
}

function hebrewSource(source = "") {
  const normalized = String(source || "").toLowerCase();
  if (normalized.includes("drushim")) return "דרושים";
  if (normalized.includes("alljobs")) return "אולג׳ובס";
  if (normalized.includes("jobmaster")) return "ג׳ובמאסטר";
  if (normalized.includes("matrix")) return "מטריקס";
  if (normalized.includes("sitesources") || normalized.includes("אתרי")) return "אתרי מקור";
  if (normalized.includes("google")) return "גוגל";
  return source || "מקור לא ידוע";
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toLocaleDateString("en-CA") === todayKey();
}

function statusText(status) {
  if (status === "applied") return "נשלח";
  if (status === "saved") return "שמורה";
  if (status === "interview") return "ראיון";
  if (status === "archived") return "ארכיון";
  if (status === "rejected") return "נדחתה";
  if (status === "skipped") return "הוסרה";
  return "טרם נשלח";
}

function isActionableJob(job = {}) {
  const status = String(job.status || "found");
  return !["saved", "applied", "interview", "archived", "rejected", "skipped"].includes(status);
}

function isAppliedJob(job = {}) {
  return ["applied", "interview"].includes(String(job.status || ""));
}

function isArchivedJob(job = {}) {
  return ["archived", "rejected", "skipped"].includes(String(job.status || ""));
}

function StatTile({ label, value, hint, icon: Icon, tone = "default" }) {
  const tones = {
    default: "from-slate-950 to-slate-800 text-white",
    green: "from-emerald-500 to-teal-500 text-white",
    blue: "from-sky-500 to-indigo-500 text-white",
    purple: "from-violet-500 to-fuchsia-500 text-white",
    amber: "from-amber-400 to-orange-500 text-white",
  };

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 shadow-xl shadow-slate-200/80 ${tones[tone]}`}>
      <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold opacity-80">{label}</p>
          <p className="mt-2 text-4xl font-black leading-none tracking-tight">{value}</p>
          {hint && <p className="mt-2 text-xs font-bold opacity-75">{hint}</p>}
        </div>
        {Icon && (
          <div className="rounded-2xl bg-white/20 p-3 backdrop-blur">
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
      >
        {children}
      </select>
    </label>
  );
}

function EmptyState({ activeTab, onScan, loading }) {
  const copy =
    activeTab === "applied"
      ? "עדיין אין משרות שסומנו כנשלחו."
      : activeTab === "archive"
        ? "עדיין אין משרות בארכיון. משרות שתסיר יופיעו כאן ולא יעמיסו על הרשימות הפעילות."
        : activeTab === "saved"
          ? "עדיין אין משרות שמורות."
          : activeTab === "review"
            ? "אין כרגע משרות לבדיקה ידנית."
            : "אין משרות שממתינות לטיפול כרגע.";

  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
        <ClipboardCheck size={32} />
      </div>
      <h3 className="mt-4 text-2xl font-black text-slate-950">הרשימה ריקה</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-7 text-slate-500">{copy} אפשר לנקות פילטרים או להריץ סריקה חדשה.</p>
      {activeTab === "main" && (
        <button
          type="button"
          onClick={onScan}
          disabled={loading}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          סרוק עכשיו
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [reviewJobs, setReviewJobs] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [scanSummary, setScanSummary] = useState(null);
  const [sources, setSources] = useState([]);
  const [activeTab, setActiveTab] = useState("main");
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score-desc");

  async function loadAll() {
    const [jobsData, reviewData, feedbackData, scanData, sourcesData] = await Promise.all([
      apiGet("/api/jobs"),
      apiGet("/api/jobs/review").catch(() => []),
      apiGet("/api/feedback").catch(() => []),
      apiGet("/api/scan-summary").catch(() => null),
      apiGet("/api/sources").catch(() => []),
    ]);

    setJobs(Array.isArray(jobsData) ? jobsData : []);
    setReviewJobs(Array.isArray(reviewData) ? reviewData : []);
    setFeedback(Array.isArray(feedbackData) ? feedbackData : []);
    setScanSummary(scanData);
    setSources(Array.isArray(sourcesData) ? sourcesData : []);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!loading) return undefined;

    setScanProgress(10);
    const intervalId = setInterval(() => {
      setScanProgress((current) => Math.min(94, current + Math.max(2, Math.round((100 - current) / 9))));
      loadAll().catch(() => undefined);
    }, 1300);

    return () => clearInterval(intervalId);
  }, [loading]);

  async function runFinder() {
    setLoading(true);
    setError("");
    setMessage("הסריקה התחילה. המערכת מחפשת, מסננת ומעדכנת את הרשימה תוך כדי עבודה.");

    try {
      const result = await apiPost("/api/jobs/find");
      setScanProgress(100);
      setJobs(result.jobs || []);
      await loadAll();
      setMessage(`הסריקה הסתיימה: נסרקו ${result.scanned}, נוספו ${result.newJobs}, נשמרו ${result.totalJobs}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setTimeout(() => setLoading(false), 700);
    }
  }

  function statusSuccessMessage(status, fromReview = false) {
    if (status === "applied") {
      return fromReview
        ? "סומן כנשלח, הועבר לטאב נשלחו והמערכת תלמד שזו משרה טובה."
        : "סומן כנשלח והועבר לטאב נשלחו. מצוין — עוד הגשה נספרה ליעד היומי.";
    }

    if (status === "saved") {
      return fromReview
        ? "המשרה נשמרה, הועברה לטאב שמורות והמערכת תלמד שכדאי לחפש דומות לה."
        : "המשרה נשמרה והועברה לטאב שמורות. אפשר לחזור אליה מאוחר יותר.";
    }

    return "סטטוס המשרה עודכן.";
  }

  async function updateStatus(id, status) {
    const updated = await apiPatch(`/api/jobs/${encodeURIComponent(id)}`, { status });
    setJobs((current) => current.map((job) => (job.id === id ? updated : job)));
    await loadAll();
    setMessage(statusSuccessMessage(status));
  }

  async function promoteReviewJob(id, status) {
    await apiPost(`/api/jobs/review/${encodeURIComponent(id)}/promote`, { status });
    await loadAll();
    setMessage(statusSuccessMessage(status, true));
    if (status === "applied") {
      setActiveTab("applied");
    } else if (status === "saved") {
      setActiveTab("saved");
    }
  }

  async function deleteJob(id, feedbackPayload = {}) {
    await apiDelete(`/api/jobs/${encodeURIComponent(id)}`, feedbackPayload);
    await loadAll();
    setMessage("המשרה הועברה לארכיון ונעלמה מהרשימות הפעילות. הסיבה נשמרה ותשפיע על הסינון הבא.");
  }

  async function rejectReviewJob(id, feedbackPayload = {}) {
    await apiPost(`/api/jobs/review/${encodeURIComponent(id)}/reject`, feedbackPayload);
    await loadAll();
    setMessage("המשרה הוסרה מהרשימה לבדיקה. הסיבה נשמרה ותשפיע על הסינון הבא.");
  }

  const stats = useMemo(() => {
    const actionable = jobs.filter(isActionableJob);
    const savedJobs = jobs.filter((job) => job.status === "saved");
    const appliedJobs = jobs.filter(isAppliedJob);
    const archivedJobs = jobs.filter(isArchivedJob);
    const appliedToday = appliedJobs.filter((job) => isToday(job.updatedAt || job.foundAt)).length;

    return {
      total: actionable.length,
      allStored: jobs.length,
      apply: actionable.filter((job) => job.recommendation === "apply").length,
      review: actionable.filter((job) => job.recommendation === "review").length,
      saved: savedJobs.length,
      applied: appliedJobs.length,
      archived: archivedJobs.length,
      waiting: actionable.length + reviewJobs.length,
      appliedToday,
      learningEvents: feedback.length,
      reviewQueue: reviewJobs.length,
      activeSources: sources.filter((source) => source && source.enabled !== false).length,
      scannedLastRun: scanSummary?.totals?.incoming || 0,
      filteredLastRun: scanSummary?.totals?.filtered || 0,
    };
  }, [jobs, feedback, reviewJobs, sources, scanSummary]);

  const dailyProgress = Math.min(100, Math.round((stats.appliedToday / DAILY_GOAL) * 100));
  const reachedDailyGoal = stats.appliedToday >= DAILY_GOAL;

  const activeJobs = useMemo(() => {
    if (activeTab === "review") return reviewJobs;
    if (activeTab === "saved") return jobs.filter((job) => job.status === "saved");
    if (activeTab === "applied") return jobs.filter(isAppliedJob);
    if (activeTab === "archive") return jobs.filter(isArchivedJob);
    return jobs.filter(isActionableJob);
  }, [activeTab, jobs, reviewJobs]);

  const filterOptions = useMemo(() => {
    const sources = [...new Set(activeJobs.map((job) => hebrewSource(job.source || job.via)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));
    const locations = [...new Set(activeJobs.map((job) => job.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));
    const statuses = [...new Set(activeJobs.map((job) => statusText(job.status)).filter(Boolean))];
    return { sources, locations, statuses };
  }, [activeJobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return activeJobs
      .filter((job) => {
        const score = Number(job.fitScore || 0);
        const band = getScoreBand(score);
        const sourceName = hebrewSource(job.source || job.via);
        const currentStatus = statusText(job.status);

        const matchesScore = scoreFilter === "all" || band === scoreFilter;
        const matchesSource = sourceFilter === "all" || sourceName === sourceFilter;
        const matchesLocation = locationFilter === "all" || job.location === locationFilter;
        const matchesStatus = statusFilter === "all" || currentStatus === statusFilter;

        const text = [
          job.title,
          job.company,
          job.location,
          job.description,
          sourceName,
          currentStatus,
          ...(job.reasons || []),
          ...(job.warnings || []),
        ]
          .join(" ")
          .toLowerCase();

        return matchesScore && matchesSource && matchesLocation && matchesStatus && (!q || text.includes(q));
      })
      .sort((a, b) => {
        if (sortBy === "newest") return new Date(b.foundAt || 0) - new Date(a.foundAt || 0);
        if (sortBy === "oldest") return new Date(a.foundAt || 0) - new Date(b.foundAt || 0);
        if (sortBy === "title") return String(a.title || "").localeCompare(String(b.title || ""), "he");
        if (sortBy === "score-asc") return Number(a.fitScore || 0) - Number(b.fitScore || 0);

        const scoreDiff = Number(b.fitScore || 0) - Number(a.fitScore || 0);
        if (scoreDiff) return scoreDiff;
        return new Date(b.foundAt || 0) - new Date(a.foundAt || 0);
      });
  }, [activeJobs, search, scoreFilter, sourceFilter, locationFilter, statusFilter, sortBy]);

  function resetFilters() {
    setSearch("");
    setScoreFilter("all");
    setSourceFilter("all");
    setLocationFilter("all");
    setStatusFilter("all");
    setSortBy("score-desc");
  }

  return (
    <main dir="rtl" className="app-shell min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="aurora aurora-one" />
        <div className="aurora aurora-two" />
      </div>

      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden rounded-[2.2rem] border border-white/70 bg-white/80 shadow-2xl shadow-slate-300/45 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-indigo-500 via-fuchsia-500 to-emerald-400" />
          <div className="grid gap-7 p-6 lg:grid-cols-[1fr_390px] lg:items-stretch lg:p-8">
            <section className="flex flex-col justify-between gap-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-black text-indigo-700 shadow-sm">
                  <Sparkles size={16} /> לוח משרות אישי
                </div>
                <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight text-slate-950 md:text-6xl">
                  משרות נקיות, ברורות ומוכנות לפעולה
                </h1>
                <p className="mt-4 max-w-3xl text-base font-semibold leading-8 text-slate-600 md:text-lg">
                  במקום לעבור על רעש, המערכת מדרגת התאמה, מסמנת מה כבר נשלח, שומרת מה מעניין ולומדת מכל משרה שאתה מסיר.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runFinder}
                  disabled={loading}
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={18} className={loading ? "animate-spin" : "transition group-hover:rotate-45"} />
                  {loading ? "סורק עכשיו" : "סרוק משרות חדשות"}
                </button>
                <button
                  type="button"
                  onClick={loadAll}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  רענן רשימה
                </button>
              </div>
            </section>

            <aside className="rounded-[1.8rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-2xl shadow-slate-300/70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-indigo-200">יעד הגשות יומי</p>
                  <p className="mt-2 text-4xl font-black tracking-tight">{stats.appliedToday}/{DAILY_GOAL}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-300">
                    כל משרה שסימנת כנשלחה מתווספת להתקדמות היומית.
                  </p>
                </div>
                <div className={`rounded-3xl p-4 ${reachedDailyGoal ? "animate-goal-pop bg-emerald-400 text-emerald-950" : "bg-white/10 text-indigo-100"}`}>
                  {reachedDailyGoal ? <PartyPopper size={34} /> : <Target size={34} />}
                </div>
              </div>

              <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${reachedDailyGoal ? "animate-progress-glow bg-gradient-to-l from-emerald-300 to-teal-400" : "bg-gradient-to-l from-indigo-400 to-fuchsia-400"}`}
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-xs font-black text-slate-300">
                <span>התקדמות</span>
                <span>{dailyProgress}%</span>
              </div>

              {reachedDailyGoal && (
                <div className="mt-4 rounded-2xl bg-emerald-400/15 px-4 py-3 text-sm font-black text-emerald-100 ring-1 ring-emerald-300/25">
                  יפה. עמדת ביעד היום.
                </div>
              )}
            </aside>
          </div>

          {loading && (
            <div className="border-t border-slate-200/80 bg-white/70 px-6 py-4">
              <div className="flex items-center justify-between text-sm font-black text-slate-700">
                <span>סריקה פעילה — התוצאות מתעדכנות תוך כדי</span>
                <span>{scanProgress}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-l from-indigo-500 via-fuchsia-500 to-emerald-400 transition-all duration-500" style={{ width: `${scanProgress}%` }} />
              </div>
            </div>
          )}
        </header>

        {(message || error) && (
          <div className={`mt-4 rounded-3xl border px-5 py-4 text-sm font-black shadow-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {error || message}
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatTile label="לטיפול עכשיו" value={stats.total} icon={BarChart3} />
          <StatTile label="מומלץ לשלוח" value={stats.apply} icon={Sparkles} tone="green" />
          <StatTile label="ממתינות" value={stats.waiting} icon={ClipboardCheck} tone="amber" />
          <StatTile label="נשלחו" value={stats.applied} icon={CheckCircle2} tone="blue" />
          <StatTile label="המערכת למדה" value={stats.learningEvents} icon={Trophy} tone="purple" hint="סירובים, שמירות והגשות" />
          <StatTile label="בארכיון" value={stats.archived} icon={Network} tone="blue" hint="לא חוזרות לרשימה הפעילה" />
        </section>

        {scanSummary && (
          <section className="mt-4 overflow-hidden rounded-[2rem] border border-white/75 bg-white/85 p-5 shadow-xl shadow-slate-300/25 backdrop-blur-xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                  <ShieldCheck size={15} /> מנוע איכות פעיל
                </div>
                <h2 className="mt-2 text-xl font-black text-slate-950">סריקה אחרונה: {stats.scannedLastRun} נסרקו · {stats.filteredLastRun} סוננו · {stats.total} ממתינות לטיפול</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">הרשימה הראשית מציגה רק משרות שעברו מיקום, תפקיד, ניסיון, כפילויות ולמידה מהסירובים שלך.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(scanSummary.bySource || []).slice(0, 6).map((item) => (
                  <span key={item.source} className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                    {hebrewSource(item.source)} · {item.kept}/{item.total}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}
        

        <section className="sticky top-3 z-20 mt-6 rounded-[2rem] border border-white/75 bg-white/90 p-4 shadow-2xl shadow-slate-300/35 backdrop-blur-xl">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {tabs.map((tab) => {
              const count =
                tab.value === "review"
                  ? stats.reviewQueue
                  : tab.value === "saved"
                    ? stats.saved
                    : tab.value === "applied"
                      ? stats.applied
                      : tab.value === "archive"
                        ? stats.archived
                        : stats.total;

              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition ${activeTab === tab.value ? "bg-slate-950 text-white shadow-lg shadow-slate-300" : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}
                >
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.value ? "bg-white/20 text-white" : "bg-white text-slate-500"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.4fr_repeat(5,1fr)_auto] xl:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold text-slate-500">חיפוש</span>
              <div className="relative">
                <Search className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חפש לפי משרה, חברה, מיקום או סיבה"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-3 pr-11 text-sm font-bold text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </label>

            <SelectField label="התאמה" value={scoreFilter} onChange={setScoreFilter}>
              <option value="all">הכול</option>
              <option value="excellent">מעולה</option>
              <option value="good">טובה</option>
              <option value="medium">בינונית</option>
              <option value="low">נמוכה</option>
            </SelectField>

            <SelectField label="סטטוס" value={statusFilter} onChange={setStatusFilter}>
              <option value="all">כל הסטטוסים</option>
              {filterOptions.statuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectField>

            <SelectField label="מקור" value={sourceFilter} onChange={setSourceFilter}>
              <option value="all">כל המקורות</option>
              {filterOptions.sources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </SelectField>

            <SelectField label="מיקום" value={locationFilter} onChange={setLocationFilter}>
              <option value="all">כל המיקומים</option>
              {filterOptions.locations.map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </SelectField>

            <SelectField label="מיון" value={sortBy} onChange={setSortBy}>
              <option value="score-desc">התאמה גבוהה קודם</option>
              <option value="score-asc">התאמה נמוכה קודם</option>
              <option value="newest">חדש קודם</option>
              <option value="oldest">ישן קודם</option>
              <option value="title">לפי שם</option>
            </SelectField>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <Filter size={17} /> נקה
            </button>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-950">{filteredJobs.length} משרות מוצגות</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {activeTab === "review"
                  ? "אלו משרות שהמערכת הורידה מהרשימה הראשית, אבל אפשר לבדוק ידנית."
                  : activeTab === "archive"
                    ? "משרות שהסרת נשמרות כאן כארכיון ולמידה, ולא חוזרות לרשימות הפעילות."
                    : "הרשימות הפעילות מציגות רק משרות שעדיין צריך לטפל בהן."}
              </p>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-500 shadow-sm ring-1 ring-slate-200">
              {stats.applied} נשלחו · {stats.waiting} ממתינות · {stats.archived} בארכיון
            </div>
          </div>

          {filteredJobs.length > 0 ? (
            <div className="grid gap-4">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id || job.url}
                  job={job}
                  manualReview={activeTab === "review"}
                  sourceLabel={hebrewSource(job.source || job.via)}
                  readOnly={activeTab === "archive" || activeTab === "applied"}
                  onStatusChange={activeTab === "review" ? promoteReviewJob : updateStatus}
                  onDelete={activeTab === "review" ? rejectReviewJob : deleteJob}
                />
              ))}
            </div>
          ) : (
            <EmptyState activeTab={activeTab} onScan={runFinder} loading={loading} />
          )}
        </section>
      </div>
    </main>
  );
}
