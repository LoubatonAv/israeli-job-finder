function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function extractRole(job = {}) {
  const text = [job.title, job.company, job.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const titleText = String(job.title || "").toLowerCase();

  const result = {
    roleFamily: "unknown",
    roleType: "unknown",
    seniority: "unknown",
    isRelevantRole: false,
    roleConfidence: "low",
    roleSignals: [],
  };

  // Strong irrelevant roles first — before QA matching.
  // This prevents "בודק/ת" in unrelated fields from becoming QA.
  if (
    hasAny(text, [
      /אח\/ות/i,
      /אחות/i,
      /אח\s*מוסמך/i,
      /מרפאה/i,
      /הנהלת\s*חשבונות/i,
      /מנהל\/ת\s*חשבונות/i,
      /מנהלת\s*חשבונות/i,
      /חשבונות/i,
      /ייצור/i,
      /עובד\.ת\s*ייצור/i,
      /עובד\/ת\s*ייצור/i,
      /מכונאי/i,
      /צמ["״]?ה/i,
      /טכנאי\/ת\s*מכונות/i,
      /הנדסאי\/ת\s*מכונות/i,
      /מהנדס\/ת\s*מכונות/i,
      /שרטט/i,
      /שרטט\/ת/i,
      /מתכנן\/ת/i,
      /תשתיות/i,
      /מזון/i,
      /אבטחת\s*איכות.*מזון/i,
      /איכות.*מזון/i,
      /עובד\s*ייצור/i,
      /פיברו/i,
    ])
  ) {
    return {
      ...result,
      roleFamily: "irrelevant",
      roleType: "irrelevant_non_software",
      isRelevantRole: false,
      roleConfidence: "high",
      roleSignals: ["irrelevant_non_software"],
    };
  }

  if (
    hasAny(text, [
      /junior/i,
      /ג׳וניור/i,
      /ג'וניור/i,
      /ללא ניסיון/i,
      /ללא נסיון/i,
      /entry\s*level/i,
    ])
  ) {
    result.seniority = "junior";
    result.roleSignals.push("junior");
  }

  const seniorTitleSignal = hasAny(titleText, [
    /senior/i,
    /ראש\s*צוות/i,
    /ר["״]?צ/i,
    /team\s*lead/i,
    /tech\s*lead/i,
    /lead\s+qa/i,
    /qa\s+lead/i,
    /manager/i,
    /מנהל/i,
    /מנהלת/i,
    /בכיר/i,
    /מנוסה/i,
  ]);

  const seniorExperienceSignal = hasAny(text, [
    /3\+?\s*שנים/i,
    /4\+?\s*שנים/i,
    /5\+?\s*שנים/i,
    /מעל\s*3\s*שנים/i,
    /מעל\s*4\s*שנים/i,
    /לפחות\s*3\s*שנים/i,
    /לפחות\s*4\s*שנים/i,
  ]);

  if (seniorTitleSignal || seniorExperienceSignal) {
    result.seniority = "senior_or_lead";
    result.roleSignals.push("senior_or_management");
  }

  const hasQaSignal = hasAny(text, [
    /\bqa\b/i,
    /quality\s*assurance/i,
    /software\s*tester/i,
    /system\s*tester/i,
    /manual\s*tester/i,
    /sw\s*qa/i,
    /qa\s*tester/i,
    /בודק\s*[\/.]\s*ת\s*תוכנה/i,
    /בודק\s*\/\s*ת\s*תוכנה/i,
    /בודק\.ת\s*תוכנה/i,
    /בודקי\s*תוכנה/i,
    /בודקות\s*תוכנה/i,
    /בודק(?:\/ת)?\s*תוכנה/i,
    /בודקת\s*תוכנה/i,
    /בודק\s*תוכנה/i,
    /בדיקות\s*תוכנה/i,
    /בדיקות\s*ידניות/i,
    /בדיקות\s*מערכת/i,
    /בודק(?:\/ת)?\s*qa/i,
    /בודקת\s*qa/i,
    /בודק\s*qa/i,
    /בודק(?:\/ת)?\s*מערכתי/i,
    /בדיקות\s*ידניות\s*על\s*מערכת/i,
    /stp/i,
    /std/i,
    /str/i,
    /בודק(?:\/ת)?\s*csv/i,
    /בודק(?:\/ת)?\s*erp/i,
    /בדיקות\s*erp/i,
    /בדיקות\s*csv/i,
    /איכות\s*תוכנה/i,
    /מהנדס(?:\/ת)?\s*איכות\s*תוכנה/i,
    /sw\s*test\s*engineer/i,
    /software\s*quality/i,
    /מהנדס(?:\/ת)?\s*בדיקות/i,
    /מהנדסת\s*בדיקות/i,
    /מהנדס\s*בדיקות/i,
    /בדיקות\s*web/i,
    /בדיקות\s*mobile/i,
    /web\s*\/?\s*mobile/i,
    /mobile\s*tester/i,
    /web\s*tester/i,
  ]);

  if (hasQaSignal) {
    result.roleFamily = "qa";
    result.roleType = "qa_general";
    result.isRelevantRole = true;
    result.roleConfidence = "high";
    result.roleSignals.push("qa");
  }

  if (
    hasAny(text, [
      /manual/i,
      /ידני/i,
      /ידניות/i,
      /בדיקות\s*ידניות/i,
      /manual\s*qa/i,
      /manual\s*tester/i,
    ])
  ) {
    result.roleFamily = "qa";
    result.roleType = "qa_manual";
    result.isRelevantRole = true;
    result.roleConfidence = "high";
    result.roleSignals.push("manual");
  }

  if (
    hasAny(text, [
      /automation/i,
      /אוטומציה/i,
      /selenium/i,
      /playwright/i,
      /cypress/i,
      /test\s*automation/i,
    ])
  ) {
    result.roleFamily = "qa";
    result.roleType = "qa_automation";
    result.isRelevantRole = true;
    result.roleConfidence = "high";
    result.roleSignals.push("automation");
  }

  if (hasAny(text, [/sap/i])) {
    if (result.roleFamily === "qa" || hasQaSignal) {
      result.roleFamily = "qa";
      result.roleType =
        result.roleType === "unknown" || result.roleType === "qa_general"
          ? "qa_sap"
          : result.roleType;
      result.isRelevantRole = true;
      result.roleConfidence = "high";
      result.roleSignals.push("sap");
    } else {
      result.roleSignals.push("sap");
    }
  }

  if (hasAny(text, [/erp/i])) {
    result.roleSignals.push("erp");
  }

  if (
    hasAny(text, [
      /מטמיע/i,
      /הטמעה/i,
      /מיישם/i,
      /יישום/i,
      /מערכות מידע/i,
      /crm/i,
      /plm/i,
      /alm/i,
    ])
  ) {
    result.roleFamily = "information_systems";
    result.roleType = "implementer";
    result.isRelevantRole = true;
    result.roleConfidence = "medium";
    result.roleSignals.push("implementer");
  }

  if (
    hasAny(text, [
      /application\s*support/i,
      /תמיכה\s*אפליקטיבית/i,
    ])
  ) {
    result.roleFamily = "information_systems";
    result.roleType = "application_support";
    result.isRelevantRole = true;
    result.roleConfidence = "medium";
    result.roleSignals.push("application_support");
  }

  if (
    hasAny(text, [
      /data\s*entry/i,
      /הזנת\s*נתונים/i,
      /קליטת\s*נתונים/i,
    ])
  ) {
    result.roleFamily = "operations";
    result.roleType = "data_entry";
    result.isRelevantRole = true;
    result.roleConfidence = "medium";
    result.roleSignals.push("data_entry");
  }

  if (
    hasAny(text, [
      /מידען/i,
      /בקרת\s*מסמכים/i,
      /document\s*control/i,
      /document\s*controller/i,
      /doc\s*control/i,
      /בק\s*אופיס/i,
      /back\s*office/i,
      /אדמין/i,
      /אדמיניסטרציה/i,
    ])
  ) {
    result.roleFamily = "information";
    result.roleType = "document_control";
    result.isRelevantRole = true;
    result.roleConfidence = "medium";
    result.roleSignals.push("documents_or_backoffice");
  }

  if (
    hasAny(text, [
      /נציג/i,
      /מוקד/i,
      /טלפוני/i,
      /שירות\s*לקוחות/i,
      /call\s*center/i,
      /customer\s*service/i,
    ])
  ) {
    result.roleSignals.push("phone_or_service");

    if (result.roleFamily === "unknown") {
      result.roleFamily = "customer_service";
      result.roleType = "phone_support";
      result.isRelevantRole = false;
      result.roleConfidence = "medium";
    }
  }

  if (hasAny(text, [/מכירות/i, /sales/i, /איש\s*מכירות/i])) {
    result.roleSignals.push("sales");

    if (result.roleFamily === "unknown") {
      result.roleFamily = "sales";
      result.roleType = "sales";
      result.isRelevantRole = false;
      result.roleConfidence = "medium";
    }
  }
  if (
    hasAny(text, [
      /קצין(?:\/ת)?\s*בטיחות\s*בתעבורה/i,
      /בטיחות\s*בתעבורה/i,
      /צי\s*רכב/i,
      /ניהול\s*רכב/i,
      /ליסינג/i,
      /נהג/i,
      /נהיגה/i,
    ])
  ) {
    result.roleFamily = "irrelevant";
    result.roleType = "safety_transport";
    result.isRelevantRole = false;
    result.roleConfidence = "high";
    result.roleSignals.push("wrong_role_transport_safety");
  }

  return result;
}
