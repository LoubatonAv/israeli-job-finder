# Gmail Import MVP - הוראות התקנה

הקבצים האלה מוסיפים לאפליקציית חיפוש המשרות טאב חדש בשם **מיילים מ-Gmail**.

## 1. התקנת תלות בשרת

```powershell
npm --prefix server install
```

ה־ZIP מעדכן את `server/package.json` ומוסיף את `googleapis`.

## 2. Google Cloud

צריך ליצור OAuth Client מסוג Web application ולהגדיר Redirect URI:

```txt
http://localhost:4000/api/gmail/oauth2callback
```

## 3. משתני סביבה ב־server/.env

לא כללתי `.env` ב־ZIP כדי לא לדרוס סודות. הוסף ידנית:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:4000/api/gmail/oauth2callback
CLIENT_URL=http://localhost:5173
GMAIL_IMPORT_DAYS=14
GMAIL_IMPORT_MAX_RESULTS=40
```

## 4. בדיקות

```powershell
node --check .\server\src\gmailAuth.js
node --check .\server\src\gmailImport.js
node --check .\server\src\server.js
node .\scripts\check-project.mjs
npm run dev
```

## 5. שימוש

1. פתח את האתר.
2. עבור לטאב **מיילים מ-Gmail**.
3. לחץ **חבר Gmail**.
4. אחרי החיבור לחץ **ייבא מיילים עכשיו**.

המערכת משתמשת בהרשאת `gmail.readonly` בלבד, מחפשת עם query מוגבל ל־14 יום ולמונחי משרות, ואז קוראת רק הודעות שחזרו מהחיפוש.

הקבצים שנוצרים בזמן שימוש:

```txt
data/gmail-tokens.json
data/gmail-imports.json
```

לא להעלות את `gmail-tokens.json` ל־GitHub.
