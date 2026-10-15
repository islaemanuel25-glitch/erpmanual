// Candados del AVISO DE PAGO PARCIAL AL PROVEEDOR (2026-10-15).
//
// Regla de Emanuel: no puede entrar mercadería con deuda sin avisar. Si algo ya
// se pagó y aun así queda saldo, recibir exige confirmarlo con ESE saldo; queda
// quién y cuándo; la compra queda "Pago parcial" hasta saldo cero; sale UNA
// campanita y UN evento para Azul Chat por recepción; si lo pagado supera lo
// cargado, sigue frenado.
//
// Las reglas puras se ejercen; la ruta, la hoja y la capacidad de Azul Chat se
// leen SIN COMENTARIOS (los comentarios de estos archivos nombran a propósito
// lo que se exige, y un candado que los leyera daría verde por prosa). La
// verdad contra PostgreSQL la ejerce `scripts/pruebas-db/compraConSaldo.mjs`.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/saldoAlRecibir.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  confirmaElSaldo,
  esPagoParcial,
  saldoAlRecibir,
  textoDeLaNotificacion,
  textoDelAviso,
  textoDelBoton,
  textoDelEvento,
} from "./saldoAlRecibir.js";
import { pagoDelCierreEnPantalla } from "./pagoDelCierre.js";
import { errorPagadoDeMas } from "./compraPorCargar.js";
import { aEvento, comprasSaldoEventos, whereEventos } from "../integraciones/azul-chat/comprasSaldoEventos.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
const RUTA_RECIBIR = "app/api/compras-proveedor/recibir/[id]/route.js";

// El caso de Emanuel: $10.000 pagados desde el POS, $16.000 cargados.
const CASO = { totalCentavos: 1_600_000, yaPagadoCentavos: 1_000_000 };

test("con plata pagada y saldo, pide confirmación; sin pago, o cubierto, no", () => {
  assert.deepEqual(saldoAlRecibir(CASO), { totalCentavos: 1_600_000, pagadoCentavos: 1_000_000, saldoCentavos: 600_000, pideConfirmacion: true });
  // Lo pagado puede venir del POS, del cierre, o de los dos.
  assert.equal(saldoAlRecibir({ totalCentavos: 1_600_000, pagoAhoraCentavos: 1_000_000 }).pideConfirmacion, true);
  assert.equal(saldoAlRecibir({ totalCentavos: 1_600_000, yaPagadoCentavos: 500_000, pagoAhoraCentavos: 500_000 }).saldoCentavos, 600_000);
  // "Queda pendiente" sin pagar nada ya es una decisión explícita de la hoja.
  assert.equal(saldoAlRecibir({ totalCentavos: 1_600_000 }).pideConfirmacion, false);
  // Pagado justo: no hay deuda.
  assert.equal(saldoAlRecibir({ totalCentavos: 1_600_000, yaPagadoCentavos: 1_600_000 }).pideConfirmacion, false);
});

test("menor a lo pagado sigue bloqueado: no es un saldo a confirmar, es el error de siempre", () => {
  const deMas = saldoAlRecibir({ totalCentavos: 800_000, yaPagadoCentavos: 1_000_000 });
  assert.equal(deMas.pideConfirmacion, false);
  assert.equal(deMas.saldoCentavos, 0);
  // La hoja no deja confirmar: el mismo error que la ruta.
  const enPantalla = pagoDelCierreEnPantalla({ totales: [8000], estado: "PENDIENTE", yaPagadoCentavos: 1_000_000 });
  assert.equal(enPantalla.listo, false);
  assert.equal(enPantalla.error, errorPagadoDeMas({ yaPagadoCentavos: 1_000_000, totalCentavos: 800_000 }));
  // Y la ruta lo frena ANTES de mirar el saldo.
  const src = leer(RUTA_RECIBIR);
  const frenoDeMas = src.indexOf("errorPagadoDeMas(");
  const saldo = src.indexOf("saldoAlRecibir(");
  assert.ok(frenoDeMas > 0 && saldo > frenoDeMas, "el freno de lo pagado de más va antes del saldo");
});

test("la confirmación es la de ESE saldo: otro importe, o nada, no confirma", () => {
  assert.equal(confirmaElSaldo(6000, 600_000), true);
  assert.equal(confirmaElSaldo("6000.00", 600_000), true);
  assert.equal(confirmaElSaldo(5999.99, 600_000), false);
  assert.equal(confirmaElSaldo(undefined, 600_000), false);
  assert.equal(confirmaElSaldo(null, 600_000), false);
  assert.equal(confirmaElSaldo("", 600_000), false);
  assert.equal(confirmaElSaldo(true, 600_000), false);
  assert.equal(confirmaElSaldo("si", 600_000), false);
});

test("los cuatro textos, con el formateador único", () => {
  const s = saldoAlRecibir(CASO);
  assert.equal(textoDelAviso({ proveedor: "Arcor", ...s }), "Pedido $16.000,00 · Pagado $10.000,00 · Quedan $6.000,00 a deber a Arcor");
  assert.equal(textoDelBoton(s.saldoCentavos), "Recibir y dejar $6.000,00 a deber");
  assert.equal(textoDeLaNotificacion({ proveedor: "Arcor", saldoCentavos: s.saldoCentavos }), "Arcor: quedan $6.000,00 a deber");
  assert.equal(textoDelEvento({ proveedor: "Arcor", ...s }), "Arcor: pedido $16.000,00 · pagado $10.000,00 · quedan $6.000,00 a deber");
});

test("'Pago parcial' son dos hechos: se confirmó la deuda y la cuenta todavía tiene saldo", () => {
  assert.equal(esPagoParcial({ compraConSaldo: { id: 1 }, cuenta: { saldo: 6000 } }), true);
  assert.equal(esPagoParcial({ compraConSaldo: { id: 1 }, cuenta: { saldo: 0 } }), false, "saldo cero: se apaga");
  assert.equal(esPagoParcial({ compraConSaldo: null, cuenta: { saldo: 6000 } }), false, "deuda sin pago previo: no es parcial");
  assert.equal(esPagoParcial({ compraConSaldo: { id: 1 }, cuenta: null }), false);
});

// ── LA RUTA ─────────────────────────────────────────────────────────────

/** Lo que la ruta tiene que cumplir para que recibir con deuda exija confirmarla. */
function problemasDeLaConfirmacion(src) {
  const p = [];
  const guardia = /if \(saldo\.pideConfirmacion && !confirmaElSaldo\(pagoAlProveedor\.saldoConfirmado, saldo\.saldoCentavos\)\) \{[\s\S]{0,400}?codigo: CODIGO_SALDO_SIN_CONFIRMAR,[\s\S]{0,400}?\{ status: 409 \}/;
  const m = src.match(guardia);
  if (!m) p.push("falta la guardia que frena sin confirmación");
  else if (m.index > src.indexOf("prisma.$transaction(")) p.push("la guardia está después de escribir");
  if (!/compraConSaldo = await tx\.compraConSaldo\.create\(\{[\s\S]{0,600}?confirmadoPorId: session\.id,/.test(src)) p.push("no registra quién confirmó, dentro de la transacción");
  if (!/if \(saldo\.pideConfirmacion\) \{\s*compraConSaldo = await tx\.compraConSaldo\.create/.test(src)) p.push("el registro no depende de que haya saldo confirmado");
  return p;
}

test("recibir con más de lo pagado exige confirmación explícita, antes de escribir, y registra quién", () => {
  assert.deepEqual(problemasDeLaConfirmacion(leer(RUTA_RECIBIR)), []);
});

test("CONTRAPRUEBA: sacar la confirmación obligatoria, o moverla después de escribir, pone rojo", () => {
  const src = leer(RUTA_RECIBIR);
  assert.notDeepEqual(problemasDeLaConfirmacion(src.replace("if (saldo.pideConfirmacion && !confirmaElSaldo(", "if (false && !confirmaElSaldo(")), []);
  assert.notDeepEqual(problemasDeLaConfirmacion(src.replace("confirmadoPorId: session.id,", "")), []);
  // La guardia escrita en un comentario no cuenta.
  const comentada = sinComentarios(src.replace("if (saldo.pideConfirmacion && !confirmaElSaldo(", "// if (saldo.pideConfirmacion && !confirmaElSaldo(\nif (false && ("));
  assert.notDeepEqual(problemasDeLaConfirmacion(comentada), []);
});

test("UNA campanita por recepción: después de la transacción, solo si se escribió la fila, nunca en el reintento", () => {
  const src = leer(RUTA_RECIBIR);
  const llamadas = src.match(/crearNotificacion\(/g) || [];
  assert.equal(llamadas.length, 1, "una sola llamada");
  const finTx = src.indexOf("prisma.$transaction(");
  const notif = src.indexOf("crearNotificacion(");
  assert.ok(notif > finTx, "después de confirmar la transacción");
  assert.match(src, /if \(compraConSaldo\) \{\s*await crearNotificacion\(\{/);
  // El reintento sale por `respuestaDelCierre`, que no notifica.
  const respuesta = src.slice(src.indexOf("async function respuestaDelCierre"), src.indexOf("async function respuestaDelCierre") + 2500);
  assert.doesNotMatch(respuesta.slice(0, respuesta.indexOf("\n}\n")), /crearNotificacion/);
  // A Finanzas de la ubicación dueña, con link a la cuenta.
  assert.match(src, /permisoRequerido: PERMISO_VER_FINANZAS,/);
  assert.match(src, /href: urlDeCuentaPorPagar\(compraConSaldo\.cuentaId\),/);
  assert.match(src, /localId: ownerLocalId,\s*permisoRequerido/);
});

test("la recepción no le habla a Azul Chat: Chat pregunta, así que un Chat caído no la frena", () => {
  const src = leer(RUTA_RECIBIR);
  assert.doesNotMatch(src, /azul-chat|integraciones|fetch\(/);
  // Y la capacidad que Chat pregunta está en el catálogo y en el servidor.
  assert.match(leer("lib/integraciones/azul-chat/servidor.js"), /compras_saldo_eventos: \(autorizacion, parametros, \{ ahora \}\) =>\s*comprasSaldoEventos\(/);
});

test("la fila es una por pedido: UNIQUE en la base", () => {
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const modelo = schema.slice(schema.indexOf("model CompraConSaldo {"), schema.indexOf("}", schema.indexOf("model CompraConSaldo {")));
  assert.match(modelo, /pedidoProveedorId\s+Int\s+@unique/);
  assert.match(modelo, /confirmadoPorId\s+Int\b/);
  assert.match(modelo, /confirmadoEn\s+DateTime\s+@default\(now\(\)\)/);
});

// ── LA HOJA ─────────────────────────────────────────────────────────────

test("la hoja: el primer toque muestra el aviso; recibir es otro botón que manda el saldo visto; se puede volver", () => {
  const hoja = leer("components/compras-proveedor/HojaCerrarRecepcion.jsx");
  assert.match(hoja, /if \(saldo\?\.pideConfirmacion && !dejandoSaldo\) \{\s*setAvisoDelSaldo\(saldo\.saldoCentavos\);\s*return;/);
  assert.match(hoja, /saldoConfirmado: dejandoSaldo \? desdeCentavos\(saldo\.saldoCentavos\) : undefined,/);
  assert.match(hoja, /\{textoDelAviso\(\{ proveedor, \.\.\.saldo \}\)\}/);
  assert.match(hoja, /onClick=\{\(\) => confirmar\(\{ dejandoSaldo: true \}\)\}/);
  assert.match(hoja, /textoDelBoton\(saldo\.saldoCentavos\)/);
  assert.match(hoja, />\s*Volver a corregir\s*</);
  // El aviso vale para ESE saldo: si el pago cambia, deja de mostrarse.
  assert.match(hoja, /avisoDelSaldo === saldo\.saldoCentavos/);
});

test("'Pago parcial' llega a la lista y al detalle desde el servidor", () => {
  for (const ruta of ["app/api/compras-proveedor/listar/route.js", "app/api/compras-proveedor/obtener/route.js", RUTA_RECIBIR]) {
    assert.match(leer(ruta), /pagoParcial: esPagoParcial\(\{/, ruta);
  }
  const listado = leer("components/compras-proveedor/ListadoPedidosProveedor.jsx");
  assert.equal((listado.match(/\{item\.pagoParcial && <PagoParcial \/>\}/g) || []).length, 2, "escritorio y celular");
  assert.match(listado, /sunmi-badge-danger">Pago parcial</);
  assert.match(leer("components/compras-proveedor/PedidoRecibido.jsx"), /\{pagoParcial && <PagoParcial \/>\}/);
  assert.match(leer("app/modulos/compras-proveedor/[id]/page.jsx"), /pagoParcial=\{pagoParcial\}/);
});

// ── AZUL CHAT ───────────────────────────────────────────────────────────

const FILA = Object.freeze({
  id: 7,
  confirmadoEn: new Date("2026-10-15T15:00:00.000Z"),
  pedidoProveedorId: 321,
  total: "16000.00",
  pagado: "10000.00",
  saldo: "6000.00",
  pedido: { proveedor: { id: 4, nombre: "Arcor" } },
});

test("el evento para Azul Chat lleva el texto pedido y los tres números, con clave estable", () => {
  assert.deepEqual(aEvento(FILA), {
    tipo: "COMPRA_CON_SALDO",
    eventoId: "COMPRA_CON_SALDO:7:2026-10-15T15:00:00.000Z",
    compraConSaldoId: 7,
    confirmadoEn: "2026-10-15T15:00:00.000Z",
    pedidoId: 321,
    proveedor: { id: 4, nombre: "Arcor" },
    total: 16000,
    pagado: 10000,
    saldo: 6000,
    texto: "Arcor: pedido $16.000,00 · pagado $10.000,00 · quedan $6.000,00 a deber",
  });
});

test("la capacidad lee del local de la AUTORIZACIÓN, con el margen, y devuelve la fila una vez", async () => {
  const pedidos = [];
  const db = {
    local: { findUnique: async ({ where }) => (where.id === 10 ? { id: 10, nombre: "Local 10" } : null) },
    compraConSaldo: {
      findMany: async (args) => {
        pedidos.push(args);
        return args.where.OR ? [] : [FILA];
      },
    },
  };
  const ahora = Date.parse("2026-10-15T16:00:00.000Z");
  // Un local de otra autorización no existe para la capacidad.
  assert.equal((await comprasSaldoEventos({ localId: 99, grupoId: 1 }, {}, { db, ahora })).ok, false);
  const bien = await comprasSaldoEventos({ localId: 10, grupoId: 1 }, {}, { db, ahora });
  assert.equal(bien.ok, true);
  assert.equal(bien.datos.eventos.length, 1);
  assert.equal(pedidos.at(-1).where.localId, 10);
  assert.equal(pedidos.at(-1).where.confirmadoEn.lte.toISOString(), "2026-10-15T15:59:00.000Z");
  // Con el cursor del evento, la segunda vuelta no lo repite.
  const segunda = await comprasSaldoEventos({ localId: 10, grupoId: 1 }, { desde: bien.datos.siguiente }, { db, ahora });
  assert.equal(segunda.ok, true);
  assert.deepEqual(segunda.datos.eventos, []);
  assert.deepEqual(whereEventos({ localId: 10, desde: { fecha: FILA.confirmadoEn, id: 7 }, hasta: new Date(ahora) }).OR, [
    { confirmadoEn: { gt: FILA.confirmadoEn } },
    { confirmadoEn: FILA.confirmadoEn, id: { gt: 7 } },
  ]);
});
