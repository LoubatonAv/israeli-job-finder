import { useEffect, useMemo, useState } from "react";
import {
  BadgePlus,
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api.js";

const emptyForm = {
  id: "",
  name: "",
  roleFamily: "custom",
  roleType: "",
  mainListMinScore: 58,
  scoreBonus: 28,
  queries: "",
  positivePatterns: "",
  negativePatterns: "",
};

const rolePresets = [
  {
    id: "qa_manual_junior",
    name: "QA ידני ג׳וניור",
    roleFamily: "qa",
    roleType: "qa_manual_junior",
    mainListMinScore: 58,
    scoreBonus: 30,
    queries: [
      "בודק תוכנה junior חיפה",
      "בודק תוכנה ללא ניסיון חיפה",
      "QA junior חיפה",
      "Manual QA חיפה",
      "בודק תוכנה קריות",
      "בודק תוכנה יקנעם",
      "QA ללא ניסיון צפון",
    ].join(", "),
    positivePatterns: [
      "בודק תוכנה",
      "בדיקות תוכנה",
      "manual qa",
      "qa manual",
      "qa junior",
      "tester",
      "testing",
      "ללא ניסיון",
      "ג׳וניור",
      "junior",
    ].join(", "),
    negativePatterns: [
      "senior",
      "lead",
      "ראש צוות",
      "מנהל",
      "מנוסה",
      "3 שנים",
      "4 שנים",
      "5 שנים",
      "developer",
      "full stack",
      "frontend",
      "backend",
      "software engineer",
      "sales",
      "טלפוני",
      "מוקד",
      "שירות לקוחות",
      "מרכז",
      "תל אביב",
      "פתח תקווה",
      "רמת גן",
      "הרצליה",
      "כפר סבא",
    ].join(", "),
  },
  {
    id: "data_analyst_junior",
    name: "Data Analyst ג׳וניור",
    roleFamily: "analysis",
    roleType: "data_analyst_junior",
    mainListMinScore: 60,
    scoreBonus: 26,
    queries: [
      "data analyst junior חיפה",
      "data analyst ללא ניסיון חיפה",
      "אנליסט נתונים חיפה",
      "אנליסט דאטה חיפה",
      "BI analyst junior חיפה",
      "data analyst קריות",
      "data analyst יקנעם",
      "אנליסט נתונים צפון",
    ].join(", "),
    positivePatterns: [
      "data analyst",
      "אנליסט נתונים",
      "אנליסט דאטה",
      "bi analyst",
      "business intelligence",
      "sql",
      "excel",
      "power bi",
      "tableau",
      "דוחות",
      "ניתוח נתונים",
      "junior",
      "ג׳וניור",
      "ללא ניסיון",
    ].join(", "),
    negativePatterns: [
      "data engineer",
      "data scientist",
      "machine learning",
      "אלגוריתמים",
      "developer",
      "software developer",
      "software engineer",
      "full stack",
      "frontend",
      "backend",
      "senior",
      "lead",
      "ראש צוות",
      "מנהל",
      "3 שנים",
      "4 שנים",
      "5 שנים",
      "sales",
      "טלפוני",
      "מוקד",
      "שירות לקוחות",
      "מרכז",
      "תל אביב",
      "פתח תקווה",
      "רמת גן",
      "הרצליה",
    ].join(", "),
  },
  {
    id: "back_office_data_entry",
    name: "Back Office / Data Entry",
    roleFamily: "operations",
    roleType: "back_office_data_entry",
    mainListMinScore: 55,
    scoreBonus: 22,
    queries: [
      "back office חיפה",
      "data entry חיפה",
      "הזנת נתונים חיפה",
      "בק אופיס חיפה",
      "back office קריות",
      "data entry קריות",
      "הזנת נתונים צפון",
    ].join(", "),
    positivePatterns: [
      "back office",
      "בק אופיס",
      "data entry",
      "הזנת נתונים",
      "קליטת נתונים",
      "תפעול",
      "אדמיניסטרציה",
      "excel",
      "office",
    ].join(", "),
    negativePatterns: [
      "מכירות",
      "sales",
      "טלפוני",
      "מוקד",
      "שירות לקוחות",
      "פרונטלי",
      "משמרות",
      "ערב",
      "סופי שבוע",
      "שישי",
      "senior",
      "מנהל",
      "ראש צוות",
      "מרכז",
      "תל אביב",
      "פתח תקווה",
      "רמת גן",
    ].join(", "),
  },
  {
    id: "document_control",
    name: "בקרת מסמכים",
    roleFamily: "information",
    roleType: "document_control",
    mainListMinScore: 55,
    scoreBonus: 24,
    queries: [
      "בקרת מסמכים חיפה",
      "document control חיפה",
      "document controller חיפה",
      "איש בקרת מסמכים חיפה",
      "בקרת מסמכים קריות",
      "בקרת מסמכים יקנעם",
      "document control צפון",
    ].join(", "),
    positivePatterns: [
      "בקרת מסמכים",
      "document control",
      "document controller",
      "מסמכים",
      "תיעוד",
      "נהלים",
      "איכות",
      "office",
      "excel",
    ].join(", "),
    negativePatterns: [
      "מהנדס איכות",
      "qa מפעל",
      "gmp",
      "רגולציה בכירה",
      "senior",
      "lead",
      "ראש צוות",
      "מנהל",
      "3 שנים",
      "4 שנים",
      "5 שנים",
      "טלפוני",
      "מוקד",
      "שירות לקוחות",
      "מרכז",
      "תל אביב",
      "פתח תקווה",
      "רמת גן",
    ].join(", "),
  },
  {
    id: "quiet_app_support",
    name: "תמיכה אפליקטיבית שקטה",
    roleFamily: "information_systems",
    roleType: "app_support_quiet",
    mainListMinScore: 58,
    scoreBonus: 24,
    queries: [
      "תמיכה אפליקטיבית חיפה",
      "application support חיפה",
      "תומך אפליקטיבי חיפה",
      "מערכות מידע חיפה",
      "תמיכה אפליקטיבית קריות",
      "application support צפון",
    ].join(", "),
    positivePatterns: [
      "תמיכה אפליקטיבית",
      "application support",
      "מערכות מידע",
      "sql",
      "crm",
      "erp",
      "בדיקות",
      "תחקור תקלות",
      "back office",
    ].join(", "),
    negativePatterns: [
      "מוקד",
      "טלפוני",
      "שירות לקוחות",
      "help desk טלפוני",
      "משמרות",
      "24/7",
      "סופי שבוע",
      "לילות",
      "on call",
      "senior",
      "lead",
      "ראש צוות",
      "מנהל",
      "מרכז",
      "תל אביב",
      "פתח תקווה",
      "רמת גן",
    ].join(", "),
  },
];

function listToText(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value || "");
}

function textToList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value = "") {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, "_")
    .replace(/[^a-z0-9_א-ת-]/gi, "")
    .replace(/^_+|_+$/g, "");

  return slug || `role_${Date.now()}`;
}

function profileToForm(profile = {}) {
  return {
    id: profile.id || "",
    name: profile.name || "",
    roleFamily: profile.roleFamily || "custom",
    roleType: profile.roleType || profile.id || "",
    mainListMinScore: profile.mainListMinScore ?? 58,
    scoreBonus: profile.scoreBonus ?? 28,
    queries: listToText(profile.queries),
    positivePatterns: listToText(profile.positivePatterns),
    negativePatterns: listToText(profile.negativePatterns),
  };
}

function formToPayload(form) {
  const id = slugify(form.id || form.name);

  return {
    id,
    name: form.name.trim(),
    enabled: true,
    roleFamily: form.roleFamily || "custom",
    roleType: form.roleType || id,
    mainListMinScore: Number(form.mainListMinScore || 58),
    scoreBonus: Number(form.scoreBonus || 28),
    queries: textToList(form.queries),
    positivePatterns: textToList(form.positivePatterns),
    negativePatterns: textToList(form.negativePatterns),
  };
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs font-bold leading-5 text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 ${props.className || ""}`}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold leading-7 text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 ${props.className || ""}`}
    />
  );
}

export default function RoleManager({ onMessage, onError }) {
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "he")),
    [roles],
  );

  async function loadRoles() {
    const data = await apiGet("/api/role-profiles");
    setRoles(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadRoles().catch((error) => onError?.(error.message));
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function editRole(role) {
    setEditingId(role.id);
    setForm(profileToForm(role));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useRolePreset(preset) {
    setEditingId(preset.id);
    setForm(preset);
  }

  async function saveRole(event) {
    event.preventDefault();
    setLoading(true);
    onError?.("");

    try {
      const payload = formToPayload(form);

      if (!payload.name) {
        throw new Error("צריך להזין שם תפקיד.");
      }

      if (!payload.queries.length) {
        throw new Error("צריך להוסיף לפחות שאילתת חיפוש אחת.");
      }

      if (!payload.positivePatterns.length) {
        throw new Error("צריך להוסיף לפחות מילת זיהוי אחת לתפקיד.");
      }

      await apiPost("/api/role-profiles", payload);
      await loadRoles();
      resetForm();
      onMessage?.("התפקיד נשמר. בסריקה הבאה המערכת תחפש ותדרג גם אותו.");
    } catch (error) {
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRole(role) {
    setLoading(true);
    try {
      await apiPatch(`/api/role-profiles/${encodeURIComponent(role.id)}`, {
        enabled: role.enabled === false,
      });
      await loadRoles();
      onMessage?.(role.enabled === false ? "התפקיד הופעל." : "התפקיד כובה ולא ייכנס לסריקות חדשות.");
    } catch (error) {
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRole(role) {
    if (!window.confirm(`למחוק את התפקיד "${role.name || role.id}"?`)) return;

    setLoading(true);
    try {
      await apiDelete(`/api/role-profiles/${encodeURIComponent(role.id)}`);
      await loadRoles();
      if (editingId === role.id) resetForm();
      onMessage?.("התפקיד נמחק. שאילתות שכבר קיימות ב-keywords נשארות כדי לא לפגוע בהיסטוריה, אבל התפקיד לא ידורג יותר.");
    } catch (error) {
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]" dir="rtl">
      <div className="rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-xl shadow-slate-300/25 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
              <BadgePlus size={15} /> ניהול תפקידים
            </div>
            <h2 className="mt-3 text-2xl font-black text-slate-950">הוספה והסרה של תפקידי יעד</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
              כל תפקיד מוסיף שאילתות חיפוש, מילות זיהוי ומילות חסימה. כך אפשר להרחיב את המערכת בלי לערוך JSON ידנית.
            </p>
          </div>

          <button
            type="button"
            onClick={loadRoles}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-60"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> רענן
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {sortedRoles.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
              עדיין אין תפקידים מוגדרים.
            </div>
          ) : (
            sortedRoles.map((role) => (
              <article key={role.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${role.enabled === false ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"}`}>
                        {role.enabled === false ? <EyeOff size={14} /> : <CheckCircle2 size={14} />}
                        {role.enabled === false ? "כבוי" : "פעיל"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                        {role.roleFamily || "custom"}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
                        ציון מינימלי {role.mainListMinScore ?? 58}
                      </span>
                    </div>

                    <h3 className="mt-3 text-xl font-black text-slate-950">{role.name || role.id}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">ID: {role.id}</p>
                    <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
                      {Array.isArray(role.queries) ? role.queries.slice(0, 5).join(" · ") : "אין שאילתות"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => editRole(role)}
                      disabled={loading}
                      className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-indigo-700 disabled:opacity-60"
                    >
                      ערוך
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRole(role)}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-60"
                    >
                      {role.enabled === false ? <Eye size={16} /> : <EyeOff size={16} />}
                      {role.enabled === false ? "הפעל" : "כבה"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRole(role)}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      <Trash2 size={16} /> מחק
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <form onSubmit={saveRole} className="rounded-[2rem] border border-white/75 bg-white/95 p-5 shadow-xl shadow-slate-300/25 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-950">{editingId ? "עריכת תפקיד" : "תפקיד חדש"}</h3>
            <p className="mt-1 text-sm font-semibold leading-7 text-slate-500">
              כדאי לתת שאילתות מדויקות ומילות חסימה כדי לא להציף את הרשימה.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {rolePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => useRolePreset(preset)}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 ring-1 ring-violet-100 hover:bg-violet-100"
              >
                <Plus size={15} /> {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <Field label="שם תצוגה">
            <Input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="לדוגמה: בקרת מסמכים" />
          </Field>

          <Field label="מזהה פנימי" hint="באנגלית/תווים פשוטים. אם תשאיר ריק, המערכת תיצור מזהה מהשם.">
            <Input value={form.id} onChange={(event) => updateForm("id", event.target.value)} placeholder="document_control" dir="ltr" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="משפחה">
              <select
                value={form.roleFamily}
                onChange={(event) => updateForm("roleFamily", event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="qa">QA</option>
                <option value="frontend">Front End</option>
                <option value="analysis">Analysis</option>
                <option value="information">Information</option>
                <option value="information_systems">Information Systems</option>
                <option value="operations">Operations</option>
                <option value="custom">Custom</option>
              </select>
            </Field>

            <Field label="סוג פנימי">
              <Input value={form.roleType} onChange={(event) => updateForm("roleType", event.target.value)} placeholder="document_control" dir="ltr" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ציון מינימלי לרשימה הראשית">
              <Input type="number" min="0" max="100" value={form.mainListMinScore} onChange={(event) => updateForm("mainListMinScore", event.target.value)} />
            </Field>

            <Field label="בונוס התאמה">
              <Input type="number" min="0" max="80" value={form.scoreBonus} onChange={(event) => updateForm("scoreBonus", event.target.value)} />
            </Field>
          </div>

          <Field label="שאילתות חיפוש" hint="מופרדות בפסיקים. לדוגמה: document control חיפה, בקרת מסמכים קריות">
            <TextArea value={form.queries} onChange={(event) => updateForm("queries", event.target.value)} />
          </Field>

          <Field label="מילות זיהוי חיוביות" hint="מה גורם למערכת להבין שזה התפקיד הנכון.">
            <TextArea value={form.positivePatterns} onChange={(event) => updateForm("positivePatterns", event.target.value)} />
          </Field>

          <Field label="מילות חסימה / החלשה" hint="Senior, full stack, טלפוני, מרכז וכו׳.">
            <TextArea value={form.negativePatterns} onChange={(event) => updateForm("negativePatterns", event.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
          >
            <Save size={17} /> שמור תפקיד
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={loading}
            className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-60"
          >
            נקה טופס
          </button>
        </div>
      </form>
    </section>
  );
}
