// Candados de qué se ofrece ante una diferencia de precio.
//
// Las tres reglas están definidas y no se rediscuten:
//   · subió más del umbral → aviso con el porcentaje y los botones
//   · bajó                 → el porcentaje SIN botón, el costo no se baja solo
//   · salto brusco         → frena, no es un precio nuevo

import { test } from "node:test";
import assert from "node:assert/strict";

import { decisionDePrecio, puedeAceptarse, ACCION_PRECIO, MOTIVO_NO_ACEPTAR } from "./aceptarPrecio.js";
import { clasificarDiferenciaCosto, CLASE_DIFERENCIA } from "@/lib/compras-proveedor/fronteraCosto";
import { resolverLineaDelPedido } from "./vinculo.js";

const decidir = (anterior, nuevo, umbrales) =>
  decisionDePrecio({
    clasificacion: clasificarDiferenciaCosto({ costoAnterior: anterior, costoNuevo: nuevo, umbrales }),
    costoAnterior: anterior,
    costoNuevo: nuevo,
  });

// ── Las tres reglas ────────────────────────────────────────────────────────

test("SUBIÓ POCO: entra sin molestar", () => {
  const d = decidir(1000, 1030); // +3 %, debajo del 5
  assert.equal(d.accion, ACCION_PRECIO.NINGUNA);
  assert.equal(d.ofreceAceptar, false);
  assert.equal(d.titulo, null);
});

test("SUBIÓ MÁS DEL UMBRAL: aviso con el porcentaje y botón", () => {
  const d = decidir(1000, 1200); // +20 %
  assert.equal(d.accion, ACCION_PRECIO.OFRECER);
  assert.equal(d.ofreceAceptar, true);
  assert.match(d.titulo, /Subió 20 %/);
  // Los DOS números, no solo el porcentaje: quien decide tiene que poder
  // comprobarlo sin confiar en la cuenta del sistema.
  assert.match(d.detalle, /\$1\.000,00/);
  assert.match(d.detalle, /\$1\.200,00/);
});

test("BAJÓ: se muestra el porcentaje SIN BOTÓN", () => {
  // El costo no se baja solo, y la asimetría es a propósito: una suba no
  // aceptada hace perder margen y se nota; una baja aplicada sola lo sube en
  // silencio y nadie la mira nunca.
  const d = decidir(1000, 920); // −8 %, arriba del umbral pero debajo del de sospecha
  assert.equal(d.accion, ACCION_PRECIO.SOLO_INFORMAR);
  assert.equal(d.ofreceAceptar, false);
  assert.match(d.titulo, /Bajó 8 %/);
  assert.match(d.detalle, /NO se baja solo/i);
});

test("SALTO BRUSCO: frena, y no ofrece aceptar NI CON CONFIRMACIÓN", () => {
  // Un botón que no hay que tocar termina tocándose.
  const d = decidir(1000, 400); // −60 %
  assert.equal(d.accion, ACCION_PRECIO.FRENA);
  assert.equal(d.ofreceAceptar, false);
  assert.match(d.titulo, /no parece un precio nuevo/i);
  assert.match(d.detalle, /dígito mal leído|producto equivocado/i);
});

test("una baja grande NO se ofrece aunque también supere el umbral de revisión", () => {
  // La clasificación mide con valor absoluto, así que una baja del 60 % también
  // supera el 5 %. Si el orden fuera al revés quedaría como "a revisar" y
  // alguien podría aceptarla de un clic.
  const d = decidir(1000, 400);
  assert.notEqual(d.accion, ACCION_PRECIO.OFRECER);
});

test("los umbrales POR PROVEEDOR gobiernan, no una constante", () => {
  // Con un proveedor tolerante, la misma suba entra sin molestar.
  const estricto = decidir(1000, 1080, { revisarPct: 5, sospechaBajaPct: 15 });
  const tolerante = decidir(1000, 1080, { revisarPct: 25, sospechaBajaPct: 40 });
  assert.equal(estricto.accion, ACCION_PRECIO.OFRECER);
  assert.equal(tolerante.accion, ACCION_PRECIO.NINGUNA);
});

test("sin costo anterior es un ALTA, no un cambio", () => {
  const d = decidir(0, 1200);
  assert.equal(d.accion, ACCION_PRECIO.OFRECER);
  assert.match(d.titulo, /Sin costo anterior/);
  assert.doesNotMatch(d.detalle, /%/);
});

// ── La puerta del servidor ─────────────────────────────────────────────────

// ── EL DATO DE PRUEBA SALE DEL MISMO CAMINO QUE LO PRODUCE ────────────────
//
// Acá decía `linea: { productoLocalId: 5, pedidoDetalleId: 9 }`, con el 9
// escrito a mano. Y ese 9 NO OCURRE: la columna solo se escribe si quien llama
// a vincular la manda, y la pantalla manda solo `{lineaId, productoBaseId}`.
// Medido en producción el 2026-09-20: 21 líneas de comprobante, 4 vinculadas,
// 0 con la columna. O sea que estos candados estaban verdes sobre una
// combinación que el sistema no produce, y por eso nadie se enteró de que
// aceptar un precio no funcionaba nunca.
//
// Ahora el id sale de `resolverLineaDelPedido`, que es la misma función que
// usan la pantalla y la ruta. Si mañana ese criterio cambia, estos candados
// cambian con él en vez de seguir afirmando un 9 inventado.
const DETALLES_DEL_PEDIDO = [
  { id: 9, productoBaseId: 77, cantidad: 2, precioCosto: 100 },
];

/** La línea tal como sale de la base: vinculada y con la columna en NULO. */
const LINEA_REAL = { productoLocalId: 5, pedidoDetalleId: null };

const resuelta = resolverLineaDelPedido({
  linea: LINEA_REAL,
  productoBaseId: 77,
  detalles: DETALLES_DEL_PEDIDO,
});

const base = {
  linea: LINEA_REAL,
  lineaDePedidoId: resuelta.detalle?.id ?? null,
  comprobante: { estado: "CARGADO", confirmadoEn: null },
  decision: { accion: ACCION_PRECIO.OFRECER },
  unidad: { requiereDecision: false },
};

test("EL CAMINO REAL RESUELVE LA LÍNEA DEL PEDIDO AUNQUE LA COLUMNA ESTÉ EN NULO", () => {
  // Es la contraprueba del defecto: con la fila tal como la base la tiene hoy
  // —vinculada, columna nula— el criterio tiene que encontrar la línea igual.
  // Sin esto, el resto de este archivo vuelve a probar una combinación que no
  // ocurre.
  assert.equal(resuelta.detalle?.id, 9);
  assert.equal(base.lineaDePedidoId, 9);
});

test("con todo en orden, se puede aceptar", () => {
  assert.equal(puedeAceptarse(base).ok, true);
});

test("DE UN COMPROBANTE QUE NO CIERRA NO SE ACEPTA NINGÚN PRECIO", () => {
  for (const estado of ["MAL_LEIDO", "PENDIENTE_LECTURA", "DIFIERE", "ANULADO"]) {
    const r = puedeAceptarse({ ...base, comprobante: { estado, confirmadoEn: null } });
    assert.equal(r.ok, false, estado);
    assert.equal(r.motivo, MOTIVO_NO_ACEPTAR.COMPROBANTE_NO_CIERRA, estado);
  }
});

test("SIN VÍNCULO no hay a qué producto escribirle", () => {
  const r = puedeAceptarse({ ...base, linea: { productoLocalId: null, pedidoDetalleId: null } });
  assert.equal(r.motivo, MOTIVO_NO_ACEPTAR.SIN_VINCULO);
});

test("SIN LÍNEA DE PEDIDO no hay dónde escribir el precio", () => {
  // El caso real de esto es el producto que el proveedor facturó y no estaba en
  // el pedido: el criterio no encuentra ninguna línea y devuelve null.
  const sinLinea = resolverLineaDelPedido({
    linea: LINEA_REAL,
    productoBaseId: 999,
    detalles: DETALLES_DEL_PEDIDO,
  });
  assert.equal(sinLinea.detalle, null);
  const r = puedeAceptarse({ ...base, lineaDePedidoId: sinLinea.detalle?.id ?? null });
  assert.equal(r.motivo, MOTIVO_NO_ACEPTAR.SIN_LINEA_DE_PEDIDO);
});

test("LA UNIDAD SIN RESOLVER BLOQUEA TANTO COMO EL VÍNCULO", () => {
  // Sin saber si es por unidad o por bulto, el precio que se escribiría podría
  // estar multiplicado por el tamaño del bulto. Es un error de un factor de 6,
  // 12 o 24, no de un porcentaje.
  const r = puedeAceptarse({ ...base, unidad: { requiereDecision: true } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_ACEPTAR.UNIDAD_SIN_RESOLVER);
});

test("EL SERVIDOR NO CONFÍA EN QUE LA PANTALLA HAYA ESCONDIDO EL BOTÓN", () => {
  // Quien llama a la ruta puede ser cualquiera: las tres reglas se comprueban
  // otra vez del lado del servidor.
  assert.equal(puedeAceptarse({ ...base, decision: { accion: ACCION_PRECIO.FRENA } }).ok, false);
  assert.equal(puedeAceptarse({ ...base, decision: { accion: ACCION_PRECIO.SOLO_INFORMAR } }).ok, false);
});

test("un comprobante ya confirmado no se toca", () => {
  const r = puedeAceptarse({ ...base, comprobante: { estado: "CARGADO", confirmadoEn: "2026-08-12" } });
  assert.equal(r.motivo, MOTIVO_NO_ACEPTAR.YA_CONFIRMADO);
});

test("basura no autoriza nada", () => {
  assert.equal(puedeAceptarse({}).ok, false);
  assert.equal(puedeAceptarse().ok, false);
});
