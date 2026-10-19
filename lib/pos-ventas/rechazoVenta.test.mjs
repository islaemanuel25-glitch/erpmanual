// POR QUÉ `crear` NO ESCRIBIÓ LA VENTA, Y QUÉ PASA CON SU COBRO OFFLINE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/rechazoVenta.test.mjs
//
// La clasificación real, contra PostgreSQL y por los handlers, está en
// scripts/pruebas-db/cobrosOfflineRevision.mjs. Acá, las funciones puras y lo
// que tiene que decir el código fuente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CODIGO_RECHAZO_VENTA,
  DESTINO_RECHAZO,
  clasificarRechazo,
  codigoDeTurnoRechazado,
  estadoDeCajaOriginal,
} from "@/lib/pos-ventas/rechazoVenta";
import {
  CODIGO_RECHAZO_REGISTRO,
  CODIGO_COBRO_OFFLINE_DESCARTADO,
  PERMISO_RESOLVER_COBROS_OFFLINE,
  validarMotivoDescarte,
  LIMITES_REGISTRO,
} from "@/lib/pos-ventas/cobroOffline";
import { PERMISSION_REGISTRY } from "@/lib/rbac/registry";
import { DEFAULT_PERMISOS_SISTEMA } from "@/lib/rbac/systemRoles";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";

const LOCAL = 5;
const A = { usuarioId: 9, operadorId: 7 };
const ahora = new Date();
const HOY = fechaArgentinaISO(ahora);
const ayer = new Date(ahora.getTime() - 36 * 3600 * 1000);
const turno = (cambios = {}) => ({ localId: LOCAL, operadorId: 7, vendedorId: 9, apertura: ahora, cierre: null, cierreEnPreparacionEn: null, anuladoEn: null, ...cambios });

// ── Los códigos ─────────────────────────────────────────────────────────────

test("los códigos son UPPER_SNAKE, únicos, y el de otro local es el mismo que usa el registro", () => {
  const valores = Object.values(CODIGO_RECHAZO_VENTA);
  for (const v of valores) assert.match(v, /^[A-Z][A-Z_]+$/);
  assert.equal(new Set(valores).size, valores.length);
  assert.equal(CODIGO_RECHAZO_VENTA.ID_DE_OTRO_LOCAL, CODIGO_RECHAZO_REGISTRO.ID_DE_OTRO_LOCAL);
});

test("el turno rechazado se explica con un código, y la caja de otro no informa su estado", () => {
  const c = (t, quien = A) => codigoDeTurnoRechazado(t, { localId: LOCAL, ...quien });
  assert.equal(c(null), CODIGO_RECHAZO_VENTA.TURNO_INVALIDO, "inexistente");
  assert.equal(c(turno({ localId: 6 })), CODIGO_RECHAZO_VENTA.TURNO_INVALIDO, "de otro local: no se distingue");
  assert.equal(c(turno({ operadorId: 8 })), CODIGO_RECHAZO_VENTA.TURNO_AJENO);
  assert.equal(c(turno({ operadorId: 8, cierre: ahora })), CODIGO_RECHAZO_VENTA.TURNO_AJENO, "ajeno y cerrado: solo ajeno");
  assert.equal(c(turno({ cierre: ahora })), CODIGO_RECHAZO_VENTA.TURNO_CERRADO);
  assert.equal(c(turno({ cierre: ahora, anuladoEn: ahora })), CODIGO_RECHAZO_VENTA.TURNO_ANULADO);
  assert.equal(c(turno({ cierreEnPreparacionEn: ahora })), CODIGO_RECHAZO_VENTA.TURNO_EN_CORTE);
  // Sin operador: la caja es de la cuenta.
  assert.equal(c(turno({ operadorId: null }), { usuarioId: 9, operadorId: null }), CODIGO_RECHAZO_VENTA.TURNO_INVALIDO, "propio y operativo: el WHERE lo hubiera aceptado");
  assert.equal(c(turno({ operadorId: null, vendedorId: 10 }), { usuarioId: 9, operadorId: null }), CODIGO_RECHAZO_VENTA.TURNO_AJENO);
});

test("la caja original: operativa solo si es del local, está abierta y es de hoy", () => {
  const e = (t) => estadoDeCajaOriginal(t, { localId: LOCAL, hoyAR: HOY });
  assert.deepEqual(e(turno()), { operativa: true });
  assert.deepEqual(e(turno({ operadorId: 8 })), { operativa: true }, "de quién es no importa acá");
  assert.equal(e(null).motivo, CODIGO_RECHAZO_VENTA.TURNO_INVALIDO);
  assert.equal(e(turno({ localId: 6 })).motivo, CODIGO_RECHAZO_VENTA.TURNO_INVALIDO);
  assert.equal(e(turno({ cierre: ahora })).motivo, CODIGO_RECHAZO_VENTA.TURNO_CERRADO);
  assert.equal(e(turno({ cierre: ahora, anuladoEn: ahora })).motivo, CODIGO_RECHAZO_VENTA.TURNO_ANULADO);
  assert.equal(e(turno({ cierreEnPreparacionEn: ahora })).motivo, CODIGO_RECHAZO_VENTA.TURNO_EN_CORTE);
  assert.equal(e(turno({ apertura: ayer })).motivo, CODIGO_RECHAZO_VENTA.TURNO_DE_OTRO_DIA);
});

// ── La clasificación ────────────────────────────────────────────────────────

const OPERATIVA = { operativa: true };

test("con la caja original operativa: el contenido va a revisión, lo demás sigue pendiente", () => {
  const revision = [
    "TURNO_REQUERIDO", "TURNO_INVALIDO", "TURNO_CERRADO", "TURNO_ANULADO", "TURNO_EN_CORTE", "TURNO_DE_OTRO_DIA",
    "LISTA_PRECIOS_CAMBIADA", "CLIENTE_REQUERIDO", "STOCK_INSUFICIENTE", "COMBO_INVALIDO", "PRODUCTO_NO_EN_LOCAL", "ID_DE_OTRO_LOCAL",
  ];
  for (const codigo of revision) {
    assert.deepEqual(clasificarRechazo({ codigo, cajaOriginal: OPERATIVA }), { destino: DESTINO_RECHAZO.REVISAR, motivo: codigo }, codigo);
  }
  // El dueño todavía puede sincronizarla con su PIN; la red, el candado o la
  // concurrencia pueden andar en el próximo intento; sin código no se adivina.
  for (const codigo of ["TURNO_AJENO", "VENTA_DE_OTRO_OPERADOR", "TOTAL_DESACTUALIZADO", null, "ALGO_NUEVO"]) {
    assert.deepEqual(clasificarRechazo({ codigo, cajaOriginal: OPERATIVA }), { destino: DESTINO_RECHAZO.REINTENTAR }, String(codigo));
  }
});

test("con la caja original que ya no puede recibirla, todo va a revisión con el motivo de la caja", () => {
  for (const codigo of [null, "TURNO_AJENO", "VENTA_DE_OTRO_OPERADOR", "STOCK_INSUFICIENTE"]) {
    assert.deepEqual(
      clasificarRechazo({ codigo, cajaOriginal: { operativa: false, motivo: "TURNO_CERRADO" } }),
      { destino: DESTINO_RECHAZO.REVISAR, motivo: "TURNO_CERRADO" },
      String(codigo)
    );
  }
});

test("un cobro descartado no se toca", () => {
  assert.deepEqual(clasificarRechazo({ codigo: CODIGO_COBRO_OFFLINE_DESCARTADO, cajaOriginal: OPERATIVA }), { destino: DESTINO_RECHAZO.NINGUNO });
});

// ── El permiso y el motivo ──────────────────────────────────────────────────

test("ventas.resolver_offline existe en el registro y no va a NINGÚN rol de sistema", () => {
  const entrada = PERMISSION_REGISTRY.find((p) => p.code === PERMISO_RESOLVER_COBROS_OFFLINE);
  assert.ok(entrada, "el permiso no está en el registro");
  assert.equal(entrada.group, "pos");
  assert.equal(entrada.deprecated, false);
  for (const [rol, permisos] of Object.entries(DEFAULT_PERMISOS_SISTEMA)) {
    assert.equal((permisos || []).includes(PERMISO_RESOLVER_COBROS_OFFLINE), false, `el rol ${rol} lo recibe por defecto`);
  }
});

test("el motivo del descarte es obligatorio, se recorta y se tiene que poder guardar", () => {
  for (const vacio of [undefined, null, "", "   ", 42, {}]) assert.equal(validarMotivoDescarte(vacio).valido, false, JSON.stringify(vacio));
  assert.deepEqual(validarMotivoDescarte("  caja cerrada sin sincronizar  "), { valido: true, motivo: "caja cerrada sin sincronizar" });
  assert.equal(validarMotivoDescarte("x".repeat(900)).motivo.length, LIMITES_REGISTRO.largoMotivo);
  assert.equal(validarMotivoDescarte("motivo\u0000").valido, false);
  assert.equal(validarMotivoDescarte("motivo \uD83D").valido, false);
  const largo = "x".repeat(LIMITES_REGISTRO.largoMotivo - 1) + "😀";
  assert.equal(validarMotivoDescarte(largo).motivo, "x".repeat(LIMITES_REGISTRO.largoMotivo - 1), "el recorte no parte un par");
});

// ── El código fuente, sin comentarios ───────────────────────────────────────

const sin = (ruta) => readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("crear pone su código a cada rechazo que la clasificación necesita", () => {
  const crear = sin("app/api/pos-ventas/crear/route.js");
  for (const nombre of ["TURNO_REQUERIDO", "TURNO_DE_OTRO_DIA", "LISTA_PRECIOS_CAMBIADA", "CLIENTE_REQUERIDO", "COMBO_INVALIDO", "STOCK_INSUFICIENTE", "PRODUCTO_NO_EN_LOCAL", "ID_DE_OTRO_LOCAL"]) {
    assert.match(crear, new RegExp(`code:[^,}]*CODIGO_RECHAZO_VENTA\\.${nombre}`), `falta el código ${nombre}`);
  }
  assert.match(crear, /code: codigoTurno,/, "el turno rechazado no lleva su código");
  assert.doesNotMatch(crear, /CODIGO_RECHAZO_VENTA\.\w+\s*:\s*\w+\.message/, "un código no sale de un texto");
});

test("crear no devuelve como duplicada una venta de otro local", () => {
  const crear = sin("app/api/pos-ventas/crear/route.js");
  const iOtroLocal = crear.search(/if \(ventaExistente && ventaExistente\.localId !== localId\)/);
  const iDuplicada = crear.search(/if \(ventaExistente\) \{\s*return responderDuplicada\(ventaExistente, txnId\);/);
  assert.ok(iOtroLocal > 0 && iDuplicada > iOtroLocal, "el chequeo de otro local tiene que ir antes de la respuesta duplicada");
});

test("el rechazo se anota después de responder, fuera de la transacción de la venta", () => {
  const crear = sin("app/api/pos-ventas/crear/route.js");
  const iPost = crear.search(/export async function POST\(req\) \{/);
  const iProcesar = crear.search(/async function procesarCrear\(req, intento\)/);
  const iAnotar = crear.search(/await anotarRechazoDeVenta\(prisma,/);
  assert.ok(iPost >= 0 && iAnotar > iPost && iAnotar < iProcesar, "anotarRechazoDeVenta tiene que vivir en POST, fuera de procesarCrear");
  assert.equal((crear.match(/anotarRechazoDeVenta\(/g) || []).length, 1);
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  const cuerpo = servidor.slice(servidor.search(/export async function anotarRechazoDeVenta/));
  assert.match(cuerpo, /await tomarCandadoDelLocal\(tx, localId\);/, "el rechazo se anota con el candado del local");
});

test("descartar toma el candado del local, mira la venta y deja la bitácora en la misma transacción", () => {
  const servidor = sin("lib/pos-ventas/cobroOfflineServidor.js");
  const cuerpo = servidor.slice(servidor.search(/export async function descartarCobroOffline/));
  const iCandado = cuerpo.search(/await tomarCandadoDelLocal\(tx, localId\);/);
  const iVenta = cuerpo.search(/tx\.venta\.findUnique/);
  const iUpdate = cuerpo.search(/estado: ESTADO_COBRO_OFFLINE\.DESCARTADA,/);
  const iBitacora = cuerpo.search(/tx\.auditoriaBitacora\.create/);
  const iCierre = cuerpo.search(/\}\s*,\s*LIMITES_TRANSACCION_DEL_LOCAL\s*\)/);
  assert.ok(iCandado > 0 && iVenta > iCandado && iUpdate > iVenta && iBitacora > iUpdate && iCierre > iBitacora,
    `orden: candado ${iCandado}, venta ${iVenta}, descarte ${iUpdate}, bitácora ${iBitacora}, cierre ${iCierre}`);
  const ruta = sin("app/api/pos-ventas/cobros-offline/[id]/descartar/route.js");
  assert.match(ruta, /requirePerm\(req, PERMISO_RESOLVER_COBROS_OFFLINE\)/);
});
