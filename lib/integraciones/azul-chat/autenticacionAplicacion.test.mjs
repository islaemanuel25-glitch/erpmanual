// Candados de la autenticación MÁQUINA A MÁQUINA de Azul Chat.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/autenticacionAplicacion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  autenticarAplicacion,
  firmarSolicitud,
  CABECERAS,
  TOLERANCIA_SEGUNDOS,
  LARGO_MINIMO_SECRETO,
} from "./autenticacionAplicacion.js";

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "otro-secreto-el-de-las-sesiones-del-erp" };
const AHORA = Date.parse("2026-10-06T15:00:00.000Z");
const MARCA = String(Math.floor(AHORA / 1000));
const CUERPO = JSON.stringify({ capacidad: "ventas_resumen" });

function cabeceras({ aplicacion = "azul-chat", marca = MARCA, cuerpo = CUERPO, secreto = SECRETO, firma, extra = {} } = {}) {
  return new Headers({
    [CABECERAS.aplicacion]: aplicacion,
    [CABECERAS.marca]: marca,
    [CABECERAS.firma]: firma ?? firmarSolicitud({ secreto, aplicacion, marca, cuerpo }),
    ...extra,
  });
}
const autenticar = (args = {}, opciones = {}) =>
  autenticarAplicacion({ headers: cabeceras(args), cuerpo: args.cuerpoEnviado ?? CUERPO, entorno: ENTORNO, ahora: AHORA, ...opciones });

test("una solicitud firmada con el secreto propio de la integración entra", () => {
  assert.deepEqual(autenticar(), { ok: true, aplicacion: "azul-chat" });
});

test("las cabeceras también se leen de un objeto plano, sin importar mayúsculas", () => {
  const h = Object.fromEntries([...cabeceras().entries()].map(([k, v]) => [k.toUpperCase(), v]));
  assert.equal(autenticarAplicacion({ headers: h, cuerpo: CUERPO, entorno: ENTORNO, ahora: AHORA }).ok, true);
});

test("sin firma, o con una firma de otro secreto, no entra", () => {
  const sin = autenticarAplicacion({ headers: new Headers({ [CABECERAS.aplicacion]: "azul-chat", [CABECERAS.marca]: MARCA }), cuerpo: CUERPO, entorno: ENTORNO, ahora: AHORA });
  assert.equal(sin.codigo, "FIRMA_INVALIDA");
  assert.equal(autenticar({ secreto: "un-secreto-cualquiera-que-no-es-el-de-azul-chat" }).codigo, "FIRMA_INVALIDA");
});

test("una firma hecha con AUTH_SECRET no autentica a la aplicación", () => {
  const r = autenticar({ secreto: ENTORNO.AUTH_SECRET });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "FIRMA_INVALIDA");
});

test("la firma ata el cuerpo: cambiar una letra la invalida", () => {
  const r = autenticar({ cuerpoEnviado: CUERPO.replace("ventas", "ventaz") });
  assert.equal(r.codigo, "FIRMA_INVALIDA");
});

test("la firma ata la aplicación y la marca", () => {
  // Firmada con otra marca: la verificación usa la de la cabecera.
  const firmaOtraMarca = firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: String(Number(MARCA) - 1), cuerpo: CUERPO });
  assert.equal(autenticar({ firma: firmaOtraMarca }).codigo, "FIRMA_INVALIDA");
});

test("una aplicación que no está en la lista no entra, ni con la firma correcta", () => {
  assert.equal(autenticar({ aplicacion: "otra-app" }).codigo, "APLICACION_DESCONOCIDA");
  // Heredadas de Object.prototype: no son aplicaciones.
  for (const a of ["constructor", "__proto__", "toString"]) {
    assert.equal(autenticar({ aplicacion: a }).codigo, "APLICACION_DESCONOCIDA", a);
  }
});

test("la marca de tiempo tiene ventana: fuera de ella no entra", () => {
  const vieja = String(Number(MARCA) - TOLERANCIA_SEGUNDOS - 1);
  assert.equal(autenticar({ marca: vieja }).codigo, "MARCA_VENCIDA");
  const futura = String(Number(MARCA) + TOLERANCIA_SEGUNDOS + 1);
  assert.equal(autenticar({ marca: futura }).codigo, "MARCA_VENCIDA");
  const borde = String(Number(MARCA) - TOLERANCIA_SEGUNDOS);
  assert.equal(autenticar({ marca: borde }).ok, true);
  assert.equal(autenticar({ marca: "ayer" }).codigo, "MARCA_INVALIDA");
});

test("sin secreto configurado la integración está apagada: no hay default", () => {
  const r = autenticar({}, { entorno: { AUTH_SECRET: ENTORNO.AUTH_SECRET } });
  assert.equal(r.status, 503);
  assert.equal(r.codigo, "INTEGRACION_DESHABILITADA");
});

test("un secreto corto apaga la integración en vez de usarse", () => {
  const corto = "x".repeat(LARGO_MINIMO_SECRETO - 1);
  const r = autenticar({ secreto: corto }, { entorno: { AZUL_CHAT_INTEGRACION_SECRET: corto } });
  assert.equal(r.codigo, "SECRETO_DEBIL");
});

test("si el secreto de la integración es AUTH_SECRET, la integración se apaga", () => {
  const compartido = "el-mismo-secreto-para-todo-0123456789abcdef";
  const r = autenticar({ secreto: compartido }, { entorno: { AZUL_CHAT_INTEGRACION_SECRET: compartido, AUTH_SECRET: compartido } });
  assert.equal(r.status, 503);
  assert.equal(r.codigo, "SECRETO_COMPARTIDO");
});

test("una cookie de sesión del ERP no autentica nada", () => {
  const h = new Headers({ cookie: "erpazul_sesion=un.jwt.valido; erpazul_contexto_activo=%7B%22global%22%3Atrue%7D" });
  const r = autenticarAplicacion({ headers: h, cuerpo: CUERPO, entorno: ENTORNO, ahora: AHORA });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "APLICACION_DESCONOCIDA");
});

test("ningún rechazo devuelve el secreto, la firma ni el cuerpo", () => {
  const casos = [
    autenticar({ secreto: "otro-secreto-cualquiera-0123456789abcdefgh" }),
    autenticar({ marca: "0" }),
    autenticar({}, { entorno: { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: SECRETO } }),
  ];
  for (const r of casos) {
    const texto = JSON.stringify(r);
    assert.ok(!texto.includes(SECRETO), texto);
    assert.ok(!texto.includes("ventas_resumen"), texto);
    assert.ok(!/[0-9a-f]{64}/.test(texto), texto);
  }
});
