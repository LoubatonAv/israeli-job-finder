import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, RefreshCw, Search, Sparkles } from 'lucide-react';
import JobCard from './components/JobCard.jsx';
import { apiDelete, apiGet, apiPatch, apiPost } from './lib/api.js';

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  async function loadJobs() {
    setError('');
    const data = await apiGet('/api/jobs');
    setJobs(data);
  }

  useEffect(() => {
    loadJobs().catch((err) => setError(err.message));
  }, []);

  async function runFinder(useMock = false) {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await apiPost(useMock ? '/api/jobs/mock' : '/api/jobs/find');
      setJobs(result.jobs || []);
      setMessage(`Scanned ${result.scanned}. Added ${result.newJobs} new jobs. Total saved: ${result.totalJobs}.`);
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

  async function deleteJob(id) {
    await apiDelete(`/api/jobs/${id}`);
    setJobs((current) => current.filter((job) => job.id !== id));
  }

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const text = [job.title, job.company, job.location, job.description].join(' ').toLowerCase();
      const matchesSearch = !q || text.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: jobs.length,
      apply: jobs.filter((job) => job.recommendation === 'apply').length,
      applied: jobs.filter((job) => job.status === 'applied').length,
      interviews: jobs.filter((job) => job.status === 'interview').length
    };
  }, [jobs]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-slate-200">
                <BriefcaseBusiness size={16} /> Israel-first Job Finder
              </div>
              <h1 className="text-3xl font-bold md:text-4xl">Find, score, and track jobs</h1>
              <p className="mt-2 max-w-2xl text-slate-300">
                Searches Israel-focused QA, automation, fraud, risk, and information-specialist jobs. Nothing is submitted automatically.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => runFinder(false)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-semibold text-slate-950 hover:bg-slate-100 disabled:opacity-60"
              >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <Search size={18} />}
                Find Jobs
              </button>
              <button
                onClick={() => runFinder(true)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                <Sparkles size={18} /> Load mock jobs
              </button>
            </div>
          </div>
        </header>

        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{message}</div> : null}
        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <Stat label="Total saved" value={stats.total} />
          <Stat label="Recommended apply" value={stats.apply} />
          <Stat label="Applied" value={stats.applied} />
          <Stat label="Interviews" value={stats.interviews} />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, company, location, description..."
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400"
            >
              <option value="all">All statuses</option>
              <option value="found">found</option>
              <option value="saved">saved</option>
              <option value="applied">applied</option>
              <option value="interview">interview</option>
              <option value="rejected">rejected</option>
              <option value="skipped">skipped</option>
            </select>
          </div>
        </section>

        <section className="mt-6 space-y-4">
          {filteredJobs.length ? (
            filteredJobs.map((job) => (
              <JobCard key={job.id} job={job} onStatusChange={updateStatus} onDelete={deleteJob} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              No jobs yet. Click <strong>Load mock jobs</strong> to test, or add a SerpApi key and click <strong>Find Jobs</strong>.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
