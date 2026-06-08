# Gmail Agent Upgrade

המטרה: Gmail הוא הסוכן המרכזי. אתרי המשרות שולחים אליו התראות שכבר סיננת, והאפליקציה מכניסה אותן למערכת הרגילה.

## מה השתנה

- נוספה לשונית `Gmail Agent` לניהול הסוכן.
- נוסף ניהול מקורות מייל אמינים מתוך ה-UI.
- מיילים ממקורות משרות אמינים לא נזרקים בגלל ניקוד נמוך; הם עוברים ל-review.
- מיילי digest לא מפוצלים יותר לכרטיסים מזויפים בלי כותרת אמיתית.
- נוסף מצב incremental: מיילים שכבר עובדו לא מעובדים שוב, אלא אם מריצים ייבוא מלא מחדש.
- נוסף ניקוי פיצולים מזויפים ישנים.
- נוסף דוח CLI: `node ./scripts/gmail-agent-report.mjs`.

## בדיקות אחרי העתקה

```powershell
node --check .\server\src\server.js
node --check .\server\src\gmailImport.js
node --check .\scripts\gmail-agent-report.mjs
node --check .\scripts\clean-gmail-fake-split-jobs.mjs
node .\scripts\check-project.mjs
npm run dev
```

## ניקוי כרטיסים מזויפים ישנים

```powershell
node .\scripts\clean-gmail-fake-split-jobs.mjs
```

## ייבוא מה-Gmail Agent

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/gmail/import-to-jobs" `
  -ContentType "application/json" `
  -Body '{"days":14,"maxResults":60}'
```

ייבוא מלא מחדש:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/gmail/import-to-jobs" `
  -ContentType "application/json" `
  -Body '{"days":14,"maxResults":60,"force":true}'
```

## דוח מצב

```powershell
node .\scripts\gmail-agent-report.mjs
```

## קבצים שלא מעלים ל-GitHub

- `server/.env`
- `data/gmail-tokens.json`
- `data/gmail-imports.json`
- `data/gmail-agent-state.json`
- `data/jobs.json`
- `data/feedback.json`
- `data/scan-audit.json`

`data/trustedJobSenders.json` כן יכול לעלות כי אין בו סודות.
