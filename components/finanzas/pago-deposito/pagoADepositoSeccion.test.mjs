// CANDADO: FINANZAS → PAGO A DEPÓSITO, LA SECCIÓN PROPIA.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/pago-deposito/pagoADepositoSeccion.test.mjs
//
// La cuenta es de Transferencias y está probada en `cuentaDelPeriodo.test.mjs` y
// contra PostgreSQL en `scripts/pruebas-db/pagoADeposito.mjs`. Acá se afirma lo
// que es propio de la sección:
//
//   · que el menú la tiene, con `finanzas.ver` y el ícono decidido;
//   · que la API es de SOLO LECTURA, liviana y sin N+1, y delega en la cuenta
//     canónica;
//   · que la entrada del depósito excluye al propio depósito;
//   · que el listado individual sale de la MISMA valorización, sin recalcular, y
//     que las pendientes NO se listan;
//   · que el "Ver" por transferencia y el "Ver transferencias" agregado abren el
//     módulo real con criterio RECEPCION, y solo con permiso.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FilaConImporte from "@/components/periodo/FilaConImporte";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";
import { urlDelDetalle } from "@/lib/transferencias/contextoDelTablero";
import { CRITERIO_CUENTA } from "@/lib/transferencias/criterioDeCuenta";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import {
  detalleDePagoADeposito,
  resumenDePagoADeposito,
} from "@/lib/transferencias/cuentaDelPeriodoServer";
import { importeDeLaTransferenciaCentavos } from "@/lib/transferencias/bloquesPorLocal";
import { desdeCentavos } from "@/lib/transferencias/agregadosPeriodo";
import { parseContextoFinanzas } from "@/lib/finanzas/contextoFinanzas";
import { UNIDAD_FINANCIERA_POR_DEFECTO } from "@/lib/finanzas/periodoFinanciero";
import { VISTA_PENDIENTES } from "@/lib/transferencias/contextoDelTablero";
import {
  armarPagoADeposito,
  enlaceDePagoADeposito,
  enlacePendientesDePagoADeposito,
} from "@/lib/finanzas/pagoADeposito";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
/** El fuente sin comentarios: un candado que busca texto no afirma sobre prosa. */
const codigo = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\/[^\n]*/g, " ");

const API = "app/api/finanzas/pago-a-deposito/route.js";
const CUENTA = "components/finanzas/pago-deposito/CuentaPagoADeposito.jsx";
const TABLERO = "components/finanzas/pago-deposito/TableroPagoADeposito.jsx";

// ── EL FIXTURE: LA FORMA DE `SELECT_TRANSFERENCIA_DE_LA_CUENTA` ──────────────

const BASE = Object.freeze({
  precio_costo: "23333.33",
  unidad_medida: "cajon",
  factor_pack: 8,
  nombre: "COCA COLA 2L",
  pesoEsFijo: false,
  pesoReferenciaKg: null,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "UNIDAD",
});
const linea = (recibido) => ({
  cantidad: "32.000",
  recibido: recibido == null ? null : String(recibido),
  recibidoUnidadesSueltas: null,
  precioCosto: "23333.33",
  unidadEnviada: "UNIDAD",
  presentacionEnvio: "CAJON",
  cantidadPresentada: "4.000",
  factorPresentacion: 8,
  sueltasEnviadas: "0.000",
  pesoPiezaKg: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: recibido != null,
  productoId: 70,
  producto: { precio_costo: "99999.99", nombre: "COCA COLA 2L", base: BASE },
});
const DEPOSITO = Object.freeze({ id: 1, nombre: "Depósito", es_deposito: true });
const fila = ({ id, estado, envio, recepcion = null, recibido = 4 }) => ({
  id,
  estado,
  fechaEnvio: envio ? new Date(envio) : null,
  fechaRecepcion: recepcion ? new Date(recepcion) : null,
  createdAt: new Date(envio || "2026-09-01T12:00:00.000Z"),
  destinoId: 4,
  origen: DEPOSITO,
  destino: { id: 4, nombre: "Local 4" },
  detalle: [linea(recibido)],
});

const RANGO = Object.freeze({ desde: "2026-09-13", hasta: "2026-09-19" });
const FILAS = [
  // Dos reconocidas en el rango.
  fila({ id: 101, estado: "Recibida", envio: "2026-09-10T12:00:00Z", recepcion: "2026-09-14T12:00:00Z", recibido: 2 }),
  fila({ id: 102, estado: "Recibida", envio: "2026-09-14T12:00:00Z", recepcion: "2026-09-15T12:00:00Z", recibido: 3 }),
  // Pendiente: salió antes del cierre y no se confirmó. No suma y no se lista.
  fila({ id: 103, estado: "Enviada", envio: "2026-09-16T12:00:00Z", recibido: null }),
  // Recibida pero FUERA del rango: no entra.
  fila({ id: 104, estado: "Recibida", envio: "2026-09-01T12:00:00Z", recepcion: "2026-09-05T12:00:00Z", recibido: 4 }),
];
/** Un `db` de mentira: `leerCuentaPorRecepcion` solo hace un `findMany`. */
const dbFalso = { transferencia: { findMany: async () => FILAS } };

// ── 1 · EL MENÚ ─────────────────────────────────────────────────────────────

test("S1 · el menú tiene «Pago a depósito» con finanzas.ver y el ícono Warehouse", () => {
  const registry = codigo("lib/menu/registry.js");
  const i = registry.indexOf('label: "Pago a depósito"');
  assert.ok(i > 0, "el ítem no está en el menú");
  const bloque = registry.slice(i, i + 320);
  assert.match(bloque, /href: RUTA_PAGO_A_DEPOSITO/);
  assert.match(bloque, /permiso: "finanzas\.ver"/);
  assert.match(bloque, /icon: Warehouse/);
  // Ni ArrowLeftRight (Transferencias) ni un camión.
  assert.doesNotMatch(bloque, /icon: (ArrowLeftRight|Truck)/);
  // Y está en el grupo Finanzas, después de Gastos.
  assert.ok(registry.indexOf('label: "Gastos"') < i, "no va después de Gastos");
});

// ── 2 · LA API: SOLO LECTURA, LIVIANA, SIN N+1, SIN VALORIZAR ───────────────

test("S2 · la API no escribe: ni un create, update, delete ni raw de escritura", () => {
  const api = codigo(API);
  for (const esc of [/\.create\(/, /\.createMany\(/, /\.update\(/, /\.updateMany\(/, /\.upsert\(/, /\.delete\(/, /\.deleteMany\(/, /\$executeRaw/]) {
    assert.doesNotMatch(api, esc, `la API escribe (${esc})`);
  }
});

test("S3 · la API delega en la cuenta canónica y NO consulta ni valoriza transferencias", () => {
  const api = codigo(API);
  // Delega, no consulta: nada de findMany/findFirst de transferencias ni de la
  // cuenta escrita a mano.
  for (const p of [/transferencia\.findMany/, /transferencia\.findFirst/, /cuentaDelPeriodo\(/, /leerCuentaPorRecepcion\(/, /importeRecibidoDe/, /importeDeLaTransferencia/, /valorizar/]) {
    assert.doesNotMatch(api, p, `la API hace su propia cuenta (${p})`);
  }
  assert.match(api, /detalleDePagoADeposito\(prisma, \{ destinoId: localId, rango \}\)/);
  assert.match(api, /primeraRecepcion\(prisma, \{ destinoId: localId \}\)/);
  assert.match(api, /from "@\/lib\/transferencias\/cuentaDelPeriodoServer"/);
});

test("S4 · la API no tiene N+1: una sola cuenta, sin prisma dentro de un bucle", () => {
  const api = codigo(API);
  // Una sola llamada a la cuenta por local; nada de prisma adentro de un `.map(`
  // ni de un `for`.
  assert.equal((api.match(/detalleDePagoADeposito\(/g) || []).length, 1);
  assert.doesNotMatch(api, /\.map\([^)]*await/);
  assert.doesNotMatch(api, /for\s*\([^)]*\)\s*\{[\s\S]*?prisma\./);
});

test("S5 · la entrada del depósito excluye al propio depósito", () => {
  const api = codigo(API);
  assert.match(api, /const pagadores = locales\.filter\(\(l\) => !l\.esDeposito\)/);
  // La respuesta de entrada manda esa lista, no la completa.
  assert.match(api, /vista: "ENTRADA", locales: pagadores/);
  assert.doesNotMatch(api, /vista: "ENTRADA", locales: locales\b/);
});

test("S6 · período y alcance con los helpers canónicos; el Ver pide transferencias.ver", () => {
  const api = codigo(API);
  assert.match(api, /rangoFinanciero\(\{ unidad, desplazamiento, vigencias \}\)/);
  assert.match(api, /resolverLocalPedido\(/);
  assert.match(api, /checkPerm\(session, "finanzas\.ver"\)/);
  assert.match(api, /checkPerm\(session, PERMISO_VER_TRANSFERENCIAS\)\.ok/);
  assert.match(api, /localDelEnlace: esDeposito \? localId : null/);
});

// ── 3 · LA CUENTA CANÓNICA CON SU LISTADO ──────────────────────────────────

test("S7 · detalleDePagoADeposito lista las reconocidas con la MISMA valorización, y da el mismo total que el resumen", async () => {
  const detalle = await detalleDePagoADeposito(dbFalso, { destinoId: 4, rango: RANGO });
  const resumen = await resumenDePagoADeposito(dbFalso, { destinoId: 4, rango: RANGO });

  // El agregado es idéntico al del Resumen: una sola cuenta, dos lecturas.
  assert.equal(detalle.total, resumen.total);
  assert.equal(detalle.cantidadTransferencias, resumen.cantidadTransferencias);
  assert.deepEqual(detalle.pendientes, resumen.pendientes);
  assert.equal(detalle.criterio, CRITERIO_CUENTA.RECEPCION);

  // Solo las dos reconocidas, con lo financiero mínimo. La pendiente (103) y la
  // de fuera de rango (104) NO están en el listado.
  assert.deepEqual(
    detalle.recibidas.map((r) => r.id),
    [101, 102]
  );
  assert.equal(detalle.cantidadTransferencias, 2);
  assert.equal(detalle.pendientes.cantidadTransferencias, 1);
  for (const r of detalle.recibidas) {
    assert.deepEqual(Object.keys(r).sort(), ["fechaRecepcion", "id", "importe"]);
    assert.ok(r.fechaRecepcion, "cada fila trae su fecha de recepción");
  }

  // El importe de cada fila es la MISMA puerta canónica que suma el total.
  const esperado = FILAS.filter((f) => [101, 102].includes(f.id)).map((f) =>
    desdeCentavos(importeDeLaTransferenciaCentavos(f, "test"))
  );
  assert.deepEqual(detalle.recibidas.map((r) => r.importe), esperado);
});

// ── 4 · LA PANTALLA (fuente + piezas reales) ───────────────────────────────

test("S8 · la cuenta usa las piezas compartidas y la MISMA valorización no aparece", () => {
  const src = codigo(CUENTA);
  // Agrupa por el día de recepción con la pieza de Transferencias; no recalcula.
  assert.match(src, /diasDeTransferencias\([^)]*fechaDe: \(t\) => t\.fechaRecepcion/);
  // No valoriza ni consulta: ninguna de las fórmulas del dominio aparece acá.
  for (const p of [/importeRecibidoDe/, /importeDeLaTransferencia/, /valorizar/, /transferencia\.find/, /cuentaDelPeriodo\(/]) {
    assert.doesNotMatch(src, p, `la pantalla valoriza o consulta (${p})`);
  }
  // El "Ver" por transferencia abre el módulo real con criterio RECEPCION, y
  // solo con permiso.
  assert.match(src, /urlDelDetalle\(t\.id, ctxDetalle\)/);
  assert.match(src, /criterio: CRITERIO_CUENTA\.RECEPCION/);
  assert.match(src, /onAbrir=\{puedeVer \?/);
  // El agregado y los rótulos canónicos.
  assert.match(src, /ROTULO_PAGO_A_DEPOSITO/);
  assert.match(src, /EnlaceAlModulo href=\{pago\.verDetalle\}/);
  // Las pendientes NO se listan: solo el agregado, atenuado y con su nota.
  assert.match(src, /NOTA_PENDIENTES/);
  assert.match(src, /sunmi-text-muted/);
  assert.doesNotMatch(src, /pendientes\.(transferencias|map)/, "las pendientes se listan de a una");
});

test("S9 · la entrada reusa EntradaDeLocales y navega a la cuenta del local", () => {
  const src = codigo(TABLERO);
  assert.match(src, /EntradaDeLocales/);
  assert.match(src, /urlDeLocalPagoADeposito\(l\.localId, cuenta\.contexto\)/);
});

test("S10 · FilaConImporte muestra «Ver ›» solo con onAbrir; el importe va siempre", () => {
  const conVer = renderToStaticMarkup(
    React.createElement(FilaConImporte, { importe: "$85.300", onAbrir: () => {}, etiqueta: "x" }, "Transferencia #123")
  );
  assert.ok(conVer.includes("$85.300"));
  assert.ok(conVer.includes("Ver ›"), "con permiso no se ofrece abrir");

  const sinVer = renderToStaticMarkup(
    React.createElement(FilaConImporte, { importe: "$85.300" }, "Transferencia #123")
  );
  assert.ok(sinVer.includes("$85.300"), "sin permiso se pierde el importe");
  assert.ok(!sinVer.includes("Ver ›"), "sin permiso igual se ofrece abrir");
});

test("S11 · el «Ver transferencias» agregado es un enlace al módulo real", () => {
  const html = renderToStaticMarkup(
    React.createElement(EnlaceAlModulo, { href: "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION", texto: "Ver transferencias" })
  );
  assert.match(html, /<a href="\/modulos\/transferencias\/cuenta\?desp=0&(amp;)?criterio=RECEPCION"/);
  assert.match(html, /Ver transferencias ›/);
});

// ── 5 · LOS ENLACES ────────────────────────────────────────────────────────

test("S12 · el Ver por transferencia abre la transferencia real, con el período y RECEPCION", () => {
  // Local mirando lo suyo: sin `local` en el contexto.
  const propio = urlDelDetalle(123, { unidad: UNIDADES.SEMANA, desp: 0, local: null, criterio: CRITERIO_CUENTA.RECEPCION });
  assert.ok(propio.startsWith("/modulos/transferencias/123?"), propio);
  assert.match(propio, /criterio=RECEPCION/);
  assert.match(propio, /desp=0/);

  // Depósito mirando un local: `local` viaja, para que "Volver" caiga en su cuenta.
  const desdeDeposito = urlDelDetalle(123, { unidad: UNIDADES.MES, desp: -1, local: 4, criterio: CRITERIO_CUENTA.RECEPCION });
  assert.match(desdeDeposito, /local=4/);
  assert.match(desdeDeposito, /criterio=RECEPCION/);
});

// ── 6 · EL PERÍODO INICIAL: DÍA (2026-10-01) ───────────────────────────────

test("S13 · Pago a depósito abre en DÍA, y SEMANA/MES siguen andando cuando se piden", () => {
  // El default lo da la MISMA función que usa el hook de la pantalla. No es
  // propio de Pago a depósito: es el de todas las pantallas de Finanzas.
  assert.equal(UNIDAD_FINANCIERA_POR_DEFECTO, "DIA");
  assert.equal(parseContextoFinanzas({}).unidad, "DIA", "abre en Semana en vez de Día");
  assert.equal(parseContextoFinanzas(new URLSearchParams("")).unidad, "DIA");
  // Elegir otra unidad sigue valiendo: no se fuerza Día sobre lo pedido.
  assert.equal(parseContextoFinanzas({ unidad: "SEMANA" }).unidad, "SEMANA");
  assert.equal(parseContextoFinanzas({ unidad: "MES" }).unidad, "MES");
});

test("S14 · el desplazamiento se conserva, sea cual sea la unidad", () => {
  for (const unidad of ["DIA", "SEMANA", "MES"]) {
    assert.equal(parseContextoFinanzas({ unidad, desp: -3 }).desp, -3, unidad);
  }
  // Y una unidad basura cae en el default sin pisar el desplazamiento.
  assert.deepEqual(parseContextoFinanzas({ unidad: "QUINCENA", desp: -2 }), { unidad: "DIA", desp: -2 });
});

// ── 7 · "VER PENDIENTES" ───────────────────────────────────────────────────

test("S15 · «Ver pendientes» lleva al tablero real con el local, el período y SOLO las pendientes", () => {
  // Desde el depósito mirando el local 4: el local viaja en la ruta.
  const url = enlacePendientesDePagoADeposito({
    puedeVerTransferencias: true,
    unidad: UNIDADES.MES,
    desplazamiento: -2,
    localDelEnlace: 4,
  });
  assert.match(url, /^\/modulos\/transferencias\/local\/4\?/, url);
  assert.match(url, /criterio=RECEPCION/);
  assert.match(url, /vista=pendientes/);
  assert.match(url, /unidad=MES/);
  assert.match(url, /desp=-2/);
  // Es el MISMO destino que "Ver transferencias", con la vista puesta en
  // pendientes: ni otro local, ni otro período, ni otro criterio.
  const verCuenta = enlaceDePagoADeposito({
    puedeVerTransferencias: true,
    unidad: UNIDADES.MES,
    desplazamiento: -2,
    localDelEnlace: 4,
  });
  assert.equal(url, `${verCuenta}${verCuenta.includes("?") ? "&" : "?"}vista=${VISTA_PENDIENTES}`);
});

test("S16 · sin transferencias.ver no hay enlace de pendientes; con permiso, sí", () => {
  assert.equal(
    enlacePendientesDePagoADeposito({ puedeVerTransferencias: false, unidad: UNIDADES.DIA, desplazamiento: 0, localDelEnlace: null }),
    null,
    "sin permiso no se ofrece la puerta"
  );
  assert.ok(
    enlacePendientesDePagoADeposito({ puedeVerTransferencias: true, unidad: UNIDADES.DIA, desplazamiento: 0, localDelEnlace: null })
  );
});

test("S17 · el contrato solo trae «Ver pendientes» cuando hay pendientes", () => {
  const conPend = armarPagoADeposito({
    esDeposito: false,
    cuenta: { total: 100, cantidadTransferencias: 1, pendientes: { total: 50, cantidadTransferencias: 2 } },
    verPendientes: "/p",
  });
  assert.equal(conPend.pendientes.verPendientes, "/p");
  const sinPend = armarPagoADeposito({
    esDeposito: false,
    cuenta: { total: 100, cantidadTransferencias: 1, pendientes: { total: 0, cantidadTransferencias: 0 } },
    verPendientes: "/p",
  });
  assert.equal(sinPend.pendientes.verPendientes, null, "un enlace a cero pendientes no lleva a ningún lado");
  // Y las pendientes siguen SIN sumar al total reconocido.
  assert.equal(conPend.total, 100);
});

test("S18 · la pantalla dibuja «Ver pendientes» gated por el enlace, sin recalcular", () => {
  const src = codigo(CUENTA);
  // El enlace sale del contrato —no se arma en el componente— y se dibuja solo
  // cuando hay pendientes y viene el enlace.
  assert.match(src, /p\.verPendientes/);
  assert.match(src, /EnlaceAlModulo href=\{p\.verPendientes\}/);
  assert.match(src, /hay && p\.verPendientes/);
  // Sigue sin listar las pendientes de a una ni valorizar.
  assert.doesNotMatch(src, /importeDeLaTransferencia|valorizar/);
});

test("S19 · la cuenta de Transferencias lista las pendientes solo en la vista pendientes", () => {
  const src = codigo("components/transferencias/CuentaDeUnLocal.jsx");
  // La vista elige la fuente: las pendientes ya vienen de la cuenta, no se
  // recalculan; la de siempre no las mira.
  assert.match(src, /VISTA_PENDIENTES/);
  assert.match(src, /pendientes\?\.transferencias/);
  // El endpoint del tablero manda las filas pendientes resumidas, de la MISMA
  // cuenta, sin otra consulta.
  const apiSrc = codigo("app/api/transferencias/tablero/route.js");
  assert.match(apiSrc, /pendientes\.transferencias\.map\(resumir\)/);
});
