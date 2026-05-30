import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  PartyPopper,
  RefreshCw,
  Search,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import JobCard from "./components/JobCard.jsx";
import { apiDelete, apiGet, apiPatch, apiPost } from "./lib/api.js";

function getScoreBand(score = 0) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "medium";
  return "low";
}

function Stat({ label, value, tone = "slate" }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-white text-slate-900",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
      >
        {children}
      </select>
    </label>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score-desc");

  async function loadJobs() {
    setError("");
    const data = await apiGet("/api/jobs");
    setJobs(data);
  }

  useEffect(() => {
    loadJobs().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!loading) return;

    const intervalId = setInterval(() => {
      loadJobs().catch((err) => setError(err.message));
    }, 2000);

    return () => clearInterval(intervalId);
  }, [loading]);

  async function runFinder(useMock = false) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await apiPost(
        useMock ? "/api/jobs/mock" : "/api/jobs/find",
      );

      setJobs(result.jobs || []);
      setMessage(
        `Scanned ${result.scanned}. Added ${result.newJobs} new jobs. Total saved: ${result.totalJobs}.`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    const updated = await apiPatch(`/api/jobs/${id}`, { status });
    setJobs((current) => current.map((job) => (job.id === id ? updated : job)));
  }

  async function deleteJob(id, feedback = {}) {
    await apiDelete(`/api/jobs/${id}`, feedback);
    setJobs((current) => current.filter((job) => job.id !== id));
  }

  const filterOptions = useMemo(() => {
    const sources = [
      ...new Set(jobs.map((job) => job.source || job.via).filter(Boolean)),
    ].sort();

    const locations = [
      ...new Set(jobs.map((job) => job.location).filter(Boolean)),
    ].sort();

    return { sources, locations };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return jobs
      .filter((job) => {
        const score = job.fitScore || 0;
        const band = getScoreBand(score);

        const matchesStatus =
          statusFilter === "all" || job.status === statusFilter;

        const matchesScore = scoreFilter === "all" || band === scoreFilter;

        const matchesSource =
          sourceFilter === "all" ||
          job.source === sourceFilter ||
          job.via === sourceFilter;

        const matchesLocation =
          locationFilter === "all" || job.location === locationFilter;

        const text = [
          job.title,
          job.company,
          job.location,
          job.description,
          job.source,
          job.via,
          ...(job.reasons || []),
          ...(job.warnings || []),
        ]
          .join(" ")
          .toLowerCase();

        return (
          matchesStatus &&
          matchesScore &&
          matchesSource &&
          matchesLocation &&
          (!q || text.includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.foundAt || 0) - new Date(a.foundAt || 0);
        }

        if (sortBy === "oldest") {
          return new Date(a.foundAt || 0) - new Date(b.foundAt || 0);
        }

        if (sortBy === "title") {
          return String(a.title || "").localeCompare(String(b.title || ""));
        }

        if (sortBy === "score-asc") {
          return (a.fitScore || 0) - (b.fitScore || 0);
        }

        const scoreDiff = (b.fitScore || 0) - (a.fitScore || 0);
        if (scoreDiff) return scoreDiff;

        return new Date(b.foundAt || 0) - new Date(a.foundAt || 0);
      });
  }, [
    jobs,
    search,
    statusFilter,
    scoreFilter,
    sourceFilter,
    locationFilter,
    sortBy,
  ]);

  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA");
    const isToday = (value) => {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      return date.toLocaleDateString("en-CA") === today;
    };

    return {
      total: jobs.length,
      saved: jobs.filter((job) => job.status === "saved").length,
      applied: jobs.filter((job) => job.status === "applied").length,
      appliedToday: jobs.filter(
        (job) => job.status === "applied" && isToday(job.updatedAt || job.foundAt),
      ).length,
      excellent: jobs.filter((job) => (job.fitScore || 0) >= 80).length,
      good: jobs.filter(
        (job) => (job.fitScore || 0) >= 60 && (job.fitScore || 0) < 80,
      ).length,
      medium: jobs.filter(
        (job) => (job.fitScore || 0) >= 40 && (job.fitScore || 0) < 60,
      ).length,
      low: jobs.filter((job) => (job.fitScore || 0) < 40).length,
    };
  }, [jobs]);

  const dailyGoal = 5;
  const dailyProgress = Math.min(100, Math.round((stats.appliedToday / dailyGoal) * 100));
  const reachedDailyGoal = stats.appliedToday >= dailyGoal;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setScoreFilter("all");
    setSourceFilter("all");
    setLocationFilter("all");
    setSortBy("score-desc");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-[980px]">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <BriefcaseBusiness size={14} /> Israeli Job Finder
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-950">
                משרות שמדורגות לפי התאמה
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                סינון שקט וממוקד ל־QA, Data, Risk, Fraud, Document Control
                ותפקידים טכניים רגועים. שום דבר לא נשלח אוטומטית.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runFinder(false)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? (
                  <RefreshCw className="animate-spin" size={16} />
                ) : (
                  <Search size={16} />
                )}
                הרץ חיפוש
              </button>

              <button
                onClick={() => runFinder(true)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <Sparkles size={16} /> Load mock
              </button>
            </div>
          </div>
        </header>

        {message && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="סה״כ משרות" value={stats.total} />
          <Stat label="שמורות" value={stats.saved} tone="amber" />
          <Stat label="הוגשו סה״כ" value={stats.applied} tone="emerald" />
          <Stat label="הוגשו היום" value={`${stats.appliedToday}/${dailyGoal}`} tone="emerald" />
          <Stat label="<40 לא מתאים" value={stats.low} tone="red" />
        </section>

        <section className={`mt-4 overflow-hidden rounded-3xl border p-4 shadow-sm ${
          reachedDailyGoal
            ? "border-emerald-200 bg-emerald-50"
            : "border-slate-200 bg-white"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">יעד יומי: {dailyGoal} הגשות איכותיות</p>
              <p className="mt-1 text-xs text-slate-500">
                עדיף 5 הגשות ממוקדות ביום מאשר 20 זריקות עיוורות. שמירה עוזרת לבנות רשימת בדיקה, אבל היעד נמדד לפי applied.
              </p>
            </div>

            {reachedDailyGoal && (
              <div className="inline-flex animate-bounce items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-black text-emerald-700 shadow-sm">
                <PartyPopper size={16} /> יעד הושלם
              </div>
            )}
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${dailyProgress}%` }}
            />
          </div>
        </section>

        <section className="sticky top-3 z-10 mt-5 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <SlidersHorizontal size={16} />
            סינון ומיון
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(5,minmax(140px,1fr))_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                חיפוש חופשי
              </span>

              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חפש לפי תפקיד, חברה, עיר, טכנולוגיה..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </label>

            <SelectField
              label="סטטוס"
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <option value="all">כל הסטטוסים</option>
              <option value="found">found</option>
              <option value="saved">saved</option>
              <option value="applied">applied</option>
            </SelectField>

            <SelectField
              label="ציון"
              value={scoreFilter}
              onChange={setScoreFilter}
            >
              <option value="all">כל הציונים</option>
              <option value="excellent">80+ גבוה</option>
              <option value="good">60-79 טוב</option>
              <option value="medium">40-59 בינוני</option>
              <option value="low">מתחת ל־40</option>
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
              <option value="score-desc">ציון גבוה לנמוך</option>
              <option value="score-asc">ציון נמוך לגבוה</option>
              <option value="newest">הכי חדש</option>
              <option value="oldest">הכי ישן</option>
              <option value="title">לפי שם משרה</option>
            </SelectField>

            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                נקה
              </button>
            </div>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            מציג{" "}
            <span className="font-bold text-slate-900">
              {filteredJobs.length}
            </span>{" "}
            מתוך <span className="font-bold text-slate-900">{jobs.length}</span>{" "}
            משרות
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const savedJobs = jobs.filter((job) => job.status === "saved");

                savedJobs.forEach((job, index) => {
                  if (!job.url) return;

                  setTimeout(() => {
                    window.open(job.url, "_blank");
                  }, index * 400);
                });
              }}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
            >
              Open saved jobs
            </button>

            <button
              onClick={() => {
                const applyJobs = jobs.filter(
                  (job) => job.recommendation === "apply",
                );

                applyJobs.forEach((job, index) => {
                  if (!job.url) return;

                  setTimeout(() => {
                    window.open(job.url, "_blank");
                  }, index * 400);
                });
              }}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
            >
              Open apply jobs
            </button>
          </div>
        </div>

        <section className="mt-4 space-y-4">
          {filteredJobs.length ? (
            filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onStatusChange={updateStatus}
                onDelete={deleteJob}
              />
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-lg font-bold text-slate-800">אין תוצאות</p>
              <p className="mt-1 text-sm text-slate-500">
                נסה לנקות פילטרים או להריץ חיפוש חדש.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
