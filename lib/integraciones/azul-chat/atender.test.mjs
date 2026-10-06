// Candados de la puerta de Azul Chat: los seis pasos en orden, la forma
// cerrada del cuerpo, y que la sesión del ERP no participe.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/atender.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { atenderSolicitud, leerCuerpoCanonico, MAX_BYTES_CUERPO } from "./atender.js";
import { firmarSolicitud, CABECERAS } from "./autenticacionAplicacion.js";
import { generarTokenDelegacion, hashTokenDelegacion, generarCodigoVinculo } from "../vinculos/codigoVinculo.js";

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const AHORA = Date.parse("2026-10-06T15:00:00.000Z");
const MARCA = String(Math.floor(AHORA / 1000));

const GRUPO_DE = { 10: 1, 11: 1 };
const USUARIOS = {
  7: { id: 7, activo: true, localId: 10, rol: { permisos: ["reportes.ver"] } },
  9: { id: 9, activo: true, localId: null, rol: { permisos: ["*"] } },
};
// Una delegación vigente por usuario, buscada por el hash de su token, con la
// forma de `cargadorErp.delegacion`.
const TOKEN = { 7: generarTokenDelegacion(), 9: generarTokenDelegacion() };
const DELEGACIONES = Object.fromEntries(
  Object.entries(TOKEN).map(([id, t], i) => [
    hashTokenDelegacion(t),
    { id: 200 + i, vinculo: { id: 100 + i, usuarioId: Number(id), aplicacion: "AZUL_CHAT", revocadoEn: null } },
  ])
);
const cargador = {
  delegacion: async (hash) => DELEGACIONES[hash] ?? null,
  usuario: async (id) => USUARIOS[id] ?? null,
  grupoDeLocal: async (id) => GRUPO_DE[id] ?? null,
};

function armar({ cuerpo, firmar = true, extra = {}, ejecutores } = {}) {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const headers = new Headers({ [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: MARCA, ...extra });
  if (firmar) headers.set(CABECERAS.firma, firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }));
  const llamadas = [];
  const ej = ejecutores ?? {
    ventas_resumen: async (autz, parametros) => (llamadas.push({ autz, parametros }), { ok: true, datos: { local: autz.localId } }),
    mi_alcance: async (autz, parametros) => (llamadas.push({ autz, parametros }), { ok: true, datos: { usuario: autz.usuarioId } }),
  };
  return { llamadas, correr: () => atenderSolicitud({ headers, cuerpo: texto }, { cargador, ejecutores: ej, entorno: ENTORNO, ahora: AHORA }) };
}
const pedido = (extra = {}) => ({
  capacidad: "ventas_resumen",
  delegacion: { token: TOKEN[7] },
  alcance: { grupoId: 1, localId: 10 },
  parametros: { periodo: { tipo: "hoy" } },
  ...extra,
});
const pedidoAlcance = (extra = {}) => ({ capacidad: "mi_alcance", delegacion: { token: TOKEN[7] }, parametros: {}, ...extra });

test("una solicitud firmada, con la delegación de una persona con permiso, sobre su local, se ejecuta", async () => {
  const { correr, llamadas } = armar({ cuerpo: pedido() });
  const r = await correr();
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo, { ok: true, datos: { local: 10 } });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas[0].autz)), {
    usuarioId: 7, capacidad: "ventas_resumen", vinculoId: 100, delegacionId: 200,
    alcance: { modo: "LOCAL", localId: 10 }, grupoId: 1, localId: 10,
  });
  assert.ok(Object.isFrozen(llamadas[0].autz), "el ejecutor recibe la autorización congelada");
});

test("12. sin firma no entra, aunque traiga una cookie de admin del ERP", async () => {
  const { correr, llamadas } = armar({
    cuerpo: pedido({ delegacion: { token: TOKEN[9] } }),
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
    pedido({ delegacion: { token: TOKEN[7], permisos: ["*"] } }),
    pedido({ delegacion: { token: TOKEN[7], esAdmin: true } }),
    pedido({ delegacion: { token: TOKEN[7], tokenHash: hashTokenDelegacion(TOKEN[7]) } }),
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

test("14. el token de A no sirve para hablar en nombre de B: el usuarioId NO tiene dónde ir", async () => {
  // El contrato viejo traía `delegacion.usuarioId`. Hoy es una clave de más, en
  // la delegación o en la raíz, aunque coincida con el dueño del token.
  for (const cuerpo of [
    pedido({ delegacion: { token: TOKEN[7], usuarioId: 9 } }),
    pedido({ delegacion: { token: TOKEN[7], usuarioId: 7 } }),
    pedido({ usuarioId: 9 }),
    pedido({ delegacion: { usuarioId: 9, vinculo: generarCodigoVinculo() } }),
  ]) {
    const { correr, llamadas } = armar({ cuerpo });
    const r = await correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [400, "PEDIDO_INVALIDO"], JSON.stringify(cuerpo));
    assert.equal(llamadas.length, 0);
  }
  // Y el token de 7 ejecuta como 7, no como el admin 9.
  const { correr, llamadas } = armar({ cuerpo: pedido() });
  await correr();
  assert.equal(llamadas[0].autz.usuarioId, 7);
});

test("un cuerpo que no es JSON, un arreglo o demasiado grande se rechaza", async () => {
  for (const cuerpo of ["no es json", "[]", "null", JSON.stringify({ ...pedido(), relleno: "x".repeat(MAX_BYTES_CUERPO) })]) {
    const { correr } = armar({ cuerpo });
    const r = await correr();
    assert.equal(r.status, 400, cuerpo.slice(0, 20));
  }
});

test("leerCuerpoCanonico es la regla compartida con el canje: canónico y objeto", () => {
  assert.deepEqual(leerCuerpoCanonico('{"codigo":"x"}'), { datos: { codigo: "x" } });
  for (const malo of ['{ "codigo":"x"}', '{"codigo":"x","codigo":"y"}', "[]", "null", "", "﻿{}", new Uint8Array([0xff])]) {
    assert.equal(leerCuerpoCanonico(malo).error?.cuerpo.codigo, "PEDIDO_INVALIDO", String(malo));
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
    assert.ok(!todo.includes(SECRETO) && !todo.includes(MARCA) && !todo.includes(TOKEN[7]) && !todo.includes(hashTokenDelegacion(TOKEN[7])), todo);
  } finally {
    console.error = original;
  }
});

test("V1. firmada, pero sin un token de delegación que exista: no se ejecuta", async () => {
  for (const delegacion of [{}, { token: generarTokenDelegacion() }, { token: generarCodigoVinculo() }]) {
    const { correr, llamadas } = armar({ cuerpo: pedido({ delegacion }) });
    const r = await correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [403, "DELEGACION_INEXISTENTE"], JSON.stringify(delegacion));
    assert.equal(llamadas.length, 0);
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

// ── El alcance según la capacidad ──────────────────────────────────────────

test("ventas_resumen sin alcance se rechaza: es sobre un local", async () => {
  const { alcance: _a, ...sinAlcance } = pedido();
  const { correr, llamadas } = armar({ cuerpo: sinAlcance });
  const r = await correr();
  assert.deepEqual([r.status, r.cuerpo.codigo], [400, "PEDIDO_INVALIDO"]);
  assert.equal(llamadas.length, 0);
});

test("mi_alcance se ejecuta sin alcance y sin parámetros", async () => {
  const { correr, llamadas } = armar({ cuerpo: pedidoAlcance() });
  const r = await correr();
  assert.deepEqual([r.status, r.cuerpo], [200, { ok: true, datos: { usuario: 7 } }]);
  assert.equal(llamadas[0].autz.alcance.modo, "LOCAL");
});

test("mi_alcance NO acepta un local ni un grupo elegido por quien pregunta, ni parámetros", async () => {
  for (const cuerpo of [
    pedidoAlcance({ alcance: { grupoId: 1, localId: 11 } }),
    pedidoAlcance({ alcance: {} }),
    pedidoAlcance({ parametros: { localId: 11 } }),
    pedidoAlcance({ parametros: { periodo: { tipo: "hoy" } } }),
  ]) {
    const { correr, llamadas } = armar({ cuerpo });
    const r = await correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [400, "PEDIDO_INVALIDO"], JSON.stringify(cuerpo));
    assert.equal(llamadas.length, 0);
  }
});
