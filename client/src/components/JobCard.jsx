import { ExternalLink, Trash2 } from 'lucide-react';

const statusOptions = ['found', 'saved', 'applied', 'interview', 'rejected', 'skipped'];

function badgeClass(score) {
  if (score >= 75) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (score >= 55) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function JobCard({ job, onStatusChange, onDelete }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${badgeClass(job.fitScore)}`}>
              Fit {job.fitScore ?? 0}/100
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {job.recommendation || 'review'}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
              {job.status || 'found'}
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-950">{job.title}</h2>
          <p className="text-sm text-slate-600">
            {job.company} · {job.location || 'Israel'} · {job.via || job.source}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Apply manually <ExternalLink size={16} />
            </a>
          ) : null}
          <button
            onClick={() => onDelete(job.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-700">
        {job.description || 'No description available.'}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Why it fits</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {(job.reasons || []).slice(0, 4).map((reason, index) => (
              <li key={index}>• {reason}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Warnings</p>
          {job.warnings?.length ? (
            <ul className="space-y-1 text-sm text-slate-700">
              {job.warnings.slice(0, 4).map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No major warnings.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-slate-500">
          Found: {job.foundAt ? new Date(job.foundAt).toLocaleString() : 'Unknown'}
        </div>
        <select
          value={job.status || 'found'}
          onChange={(event) => onStatusChange(job.id, event.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
    </article>
  );
}
