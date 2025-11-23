// components/grupos/api.js

async function http(method, url, body) {
  const res = await fetch(url, { credentials: "include",
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = "";
    try { msg = await res.text(); } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// Normaliza {data:[...]} o [...]
const unwrap = (x) => (x && Array.isArray(x.data) ? x.data : x);

export const apiListGrupos = async () => unwrap(await http("GET", "/api/grupos"));
export const apiCreateGrupo = (payload) =>
  http("POST", "/api/grupos/crear", payload);
export const apiDeleteGrupo = (id) =>
  http("DELETE", `/api/grupos/${id}`);
