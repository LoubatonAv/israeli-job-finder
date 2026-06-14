# Job Scan Refactor Pack

מה זה עושה:

- מוסיף `src/jobClassifier.js` שמסווג תפקידים בצורה כללית: `software_qa`, `automation_qa`, `qa_uncertain`, `business_quality`, `information_systems`, וכו׳.
- מחליף/מעדכן `src/decisionGates.js` כך ש־`apply` מותר רק כשיש ודאות גבוהה: תפקיד יעד ברור + מיקום טוב + בלי בכירות/3+ שנים/טלפוני/מכירות/משמרות.
- מחזק את `findJobs.js` כך שכל provider עובר דרך אותו `scoreAndGateJob`, בלי קיצורי דרך שעוקפים את ה־gates.
- מחזק גם את זרימת Gmail/manual scoring ב־`server.js`.
- מחליף את `drushimCrawler.js` ו־`jobmasterCrawler.js` לגרסאות נקיות יותר בלי עברית שבורה ובלי `networkidle` תקוע.

הרצה:

```powershell
cd C:\Users\Avner\Desktop\Projects\israel-job-finder\server
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\job-scan-refactor-pack.zip" -DestinationPath . -Force
node .\apply-job-scan-refactor.mjs
node .\run-job-scan-refactor-tests.mjs
node --check .\src\findJobs.js
node --check .\src\server.js
node --check .\src\decisionGates.js
node --check .\src\jobClassifier.js
node --check .\src\drushimCrawler.js
node --check .\src\jobmasterCrawler.js
```

בדיקת סריקה קטנה:

```powershell
$env:SEARCH_PROVIDERS="alljobs,drushim,jobmaster"
$env:SEARCH_PROVIDER="alljobs,drushim,jobmaster"
$env:SCAN_MAX_QUERIES="2"
$env:SCAN_BATCH_SIZE="6"
$env:ALLJOBS_MAX_PAGES="3"
$env:ALLJOBS_MAX_RESULTS="60"
$env:ALLJOBS_FETCH_DETAILS="true"
$env:ALLJOBS_DETAIL_LIMIT="20"
$env:DRUSHIM_MAX_RESULTS="40"
$env:JOBMASTER_MAX_RESULTS="40"

npm run find-jobs
```

בדיקת kept:

```powershell
node -e "const fs=require('fs'); const a=JSON.parse(fs.readFileSync('../data/scan-audit.json','utf8')); for(const j of a.jobs.filter(x=>x.kept).sort((a,b)=>(b.fitScore||0)-(a.fitScore||0))) console.log({source:j.source,title:j.title,domain:j.roleDomain,location:j.location,locationKey:j.locationKey,score:j.fitScore,rec:j.recommendation,warnings:j.warnings});"
```
