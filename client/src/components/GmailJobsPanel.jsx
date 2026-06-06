import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Inbox, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';

function formatDate(value) {
  if (!value) return 'לא ידוע';

  try {
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'לא ידוע';
  }
}

function cleanSender(value = '') {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || 'שולח לא ידוע';
}

export default function GmailJobsPanel({ onMessage, onError }) {
  const [status, setStatus] = useState({ connected: false });
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [localMessage, setLocalMessage] = useState('');

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.date || b.importedAt || 0) - new Date(a.date || a.importedAt || 0)),
    [jobs],
  );

  async function refresh() {
    const [gmailStatus, gmailJobs] = await Promise.all([
      apiGet('/api/gmail/status'),
      apiGet('/api/gmail/jobs').catch(() => []),
    ]);

    setStatus(gmailStatus || { connected: false });
    setJobs(Array.isArray(gmailJobs) ? gmailJobs : []);
  }

  useEffect(() => {
    refresh().catch((error) => {
      setLocalMessage(error.message);
      onError?.(error.message);
    });
  }, []);

  async function connectGmail() {
    setLoading(true);
    setLocalMessage('');

    try {
      const { url } = await apiGet('/api/gmail/auth-url');
      window.location.href = url;
    } catch (error) {
      setLocalMessage(error.message);
      onError?.(error.message);
      setLoading(false);
    }
  }

  async function importFromGmail() {
    setLoading(true);
    setLocalMessage('מייבא מיילים רלוונטיים מהשבועיים האחרונים...');

    try {
      const result = await apiPost('/api/gmail/import', {
        days: 14,
        maxResults: 40,
      });

      await refresh();
      const text = `יובאו ${result.total || 0} מיילים רלוונטיים מ-Gmail. סך הכול שמורים: ${result.savedTotal || 0}.`;
      setLocalMessage(text);
      onMessage?.(text);
    } catch (error) {
      setLocalMessage(error.message);
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/75 bg-white/90 shadow-2xl shadow-slate-300/35 backdrop-blur-xl" dir="rtl">
      <div className="border-b border-slate-100 bg-gradient-to-l from-indigo-50 via-white to-emerald-50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
              <ShieldCheck size={15} /> הרשאה מינימלית: קריאה בלבד
            </div>
            <h2 className="mt-3 text-2xl font-black text-slate-950">ייבוא משרות ממיילים</h2>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-500">
              המערכת מחפשת רק מיילים רלוונטיים מהשבועיים האחרונים לפי שאילתת Gmail מוגבלת, ולא סורקת את כל התיבה סתם.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!status.connected ? (
              <button
                type="button"
                onClick={connectGmail}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
              >
                <Mail size={18} /> חבר Gmail
              </button>
            ) : (
              <button
                type="button"
                onClick={importFromGmail}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-500 disabled:opacity-60"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> ייבא מיילים עכשיו
              </button>
            )}

            <button
              type="button"
              onClick={() => refresh().catch((error) => setLocalMessage(error.message))}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              רענן
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-black text-slate-400">סטטוס חיבור</p>
            <p className={`mt-1 text-lg font-black ${status.connected ? 'text-emerald-700' : 'text-red-600'}`}>
              {status.connected ? 'מחובר' : 'לא מחובר'}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-black text-slate-400">מיילים שנשמרו</p>
            <p className="mt-1 text-lg font-black text-slate-950">{jobs.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-black text-slate-400">טווח חיפוש</p>
            <p className="mt-1 text-lg font-black text-slate-950">14 ימים אחרונים</p>
          </div>
        </div>

        {localMessage && (
          <div className="mt-4 rounded-3xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900">
            {localMessage}
          </div>
        )}
      </div>

      <div className="p-5">
        {sortedJobs.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-500 shadow-sm">
              <Inbox size={32} />
            </div>
            <h3 className="mt-4 text-2xl font-black text-slate-950">עדיין אין מיילים מיובאים</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-7 text-slate-500">
              חבר Gmail ואז לחץ על ייבוא. בשלב הבא נחבר את המיילים האלה לניקוד ההתאמה של המשרות.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
            <div className="hidden grid-cols-[1.3fr_1fr_140px_1.8fr_150px] gap-3 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500 lg:grid">
              <span>כותרת</span>
              <span>שולח</span>
              <span>תאריך</span>
              <span>תקציר</span>
              <span>קישורים</span>
            </div>

            <div className="divide-y divide-slate-100">
              {sortedJobs.map((job) => (
                <article key={job.id} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.3fr_1fr_140px_1.8fr_150px] lg:items-start">
                  <div>
                    <p className="font-black leading-6 text-slate-950">{job.title}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400 lg:hidden">{formatDate(job.date)}</p>
                  </div>
                  <p className="font-bold text-slate-600">{cleanSender(job.sender)}</p>
                  <p className="hidden whitespace-nowrap font-bold text-slate-500 lg:block">{formatDate(job.date)}</p>
                  <p className="line-clamp-3 font-semibold leading-6 text-slate-600">{job.snippet}</p>
                  <div className="flex flex-wrap gap-2">
                    {job.links?.length ? (
                      job.links.slice(0, 3).map((link, index) => (
                        <a
                          key={`${job.id}-${index}`}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-2xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-100"
                        >
                          פתח <ExternalLink size={13} />
                        </a>
                      ))
                    ) : (
                      <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-400">אין קישור</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
