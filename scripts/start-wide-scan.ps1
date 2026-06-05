# מריץ את הפרויקט עם כל המקורות היציבים + מקורות אתרים דרך Google/Playwright.
# שימוש: מתוך שורש הפרויקט להריץ:
# .\scripts\start-wide-scan.ps1

$env:SEARCH_PROVIDERS = "drushim,matrix,jobmaster,alljobs,sites"
$env:DEBUG_DRY_RUN = "false"
$env:DEBUG_JOBS = "false"
$env:SAVE_PARTIAL_RESULTS = "false"
$env:SITE_SOURCE_RESULTS_PER_SOURCE = "5"
$env:SITE_SOURCES_MAX_SOURCES = "6"

Write-Host "SEARCH_PROVIDERS=$env:SEARCH_PROVIDERS" -ForegroundColor Cyan
Write-Host "הפעלת הפרויקט. לאחר העלייה לחץ באתר על 'סרוק משרות חדשות'." -ForegroundColor Green

npm run dev
