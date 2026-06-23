import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Inbox,
  MailCheck,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import JobCard from "./components/JobCard.jsx";
import GmailJobsPanel from "./components/GmailJobsPanel.jsx";
import GmailAgentPanel from "./components/GmailAgentPanel.jsx";
import RoleManager from "./components/RoleManager.jsx";
import { apiDelete, apiGet, apiPatch, apiPost } from "./lib/api.js";

const tabs = [
  { value: "agent", label: "Gmail Agent — רק Gmail" },
  { value: "main", label: "לטיפול — כל המקורות" },
  { value: "review", label: "בדיקה ידנית — כל המקורות" },
  { value: "applied", label: "נשלחו — כל המקורות" },
  { value: "saved", label: "שמורות — כל המקורות" },
  { value: "archive", label: "ארכיון — כל המקורות" },
  { value: "gmail", label: "מיילים גולמיים" },
  { value: "roles", label: "תפקידים" },
];

function isClosedStatus(status = "") {
  return [
    "applied",
    "interview",
    "saved",
    "archived",
    "rejected",
    "skipped",
  ].includes(String(status || "found"));
}

function isArchivedJob(job = {}) {
  return ["archived", "rejected", "skipped"].includes(String(job.status || ""));
}

function isAppliedJob(job = {}) {
  return ["applied", "interview"].includes(String(job.status || ""));
}

function isWaitingJob(job = {}) {
  return (
    String(job.status || "found") === "found" &&
    !["review", "skip"].includes(String(job.recommendation || ""))
  );
}

function getScoreBand(score = 0) {
  const value = Number(score || 0);
  if (value >= 85) return "excellent";
  if (value >= 70) return "good";
  if (value >= 55) return "medium";
  return "low";
}

function hebrewSource(source = "") {
  const normalized = String(source || "").toLowerCase();
  if (normalized.includes("gmail"))
    return source.replace("Gmail · ", "Gmail · ") || "Gmail";
  if (normalized.includes("drushim")) return "דרושים";
  if (normalized.includes("alljobs")) return "AllJobs";
  if (normalized.includes("jobmaster")) return "JobMaster";
  if (normalized.includes("matrix")) return "Matrix";
  if (normalized.includes("site")) return "אתרי מקור";
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

function StatTile({ label, value, hint, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "from-slate-950 to-slate-800 text-white",
    green: "from-emerald-500 to-teal-500 text-white",
    blue: "from-sky-500 to-indigo-500 text-white",
    purple: "from-violet-500 to-fuchsia-500 text-white",
    amber: "from-amber-400 to-orange-500 text-white",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 shadow-xl shadow-slate-200/80 ${tones[tone] || tones.slate}`}
    >
      <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold opacity-80">{label}</p>
          <p className="mt-2 text-4xl font-black leading-none tracking-tight">
            {value}
          </p>
          {hint ? (
            <p className="mt-2 text-xs font-bold leading-5 opacity-75">
              {hint}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <div className="rounded-2xl bg-white/20 p-3 backdrop-blur">
            <Icon size={22} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold text-slate-500">
        {label}
      </span>
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
    {
      agent: "כאן מנהלים את Gmail Agent ומייבאים מיילים ממקורות משרות אמינים.",
      gmail: "עדיין לא יובאו מיילים גולמיים מ-Gmail.",
      roles: "כאן אפשר להוסיף, לכבות או למחוק תפקידי יעד.",
      archive: "עדיין אין משרות בארכיון.",
      saved: "עדיין אין משרות שמורות.",
      applied: "עדיין אין משרות שסומנו כנשלחו.",
      review: "אין כרגע משרות לבדיקה ידנית.",
      main: "אין משרות שממתינות לטיפול כרגע.",
    }[activeTab] || "הרשימה ריקה.";

  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
        <ClipboardCheck size={32} />
      </div>
      <h3 className="mt-4 text-2xl font-black text-slate-950">הרשימה ריקה</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-7 text-slate-500">
        {copy}
      </p>
      {activeTab === "main" ? (
        <button
          type="button"
          onClick={onScan}
          disabled={loading}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} /> סרוק
          עכשיו
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [reviewJobs, setReviewJobs] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [scanSummary, setScanSummary] = useState(null);
  const [agentSummary, setAgentSummary] = useState(null);
  const [scanProgress, setScanProgress] = useState(null);
  const [activeTab, setActiveTab] = useState("agent");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score-desc");

  async function loadAll() {
    const [jobsData, reviewData, feedbackData, scanData, agentData, progressData] =
      await Promise.all([
        apiGet("/api/jobs"),
        apiGet("/api/jobs/review").catch(() => []),
        apiGet("/api/feedback").catch(() => []),
        apiGet("/api/scan-summary").catch(() => null),
        apiGet("/api/gmail/agent-summary").catch(() => null),
        apiGet("/api/jobs/scan-progress").catch(() => null),
      ]);

    setJobs(Array.isArray(jobsData) ? jobsData : []);
    setReviewJobs(Array.isArray(reviewData) ? reviewData : []);
    setFeedback(Array.isArray(feedbackData) ? feedbackData : []);
    setScanSummary(scanData);
    setAgentSummary(agentData);
    setScanProgress(progressData);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!loading) return undefined;

    const timer = window.setInterval(() => {
      apiGet("/api/jobs/scan-progress")
        .then(setScanProgress)
        .catch(() => {});
    }, 2500);

    return () => window.clearInterval(timer);
  }, [loading]);

  async function runFinder({ resume = false, mode = "quick" } = {}) {
    setLoading(true);
    setError("");
    const scanLabel =
      mode === "deep" ? "סריקה עמוקה" : mode === "quick" ? "סריקה מהירה" : "סריקה";
    setMessage(`${scanLabel} התחילה. המערכת מחפשת ומעדכנת את הרשימה.`);

    try {
      const result = await apiPost("/api/jobs/find", { resume, mode });
      setScanProgress(result.progress || null);
      await loadAll();
      setMessage(
        result.stopped
          ? `הסריקה נעצרה ונשמרה: נסרקו במקטע הזה ${result.scanned || 0}, נוספו ${result.newJobs || 0}, נשמרו ${result.totalJobs || 0}. אפשר להמשיך מאותה נקודה.`
          : `הסריקה הסתיימה: נסרקו ${result.scanned || 0}, נוספו ${result.newJobs || 0}, נשמרו ${result.totalJobs || 0}.`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function stopScan() {
    try {
      const progress = await apiPost("/api/jobs/scan-stop");
      setScanProgress(progress);
      setMessage("ביקשתי לעצור את הסריקה. היא תיעצר אחרי המקור הנוכחי ותשמור את מה שכבר נסרק.");
    } catch (err) {
      setError(err.message);
    }
  }

  function successMessage(status, fromReview = false) {
    if (status === "applied")
      return fromReview
        ? "סומן כנשלח והמערכת תלמד שזו משרה טובה."
        : "סומן כנשלח והועבר לטאב נשלחו.";
    if (status === "saved")
      return fromReview
        ? "המשרה נשמרה והמערכת תלמד שכדאי לחפש דומות."
        : "המשרה נשמרה.";
    return "סטטוס המשרה עודכן.";
  }

  async function updateStatus(id, status) {
    await apiPatch(`/api/jobs/${encodeURIComponent(id)}`, { status });
    await loadAll();
    setMessage(successMessage(status));
    if (status === "applied") setActiveTab("applied");
    if (status === "saved") setActiveTab("saved");
  }

  async function promoteReviewJob(id, status) {
    await apiPost(`/api/jobs/review/${encodeURIComponent(id)}/promote`, {
      status,
    });
    await loadAll();
    setMessage(successMessage(status, true));
    if (status === "applied") setActiveTab("applied");
    if (status === "saved") setActiveTab("saved");
  }

  async function deleteJob(id, feedbackPayload = {}) {
    await apiDelete(`/api/jobs/${encodeURIComponent(id)}`, feedbackPayload);
    await loadAll();
    setMessage("המשרה הועברה לארכיון. הסיבה נשמרה ללמידה.");
  }

  async function rejectReviewJob(id, feedbackPayload = {}) {
    await apiPost(
      `/api/jobs/review/${encodeURIComponent(id)}/reject`,
      feedbackPayload,
    );
    await loadAll();
    setMessage("המשרה הוסרה מבדיקה ידנית. הסיבה נשמרה ללמידה.");
  }

  function resetFilters() {
    setSearch("");
    setScoreFilter("all");
    setSourceFilter("all");
    setLocationFilter("all");
    setStatusFilter("all");
    setSortBy("score-desc");
  }

  const tabJobs = useMemo(() => {
    if (activeTab === "review") return reviewJobs;
    if (activeTab === "applied") return jobs.filter(isAppliedJob);
    if (activeTab === "saved")
      return jobs.filter((job) => job.status === "saved");
    if (activeTab === "archive") return jobs.filter(isArchivedJob);
    return jobs.filter(isWaitingJob);
  }, [activeTab, jobs, reviewJobs]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();

    const result = tabJobs.filter((job) => {
      const text = [
        job.title,
        job.company,
        job.location,
        job.source,
        job.description,
        ...(job.reasons || []),
        ...(job.warnings || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (term && !text.includes(term)) return false;
      if (scoreFilter !== "all" && getScoreBand(job.fitScore) !== scoreFilter)
        return false;
      if (sourceFilter !== "all" && String(job.source || "") !== sourceFilter)
        return false;
      if (
        locationFilter !== "all" &&
        String(job.location || "") !== locationFilter
      )
        return false;
      if (
        statusFilter !== "all" &&
        String(job.status || "found") !== statusFilter
      )
        return false;
      return true;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "score-asc")
        return Number(a.fitScore || 0) - Number(b.fitScore || 0);
      if (sortBy === "newest")
        return (
          new Date(b.publishedAt || b.importedFromGmailAt || 0) -
          new Date(a.publishedAt || a.importedFromGmailAt || 0)
        );
      if (sortBy === "oldest")
        return (
          new Date(a.publishedAt || a.importedFromGmailAt || 0) -
          new Date(b.publishedAt || b.importedFromGmailAt || 0)
        );
      if (sortBy === "title")
        return String(a.title || "").localeCompare(String(b.title || ""), "he");
      return Number(b.fitScore || 0) - Number(a.fitScore || 0);
    });
  }, [
    tabJobs,
    search,
    scoreFilter,
    sourceFilter,
    locationFilter,
    statusFilter,
    sortBy,
  ]);

  const filterOptions = useMemo(() => {
    const allVisible = activeTab === "review" ? reviewJobs : jobs;
    return {
      sources: [
        ...new Set(allVisible.map((job) => job.source).filter(Boolean)),
      ].sort(),
      locations: [
        ...new Set(allVisible.map((job) => job.location).filter(Boolean)),
      ].sort((a, b) => String(a).localeCompare(String(b), "he")),
      statuses: [
        ...new Set(allVisible.map((job) => job.status || "found")),
      ].sort(),
    };
  }, [activeTab, jobs, reviewJobs]);

  const stats = useMemo(() => {
    const actionable = jobs.filter(isWaitingJob);
    const appliedToday = jobs.filter(
      (job) => isAppliedJob(job) && isToday(job.updatedAt || job.appliedAt),
    ).length;
    return {
      total: actionable.length,
      apply: actionable.filter((job) => job.recommendation === "apply").length,
      review: reviewJobs.length,
      applied: jobs.filter(isAppliedJob).length,
      saved: jobs.filter((job) => job.status === "saved").length,
      archived: jobs.filter(isArchivedJob).length,
      appliedToday,
      learningEvents: feedback.length,
      gmailJobs:
        agentSummary?.gmailJobsTotal ||
        jobs.filter((job) => /Gmail/i.test(String(job.source || ""))).length,
    };
  }, [jobs, reviewJobs, feedback, agentSummary]);

  const scanStepsDone = Number(scanProgress?.completedSteps ?? scanProgress?.nextStepIndex ?? 0);
  const scanStepsTotal = Number(scanProgress?.totalSteps ?? 0);
  const scanPercent = scanStepsTotal
    ? Math.round((scanStepsDone / scanStepsTotal) * 100)
    : 0;
  const canResumeScan =
    Boolean(scanProgress?.stopped) &&
    !scanProgress?.completed &&
    scanStepsTotal > 0 &&
    scanStepsDone < scanStepsTotal;

  const currentTabCount = (tab) => {
    if (tab === "agent") return agentSummary?.activeGmailJobs ?? "";
    if (tab === "gmail" || tab === "roles") return "";
    if (tab === "review") return stats.review;
    if (tab === "applied") return stats.applied;
    if (tab === "saved") return stats.saved;
    if (tab === "archive") return stats.archived;
    return stats.total;
  };

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] px-4 py-6 text-slate-950"
      dir="rtl"
    >
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-2xl shadow-slate-300/30 backdrop-blur-xl">
          <div className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
                <MailCheck size={15} /> Gmail Agent + למידה
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
                סוכן המשרות האישי
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-600">
                Gmail הוא הסוכן המרכזי: אתרי המשרות שולחים התראות מסוננות למייל,
                והמערכת ממיינת אותן ללטיפול, בדיקה ידנית, נשלחו וארכיון — בלי
                לזרוק מיילים ממקורות אמינים רק בגלל ניקוד נמוך.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => runFinder({ resume: false, mode: "quick" })}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
              >
                <RefreshCw
                  size={18}
                  className={loading ? "animate-spin" : ""}
                />{" "}
                סריקה מהירה
              </button>
              <button
                type="button"
                onClick={() => runFinder({ resume: false, mode: "deep" })}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm font-black text-indigo-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-100 disabled:opacity-60"
              >
                <RefreshCw
                  size={18}
                  className={loading ? "animate-spin" : ""}
                />{" "}
                סריקה עמוקה
              </button>

              {canResumeScan ? (
                <button
                  type="button"
                  onClick={() => runFinder({ resume: true })}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white shadow-xl shadow-amber-200 transition hover:-translate-y-0.5 hover:bg-amber-600 disabled:opacity-60"
                >
                  המשך סריקה
                </button>
              ) : null}

              {loading ? (
                <button
                  type="button"
                  onClick={stopScan}
                  className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 shadow-sm transition hover:bg-red-100"
                >
                  עצור אחרי המקטע הנוכחי
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setActiveTab("agent")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Inbox size={18} /> ניהול Gmail Agent
              </button>
            </div>
          </div>
        </header>

        {message || error ? (
          <div
            className={`mt-4 rounded-3xl border px-5 py-4 text-sm font-black shadow-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
          >
            {error || message}
          </div>
        ) : null}

        {scanProgress?.running || canResumeScan ? (
          <div className="mt-4 rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-black text-slate-800">
                מצב סריקה: {scanProgress?.message || "יש התקדמות שמורה"}
              </div>
              <div className="text-xs font-bold text-slate-500">
                {scanStepsDone}/{scanStepsTotal} · {scanPercent}%
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, scanPercent))}%` }}
              />
            </div>
            {scanProgress?.currentProvider || scanProgress?.currentQuery ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                עכשיו: {scanProgress.currentProvider || "מקור"} · {scanProgress.currentQuery || "שאילתה"}
              </p>
            ) : null}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatTile
            label="Gmail Agent"
            value={stats.gmailJobs}
            icon={MailCheck}
            tone="purple"
            hint="משרות שהגיעו מהמייל"
          />
          <StatTile label="לטיפול עכשיו" value={stats.total} icon={BarChart3} />
          <StatTile
            label="מומלץ לשלוח"
            value={stats.apply}
            icon={Sparkles}
            tone="green"
          />
          <StatTile
            label="בדיקה ידנית"
            value={stats.review}
            icon={ClipboardCheck}
            tone="amber"
          />
          <StatTile
            label="נשלחו"
            value={stats.applied}
            icon={CheckCircle2}
            tone="blue"
            hint={`${stats.appliedToday} היום`}
          />
          <StatTile
            label="למידה"
            value={stats.learningEvents}
            icon={Trophy}
            tone="purple"
            hint="פידבקים ופעולות"
          />
        </section>

        {scanSummary ? (
          <section className="mt-4 rounded-[2rem] border border-white/75 bg-white/85 p-5 shadow-xl shadow-slate-300/25 backdrop-blur-xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">מצב מערכת</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Gmail Agent פעיל לצד הסריקות הרגילות. מקורות מייל אמינים
                  נכנסים למערכת או לבדיקה ידנית, ומכל שליחה/שמירה/דחייה נוצרת
                  למידה.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(scanSummary.bySource || []).slice(0, 6).map((item) => (
                  <span
                    key={item.source}
                    className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200"
                  >
                    {hebrewSource(item.source)} · {item.kept}/{item.total}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="sticky top-3 z-20 mt-6 rounded-[2rem] border border-white/75 bg-white/90 p-4 shadow-2xl shadow-slate-300/35 backdrop-blur-xl">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {tabs.map((tab) => {
              const count = currentTabCount(tab.value);
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition ${activeTab === tab.value ? "bg-slate-950 text-white shadow-lg shadow-slate-300" : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"}`}
                >
                  {tab.label}
                  {count !== "" ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.value ? "bg-white/20 text-white" : "bg-white text-slate-500"}`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {!["agent", "gmail", "roles"].includes(activeTab) ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-[1.4fr_repeat(5,1fr)_auto] xl:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-slate-500">
                  חיפוש
                </span>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="חפש לפי משרה, חברה, מיקום או סיבה"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-3 pr-11 text-sm font-bold text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
              </label>

              <SelectField
                label="התאמה"
                value={scoreFilter}
                onChange={setScoreFilter}
              >
                <option value="all">הכול</option>
                <option value="excellent">מעולה</option>
                <option value="good">טובה</option>
                <option value="medium">בינונית</option>
                <option value="low">נמוכה</option>
              </SelectField>

              <SelectField
                label="סטטוס"
                value={statusFilter}
                onChange={setStatusFilter}
              >
                <option value="all">כל הסטטוסים</option>
                {filterOptions.statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="מקור"
                value={sourceFilter}
                onChange={setSourceFilter}
              >
                <option value="all">כל המקורות</option>
                {filterOptions.sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="מיקום"
                value={locationFilter}
                onChange={setLocationFilter}
              >
                <option value="all">כל המיקומים</option>
                {filterOptions.locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
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
          ) : null}
        </section>

        {activeTab === "agent" ? (
          <section className="mt-6">
            <GmailAgentPanel
              onMessage={setMessage}
              onError={setError}
              onImported={loadAll}
            />
          </section>
        ) : activeTab === "gmail" ? (
          <section className="mt-6">
            <GmailJobsPanel
              onMessage={setMessage}
              onError={setError}
              onImportedToJobs={loadAll}
            />
          </section>
        ) : activeTab === "roles" ? (
          <section className="mt-6">
            <RoleManager onMessage={setMessage} onError={setError} />
          </section>
        ) : (
          <section className="mt-6">
            <div className="mb-4 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  {filteredJobs.length} משרות מוצגות
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {activeTab === "review"
                    ? "משרות שלא נזרקו — הן ממתינות להחלטה שלך, וההחלטה תלמד את המערכת."
                    : activeTab === "archive"
                      ? "משרות שהוסרו נשמרות כאן כדי לא להעמיס על הרשימות הפעילות."
                      : activeTab === "applied"
                        ? "משרות שסימנת ששלחת אליהן."
                        : activeTab === "saved"
                          ? "משרות ששמרת להמשך."
                          : "הרשימה הפעילה של משרות לטיפול."}
                </p>
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-500 shadow-sm ring-1 ring-slate-200">
                {stats.applied} נשלחו · {stats.review} לבדיקה · {stats.archived}{" "}
                בארכיון
              </div>
            </div>

            {filteredJobs.length > 0 ? (
              <div className="grid gap-4">
                {filteredJobs.map((job) => (
                  <JobCard
                    key={job.id || job.url || job.title}
                    job={job}
                    manualReview={activeTab === "review"}
                    sourceLabel={hebrewSource(job.source || job.via)}
                    readOnly={
                      activeTab === "archive" || activeTab === "applied"
                    }
                    onStatusChange={
                      activeTab === "review" ? promoteReviewJob : updateStatus
                    }
                    onDelete={
                      activeTab === "review" ? rejectReviewJob : deleteJob
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                activeTab={activeTab}
                onScan={() => runFinder({ mode: "quick" })}
                loading={loading}
              />
            )}
          </section>
        )}
      </div>
    </main>
  );
}
