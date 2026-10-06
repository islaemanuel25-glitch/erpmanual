// Candados de la puerta de Azul Chat: los seis pasos en orden, la forma
// cerrada del cuerpo, y que la sesión del ERP no participe.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/atender.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { atenderSolicitud, MAX_BYTES_CUERPO } from "./atender.js";
import { firmarSolicitud, CABECERAS } from "./autenticacionAplicacion.js";

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const AHORA = Date.parse("2026-10-06T15:00:00.000Z");
const MARCA = String(Math.floor(AHORA / 1000));

const GRUPO_DE = { 10: 1, 11: 1 };
const USUARIOS = {
  7: { id: 7, activo: true, localId: 10, rol: { permisos: ["reportes.ver"] } },
  9: { id: 9, activo: true, localId: null, rol: { permisos: ["*"] } },
};
const cargador = { usuario: async (id) => USUARIOS[id] ?? null, grupoDeLocal: async (id) => GRUPO_DE[id] ?? null };

function armar({ cuerpo, firmar = true, extra = {}, ejecutores } = {}) {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const headers = new Headers({ [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: MARCA, ...extra });
  if (firmar) headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }));
  const llamadas = [];
  const ej = ejecutores ?? {
    ventas_resumen: async (autz, parametros) => (llamadas.push({ autz, parametros }), { ok: true, datos: { local: autz.localId } }),
  };
  return { llamadas, correr: () => atenderSolicitud({ headers, cuerpo: texto }, { cargador, ejecutores: ej, entorno: ENTORNO, ahora: AHORA }) };
}
const pedido = (extra = {}) => ({
  capacidad: "ventas_resumen",
  delegacion: { usuarioId: 7 },
  alcance: { grupoId: 1, localId: 10 },
  parametros: { periodo: { tipo: "hoy" } },
  ...extra,
});

test("una solicitud firmada, delegada en un usuario con permiso, sobre su local, se ejecuta", async () => {
  const { correr, llamadas } = armar({ cuerpo: pedido() });
  const r = await correr();
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo, { ok: true, datos: { local: 10 } });
  assert.equal(llamadas.length, 1);
  assert.deepEqual({ ...llamadas[0].autz }, { usuarioId: 7, capacidad: "ventas_resumen", grupoId: 1, localId: 10 });
  assert.ok(Object.isFrozen(llamadas[0].autz), "el ejecutor recibe la autorización congelada");
});

test("12. sin firma no entra, aunque traiga una cookie de admin del ERP", async () => {
  const { correr, llamadas } = armar({
    cuerpo: pedido({ delegacion: { usuarioId: 9 } }),
    firmar: false,
    extra: { cookie: "erpazul_sesion=eyJhbGciOi.admin.jwt; erpazul_grupo_activo=1; erpazul_contexto_activo=%7B%22global%22%3Atrue%7D" },
  });
  const r = await correr();
  assert.equal(r.status, 401);
  assert.equal(llamadas.length, 0);
});

test("12b. con firma, una cookie de admin no amplía el alcance del humano delegante", async () => {
  const { correr, llamadas } = armar({
    cuerpo: pedido({ alcance: { grupoId: 1, localId: 11 } }),
    extra: { cookie: "erpazul_sesion=eyJhbGciOi.admin.jwt; erpazul_contexto_activo=%7B%22localId%22%3A11%7D", authorization: "Bearer eyJ.admin.jwt" },
  });
  const r = await correr();
  assert.equal(r.cuerpo.codigo, "FUERA_DE_ALCANCE");
  assert.equal(llamadas.length, 0);
});

test("11. capacidad fuera del catálogo: 403 y no se ejecuta nada", async () => {
  for (const capacidad of ["ejecutar_endpoint", "sql", "constructor", "ventas_detalle"]) {
    const { correr, llamadas } = armar({ cuerpo: pedido({ capacidad }) });
    const r = await correr();
    assert.equal(r.status, 403, capacidad);
    assert.equal(r.cuerpo.codigo, "CAPACIDAD_FUERA_DE_CATALOGO", capacidad);
    assert.equal(llamadas.length, 0);
  }
});

test("el cuerpo es cerrado: una clave de más en cualquier nivel lo rechaza", async () => {
  const casos = [
    pedido({ endpoint: "/api/usuarios" }),
    pedido({ sql: "select * from \"Usuario\"" }),
    pedido({ delegacion: { usuarioId: 7, permisos: ["*"] } }),
    pedido({ delegacion: { usuarioId: 7, esAdmin: true } }),
    pedido({ alcance: { grupoId: 1, localId: 10, localIds: [10, 11] } }),
    pedido({ parametros: { periodo: { tipo: "hoy" }, where: { localId: { gt: 0 } } } }),
    pedido({ parametros: { periodo: { tipo: "hoy" }, include: { detalles: true } } }),
  ];
  for (const cuerpo of casos) {
    const { correr, llamadas } = armar({ cuerpo });
    const r = await correr();
    assert.equal(r.status, 400, JSON.stringify(cuerpo));
    assert.equal(r.cuerpo.codigo, "PEDIDO_INVALIDO", JSON.stringify(cuerpo));
    assert.equal(llamadas.length, 0);
  }
});

test("un cuerpo que no es JSON, un arreglo o demasiado grande se rechaza", async () => {
  for (const cuerpo of ["no es json", "[]", "null", JSON.stringify({ ...pedido(), relleno: "x".repeat(MAX_BYTES_CUERPO) })]) {
    const { correr } = armar({ cuerpo });
    const r = await correr();
    assert.equal(r.status, 400, cuerpo.slice(0, 20));
  }
});

test("la autenticación de la aplicación va ANTES de leer el cuerpo", async () => {
  // Un cuerpo inválido sin firma responde 401, no 400: sin aplicación
  // autenticada no se le dice a nadie qué forma tiene el pedido.
  const { correr } = armar({ cuerpo: "no es json", firmar: false });
  assert.equal((await correr()).status, 401);
});

test("una capacidad del catálogo sin ejecutor no hace nada", async () => {
  const { correr } = armar({ cuerpo: pedido(), ejecutores: {} });
  const r = await correr();
  assert.equal(r.status, 501);
  assert.equal(r.cuerpo.codigo, "CAPACIDAD_SIN_EJECUTOR");
});

test("si el ejecutor falla, se dice qué falló, sin cabeceras ni cuerpo", async () => {
  const original = console.error;
  const registrado = [];
  console.error = (...a) => registrado.push(a.join(" "));
  try {
    const { correr } = armar({
      cuerpo: pedido(),
      ejecutores: { ventas_resumen: async () => { throw new Error("la base no respondió"); } },
    });
    const r = await correr();
    assert.equal(r.status, 500);
    assert.equal(r.cuerpo.codigo, "ERROR_AL_CALCULAR");
    assert.match(r.cuerpo.error, /la base no respondió/);
    const todo = registrado.join("\n");
    assert.ok(!todo.includes(SECRETO) && !todo.includes(MARCA) && !todo.includes("usuarioId"), todo);
  } finally {
    console.error = original;
  }
});

test("un rechazo del ejecutor (período malo) llega con su código", async () => {
  const { correr } = armar({
    cuerpo: pedido(),
    ejecutores: { ventas_resumen: async () => ({ ok: false, status: 400, codigo: "PERIODO_INVALIDO", error: "mal" }) },
  });
  const r = await correr();
  assert.deepEqual([r.status, r.cuerpo.codigo], [400, "PERIODO_INVALIDO"]);
});
