// LA LECTURA SE PIDE UNA VEZ Y SE ESPERA SU TURNO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/leerConTurno.test.mjs
//
// `fetch` y el reloj entran por parámetro, así que esto corre sin red y sin
// esperar de verdad. Lo que se afirma es el contrato con la ruta: que se
// arranque UNA vez, que se pregunte por el turno con el turno puesto, y que se
// deje de preguntar cuando la respuesta ya no dice `leyendo`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pedirLaLectura } from "@/lib/compras-proveedor/comprobante/leerConTurno";

/** Un `fetch` de mentira que contesta la lista que se le dé, en orden. */
function fetchDeMentira(respuestas) {
  const pedidos = [];
  const fn = async (url, opciones) => {
    pedidos.push({ url, metodo: opciones?.method || "GET" });
    const r = respuestas[Math.min(pedidos.length - 1, respuestas.length - 1)];
    return {
      ok: r.status ? r.status < 400 : true,
      status: r.status ?? 200,
      json: async () => r.cuerpo,
    };
  };
  fn.pedidos = pedidos;
  return fn;
}

const yaMismo = async () => {};

test("SE ARRANCA UNA VEZ Y DESPUÉS SE PREGUNTA POR EL TURNO", async () => {
  const fetchImpl = fetchDeMentira([
    { cuerpo: { ok: true, leyendo: true, turno: "abc-123", texto: "Leyendo el papel…" } },
    { cuerpo: { ok: true, leyendo: true } },
    { cuerpo: { ok: true, leyendo: true } },
    { cuerpo: { ok: true, cierra: true, lineas: 20 } },
  ]);

  let aviso = null;
  const { cuerpo } = await pedirLaLectura({
    comprobanteId: 17,
    origen: "BOTON",
    fetchImpl,
    dormir: yaMismo,
    alAvisar: (t) => (aviso = t),
  });

  assert.equal(cuerpo.lineas, 20);
  assert.equal(aviso, "Leyendo el papel…");

  // UNA sola lectura arrancada. Es lo que protege la cuota: veinte por día.
  const arranques = fetchImpl.pedidos.filter((p) => p.metodo === "POST");
  assert.equal(arranques.length, 1, `arrancó ${arranques.length} lecturas`);
  assert.equal(arranques[0].url, "/api/compras-proveedor/comprobantes/leer/17");

  // Y las consultas llevan el turno: sin él, el servidor no sabe por cuál se
  // pregunta y contestaría 400.
  const consultas = fetchImpl.pedidos.filter((p) => p.metodo === "GET");
  assert.equal(consultas.length, 3);
  for (const c of consultas) assert.match(c.url, /\?turno=abc-123$/);
});

test("SI EL POST CONTESTA DIRECTO, NO SE PREGUNTA NADA", async () => {
  // Contraprueba del contrato: lo que decide es `leyendo`, no el estado HTTP ni
  // la existencia del turno. Si algún día la lectura vuelve a ser instantánea,
  // esto sigue andando sin tocarlo.
  const fetchImpl = fetchDeMentira([{ cuerpo: { ok: true, cierra: true } }]);
  const { cuerpo } = await pedirLaLectura({ comprobanteId: 5, fetchImpl, dormir: yaMismo });
  assert.equal(cuerpo.cierra, true);
  assert.equal(fetchImpl.pedidos.length, 1);
});

test("UN ARRANQUE QUE FALLA NO SE QUEDA PREGUNTANDO", async () => {
  // 429: se acabó la cuota. Seguir preguntando por un turno que no existe
  // dejaría la pantalla girando para siempre.
  const fetchImpl = fetchDeMentira([{ status: 429, cuerpo: { ok: false, error: "sin cuota" } }]);
  const { respuesta, cuerpo } = await pedirLaLectura({ comprobanteId: 5, fetchImpl, dormir: yaMismo });
  assert.equal(respuesta.status, 429);
  assert.equal(cuerpo, null, "se tragó el fallo y devolvió un cuerpo");
  assert.equal(fetchImpl.pedidos.length, 1);
});

test("UN TURNO PERDIDO CORTA CON SU RESPUESTA, NO CON UN GIRO ETERNO", async () => {
  // 410: el contenedor se recreó en el medio y el turno se perdió. La respuesta
  // sube tal cual para que la pantalla diga qué pasó.
  const fetchImpl = fetchDeMentira([
    { cuerpo: { ok: true, leyendo: true, turno: "t" } },
    { status: 410, cuerpo: { ok: false, error: "se reinició el sistema", turnoPerdido: true } },
  ]);
  const { respuesta } = await pedirLaLectura({ comprobanteId: 5, fetchImpl, dormir: yaMismo });
  assert.equal(respuesta.status, 410);
  assert.equal(fetchImpl.pedidos.length, 2);
});
