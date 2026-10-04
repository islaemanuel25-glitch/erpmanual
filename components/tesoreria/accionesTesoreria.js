"use client";

// components/tesoreria/accionesTesoreria.js
//
// LAS DOS ESCRITURAS DE TESORERÍA, contra sus rutas reales. Nada más escribe:
// la lectura es un GET y no tiene ninguna.
//
//   POST /api/finanzas/tesoreria/verificaciones            { cajaMovimientoIds, importeVerificado, idempotencyKey, observacion? }
//   POST /api/finanzas/tesoreria/verificaciones/:id/anular { motivo }
//
// El cuerpo de verificar lo arma `cuerpoDeVerificacion` y no lleva nada de lo
// que decide el servidor. La respuesta se devuelve tal cual: la pantalla no
// asume éxito hasta que el servidor lo dice, y no actualiza ningún número por
// su cuenta —después de un éxito vuelve a leer—.

export const URL_VERIFICACIONES = "/api/finanzas/tesoreria/verificaciones";
export const urlDeAnulacion = (id) => `${URL_VERIFICACIONES}/${Number(id)}/anular`;

/** El texto de un corte de red: el reintento es seguro y se dice. */
export const ERROR_SIN_RESPUESTA =
  "No hubo respuesta del servidor. Revisá la conexión y reintentá: el mismo intento no se registra dos veces.";

async function enviar(url, cuerpo, porDefecto) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(cuerpo),
    });
  } catch {
    return { ok: false, status: null, codigo: null, error: ERROR_SIN_RESPUESTA };
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    return { ok: false, status: res.status, codigo: j?.codigo ?? null, error: j?.error || `${porDefecto} (${res.status}).` };
  }
  return { ...j, ok: true, status: res.status };
}

export function enviarVerificacion(cuerpo) {
  return enviar(URL_VERIFICACIONES, cuerpo, "No se pudo registrar la verificación");
}

export function enviarAnulacion(id, motivo) {
  return enviar(urlDeAnulacion(id), { motivo }, "No se pudo anular la verificación");
}
