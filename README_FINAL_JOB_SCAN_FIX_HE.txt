תיקון סופי לסריקת משרות / AllJobs
=================================

מה זה מתקן:
1. מאחד כפילויות בין queries לפי JobID לפני scoring/audit.
2. אם אותה משרה הופיעה גם כ-Israel וגם כמיקום אמיתי, המיקום האמיתי מנצח.
3. אם אותה משרה ידועה כירושלים/רעננה/פתח תקווה וכו', היא לא תברח כ-review עם Israel.
4. QA ברור בכותרת מנצח זיהוי שגוי של מערכות מידע/SAP.
5. משרת QA נקייה בחיפה/קריות יכולה להפוך ל-apply.
6. משרת QA עם 3+ שנות ניסיון נשארת review.
7. New jobs נספר לפי מצב jobs.json בתחילת הריצה, כדי שלא יתאפס בגלל partial save.

איך מריצים:
1. חלץ את שני קבצי ה-mjs לתיקיית server:
   C:\Users\Avner\Desktop\Projects\israel-job-finder\server

2. הרץ:
   node .\apply-final-job-scan-fix.mjs

3. בדיקה סינתטית:
   node .\run-final-job-scan-tests.mjs

4. בדיקת Quick Scan:
   $env:SEARCH_PROVIDERS="alljobs"
   $env:SEARCH_PROVIDER="alljobs"
   $env:SCAN_MAX_QUERIES="3"
   $env:SCAN_BATCH_SIZE="3"
   $env:ALLJOBS_MAX_PAGES="4"
   $env:ALLJOBS_MAX_RESULTS="80"
   $env:ALLJOBS_FETCH_DETAILS="true"
   $env:ALLJOBS_DETAIL_LIMIT="30"
   $env:ALLJOBS_DETAIL_DELAY_MS="100"
   npm run find-jobs

5. בדיקת kept ללא כפילויות:
   node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('../data/scan-audit.json','utf8')); const seen=new Set(); for (const j of a.jobs.filter(x=>x.kept).sort((a,b)=>(b.fitScore||0)-(a.fitScore||0))) { const id=String(j.url||'').match(/JobID=(\d+)/i)?.[1] || j.url || j.title; if(seen.has(id)) continue; seen.add(id); console.log({id,title:j.title, role:j.roleFamily, type:j.roleType, location:j.location, locationKey:j.locationKey, score:j.fitScore, rec:j.recommendation, warnings:j.warnings}); }"
