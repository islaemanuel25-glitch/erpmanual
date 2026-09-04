// Candados del armado de la vista de ofertas.
// node --test lib/ofertas/dto.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { ofertaParaLista, ofertaParaDetalle, lineaParaDetalle, accionesDisponibles } from "./dto.js";
import { ESTADO_OFERTA } from "./estados.js";

const AHORA = new Date("2026-09-07T15:00:00-03:00");

function oferta(over = {}) {
  return {
    id: 3,
    nombre: "SEMANA GALLETITAS",
    localId: 2,
    local: { nombre: "Casiano Casas" },
    condicionPago: "SOLO_EFECTIVO",
    publicadaEn: new Date("2026-09-03T10:00:00-03:00"),
    finalizadaEn: null,
    inicioEn: new Date("2026-09-04T00:00:00-03:00"),
    finEn: new Date("2026-09-11T23:59:00-03:00"),
    observaciones: null,
    renovadaDesdeId: null,
    lineas: [],
    _count: { lineas: 8 },
    ...over,
  };
}

function linea(over = {}) {
  return {
    id: 11,
    productoLocalId: 101,
    productoBaseId: 1001,
    productoLocal: { nombre: "Nueve de Oro", base: { nombre: "Nueve de Oro" } },
    precioOferta: 900,
    precioNormalReferencia: 1000,
    costoReferencia: 650,
    revisionPendienteDesde: null,
    costoAlDetectar: null,
    revisadaEn: null,
    ...over,
  };
}

// ── La tarjeta del pedido, campo por campo ───────────────────────────────────
test("la tarjeta trae todo lo que el ejemplo del pedido muestra", () => {
  const c = ofertaParaLista(
    oferta({
      lineas: [
        linea({ id: 1, revisionPendienteDesde: AHORA }),
        linea({ id: 2, revisionPendienteDesde: AHORA }),
        linea({ id: 3 }),
      ],
    }),
    AHORA
  );
  assert.equal(c.nombre, "SEMANA GALLETITAS");
  assert.equal(c.estado, ESTADO_OFERTA.REVISAR);
  assert.equal(c.localNombre, "Casiano Casas");
  assert.equal(c.cantidadProductos, 8);
  assert.equal(c.condicionPagoLabel, "Solo efectivo");
  assert.equal(c.lineasPorRevisar, 2, "el '2 productos cambiaron de costo' del pedido");
  assert.equal(c.requiereRevision, true);
});

test("el conteo de productos usa el _count cuando está, y las líneas cuando no", () => {
  assert.equal(ofertaParaLista(oferta({ _count: { lineas: 8 } }), AHORA).cantidadProductos, 8);
  const sinCount = oferta({ _count: undefined, lineas: [linea(), linea({ id: 2 })] });
  assert.equal(ofertaParaLista(sinCount, AHORA).cantidadProductos, 2);
});

test("una oferta sin líneas marcadas no pide revisión", () => {
  const c = ofertaParaLista(oferta({ lineas: [linea()] }), AHORA);
  assert.equal(c.lineasPorRevisar, 0);
  assert.equal(c.requiereRevision, false);
  assert.equal(c.estado, ESTADO_OFERTA.ACTIVA);
});

test("avisa que está por vencer", () => {
  const c = ofertaParaLista(oferta({ finEn: new Date("2026-09-08T09:00:00-03:00") }), AHORA);
  assert.equal(c.porVencer, true);
});

// ── La línea abierta ─────────────────────────────────────────────────────────
test("la línea deriva el descuento y el margen contra el costo de HOY", () => {
  const l = lineaParaDetalle(linea(), { precioActual: 1000, costoActual: 650 });
  assert.equal(l.precioOferta, 900);
  assert.equal(l.descuentoPct, 10);
  assert.equal(l.margen, 250);
  assert.equal(l.costoActual, 650);
  assert.equal(l.necesitaRevision, false);
  assert.equal(l.cambioDeCosto, null, "sin nada que mirar no se dibuja el bloque");
});

test("con el costo cambiado, la línea trae el 'de → a' completo del pedido", () => {
  const l = lineaParaDetalle(linea({ revisionPendienteDesde: AHORA, costoAlDetectar: 820 }), {
    precioActual: 1000,
    costoActual: 820,
  });
  assert.equal(l.necesitaRevision, true);
  assert.equal(l.cambioDeCosto.costoAnterior, 650);
  assert.equal(l.cambioDeCosto.costoActual, 820);
  assert.equal(l.cambioDeCosto.variacionPct, 26.15);
  assert.equal(l.cambioDeCosto.margenActual, 80);
  assert.equal(l.margen, 80, "el margen de arriba y el del bloque cuentan lo mismo");
});

test("el precio de oferta NO se mueve aunque el precio normal de hoy sea otro", () => {
  const l = lineaParaDetalle(linea(), { precioActual: 1500, costoActual: 650 });
  assert.equal(l.precioOferta, 900, "sigue siendo lo que se cargó");
  assert.equal(l.precioNormalReferencia, 1000, "la foto del momento de la carga");
  assert.equal(l.precioNormalActual, 1500, "y lo de hoy se muestra al lado");
  assert.equal(l.descuentoPct, 10, "el % se deriva contra la referencia, no contra el precio de hoy");
});

test("un margen negativo se informa y no se esconde", () => {
  const l = lineaParaDetalle(linea({ precioOferta: 600 }), { costoActual: 700 });
  assert.equal(l.margen, -100);
  assert.equal(l.margenNegativo, true);
});

test("sin costo actual conocido se usa el de referencia y no se rompe", () => {
  const l = lineaParaDetalle(linea());
  assert.equal(l.costoActual, 650);
  assert.equal(l.margen, 250);
});

// ── Acciones por estado: una por estado, para que ninguna quede inalcanzable ──
test("BORRADOR: se publica y se borra", () => {
  const a = accionesDisponibles(ESTADO_OFERTA.BORRADOR);
  assert.equal(a.publicar, true);
  assert.equal(a.eliminar, true);
  assert.equal(a.finalizar, false);
});

test("PROGRAMADA: no se vuelve a publicar, y todavía se puede borrar", () => {
  const a = accionesDisponibles(ESTADO_OFERTA.PROGRAMADA);
  assert.equal(a.publicar, false);
  assert.equal(a.finalizar, true);
  assert.equal(a.eliminar, true);
});

test("ACTIVA: se edita y se finaliza, pero NO se borra", () => {
  const a = accionesDisponibles(ESTADO_OFERTA.ACTIVA);
  assert.equal(a.editar, true);
  assert.equal(a.finalizar, true);
  assert.equal(a.eliminar, false, "puede tener ventas colgando");
});

test("REVISAR se comporta como ACTIVA: el aviso no cambia lo que se puede hacer", () => {
  assert.deepEqual(
    accionesDisponibles(ESTADO_OFERTA.REVISAR),
    accionesDisponibles(ESTADO_OFERTA.ACTIVA)
  );
});

test("VENCIDA ofrece las tres decisiones del pedido: renovar, modificar, finalizar", () => {
  const a = accionesDisponibles(ESTADO_OFERTA.VENCIDA);
  assert.equal(a.renovar, true);
  assert.equal(a.editar, true);
  assert.equal(a.finalizar, true);
});

test("FINALIZADA solo se duplica", () => {
  const a = accionesDisponibles(ESTADO_OFERTA.FINALIZADA);
  assert.equal(a.renovar, true);
  assert.equal(a.editar, false);
  assert.equal(a.finalizar, false);
  assert.equal(a.eliminar, false);
});

test("un estado desconocido no habilita NADA", () => {
  const a = accionesDisponibles("INVENTADO");
  assert.deepEqual(Object.values(a), [false, false, false, false, false]);
});

// ── El detalle completo ──────────────────────────────────────────────────────
test("el detalle cruza cada línea con el precio y el costo de hoy de SU producto", () => {
  const d = ofertaParaDetalle(
    oferta({
      lineas: [
        linea({ id: 1, productoLocalId: 101 }),
        linea({ id: 2, productoLocalId: 202, precioOferta: 450, precioNormalReferencia: 500, costoReferencia: 300 }),
      ],
    }),
    {
      actualesPorProductoLocal: {
        101: { precioNormal: 1000, costo: 650 },
        202: { precioNormal: 500, costo: 400 },
      },
      ahora: AHORA,
    }
  );
  assert.equal(d.lineas.length, 2);
  assert.equal(d.lineas[0].costoActual, 650);
  assert.equal(d.lineas[1].costoActual, 400, "cada línea con lo suyo, sin cruzarse");
  assert.equal(d.lineas[1].margen, 50);
  assert.equal(d.acciones.finalizar, true);
});
