async function readJsonSafely(response) {
  const text = await response.text();

  if (!text || !text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "השרת החזיר תשובה לא תקינה. בדרך כלל זה קורה כשהשרת נפל או הופעל מחדש באמצע בקשה.",
    );
  }
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(path, options);
  } catch {
    throw new Error(
      "השרת לא זמין כרגע או שהבקשה נקטעה. בדוק שהשרת רץ ונסה שוב.",
    );
  }

  const data = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(data.error || `הבקשה נכשלה (${response.status})`);
  }

  return data;
}

export async function apiGet(path) {
  return request(path);
}

export async function apiPost(path, body = {}) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiPatch(path, body = {}) {
  return request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path, body = undefined) {
  const options = {
    method: "DELETE",
  };

  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  return request(path, options);
}
