// EL RANGO ELIGE LA LECTURA — los candados de la regla que definió Emanuel el
// 2026-09-16.
//
// Cada uno tiene su CONTRAPRUEBA: se rompe a propósito lo que el candado dice
// defender y se comprueba que el resultado cambie. Es lo único que distingue un
// candado que afirma de uno que acompaña, y este módulo decide qué costos se
// escriben en producción.

import { test } from "node:test";
import assert from "node:assert/strict";

import { costoDeLaFila, MOTIVO_LECTURA } from "@/lib/proveedores/listas/eleccionDeLectura";
import { CONFIG_ARCOR, MOTIVO_UNIDAD } from "@/lib/proveedores/listas/configuraciones/arcor";
import { aplicarRecargo, requiereConversionABulto, factorValido } from "@/lib/proveedores/listas/calculoCosto";

const RECARGO = 5;
const RANGO = { minPct: 5, maxPct: 8 };

/**
 * Llama a `costoDeLaFila` armando los argumentos como los arma el motor.
 *
 * Existe para que los candados digan QUÉ caso ejercen y no cómo se pasan diez
 * parámetros. El precio con recargo se calcula acá con la misma función que usa
 * el motor, no a mano: un recargo calculado distinto haría que el candado mida
 * otra cosa.
 */
function decidir({ fila, base, rango = RANGO, impuestoAdicionalPct = null, config = CONFIG_ARCOR }) {
  const precioConRecargo = aplicarRecargo(Number(fila.precioConIva), RECARGO);
  const factorErp = base?.factor_pack ?? null;
  return costoDeLaFila({
    fila, base, config,
    recargoPct: RECARGO,
    impuestoAdicionalPct,
    rango,
    precioConRecargo,
    producto: {
      factorPack: factorErp,
      unidadMedida: base?.unidad_medida,
      modoCompraProveedor: base?.modoCompraProveedor,
      esCombo: false,
      creadoEnLocalId: null,
    },
    requiereBulto: requiereConversionABulto(base),
    factorErp,
    factorErpValido: factorValido(factorErp),
  });
}

/** Un producto que el ERP costea POR BULTO de `factor` unidades. */
const bulto = (factor, costo) => ({
  unidad_medida: "pack",
  factor_pack: factor,
  modoCompraProveedor: "BULTO",
  precio_costo: costo,
});

/** Un producto que el ERP costea por unidad suelta. */
const suelto = (costo) => ({
  unidad_medida: "unidad",
  factor_pack: null,
  modoCompraProveedor: "UNIDAD",
  precio_costo: costo,
});

const filaDI = (precio, uxbu) => ({
  unidadProveedor: "DI", unidadesPorBulto: uxbu, precioConIva: precio,
  descripcionProveedor: "GALLETITAS x3",
});
const filaUN = (precio, uxbu) => ({
  unidadProveedor: "UN", unidadesPorBulto: uxbu, precioConIva: precio,
  descripcionProveedor: "ALFAJOR SUELTO",
});
const filaBU = (precio) => ({
  unidadProveedor: "BU", unidadesPorBulto: 1, precioConIva: precio,
  descripcionProveedor: "CAJA CERRADA",
});

// ── EL DISPLAY DEJÓ DE BLOQUEAR ─────────────────────────────────────────────

test("una fila DI dentro del rango se resuelve sola, sin preguntar", () => {
  // El display ES el envase del ERP: $1.000 + 5 % = $1.050 contra un costo de
  // $1.000 es +5 %, que entra justo en el mínimo del rango.
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000) });

  assert.equal(r.ok, true, "una fila de display tiene que poder resolverse sola");
  assert.equal(r.costoMaestro, 1050);
  assert.equal(r.factorAplicado, 1);
  assert.equal(r.resultado, "RECOMENDADA");
});

test("CONTRAPRUEBA: con la regla de display apagada, la misma fila vuelve a bloquearse", () => {
  // Ésta es la contraprueba del candado de arriba: se rompe a propósito lo que
  // lo hace pasar —`equivalenciaDisplay`— y tiene que volver el bloqueo que
  // mandaba las 250 filas de display a la cola.
  const sinRegla = { ...CONFIG_ARCOR, equivalenciaDisplay: null };
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000), config: sinRegla });

  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_UNIDAD.DISPLAY_SIN_EQUIVALENCIA);
});

test("una fila DI fuera del rango queda marcada y NO se aplica", () => {
  // Mismo precio, pero el producto hoy cuesta $2.000: leerlo sin multiplicar da
  // −47,5 %, y por el bulto de 12 da +530 %. Ninguna de las dos entra en 5 a 8.
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 2000) });

  assert.equal(r.ok, false, "fuera del rango no se aplica");
  assert.equal(r.motivo, MOTIVO_LECTURA.FUERA_DE_RANGO);
  assert.equal(r.bloqueante, "FACTOR_DUDOSO", "se revisa, no se bloquea para siempre");

  // Y se lleva los números a la vista: "revisá esto" sin decir cuánto da y
  // contra qué no se puede revisar desde un teléfono.
  assert.ok(r.evaluadas.length >= 1);
  for (const h of r.evaluadas) {
    assert.equal(typeof h.variacionPct, "number");
    assert.equal(typeof h.costoNuevo, "number");
  }
});

test("CONTRAPRUEBA: acercando el costo anterior, esa misma fila se resuelve sola", () => {
  // Es la misma fila del candado anterior con el único dato que decide cambiado.
  // Si el resultado no se moviera, el candado de arriba no estaría midiendo el
  // rango sino cualquier otra cosa.
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000) });
  assert.equal(r.ok, true);
});

test("el rango elige la lectura del bulto cuando la de la unidad se va", () => {
  // Las galletitas x3: el proveedor cotiza el paquete y el ERP costea la caja de
  // 16. Sin multiplicar hunde el costo un 93 %; por 16 da +5 %.
  const r = decidir({ fila: filaDI(1000, 16), base: bulto(16, 16000) });

  assert.equal(r.ok, true);
  assert.equal(r.factorAplicado, 16, "es la lectura del bulto, y la eligió el rango");
  assert.equal(r.costoMaestro, 16800);
});

// ── LO ESTRUCTURAL SIGUE VETANDO, Y NO LO DECIDE UN PORCENTAJE ──────────────

test("el armado que no coincide sigue siendo un veto, aunque el rango cierre", () => {
  // El proveedor arma de a 12 y el producto dice 16: uno de los dos está
  // desactualizado y multiplicar por cualquiera da un costo equivocado. Eso no
  // lo arregla que el porcentaje dé lindo.
  const r = decidir({ fila: filaUN(1000, 12), base: bulto(16, 16000) });

  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_UNIDAD.FACTOR_DIFIERE);
});

test("un precio por bulto contra un producto suelto sigue vetado", () => {
  const r = decidir({ fila: filaBU(1000), base: suelto(1000) });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_UNIDAD.BULTO_SOBRE_UNIDAD_SUELTA);
});

test("una fila BU tiene UNA sola lectura: el rango solo puede advertir", () => {
  // El precio del bulto no se multiplica por nada. Si queda fuera del rango no
  // hay "cuál de las dos": hay una sola y se marca para revisar.
  const dentro = decidir({ fila: filaBU(1000), base: bulto(12, 1000) });
  assert.equal(dentro.ok, true);
  assert.equal(dentro.factorAplicado, 1);
  assert.equal(dentro.evaluadas.length, 1, "no hay una segunda lectura que ofrecer");

  const fuera = decidir({ fila: filaBU(1000), base: bulto(12, 5000) });
  assert.equal(fuera.ok, false);
  assert.equal(fuera.motivo, MOTIVO_LECTURA.FUERA_DE_RANGO);
  assert.equal(fuera.evaluadas.length, 1);
});

// ── EL COSTO QUE NO SE MUEVE NO ES UNA LECTURA EQUIVOCADA ───────────────────

test("una sola lectura que da EXACTAMENTE el costo de hoy no va a revisión", () => {
  // Un precio que el proveedor no cambió no es una lectura equivocada, y
  // aplicarlo no escribe nada. Mandarlo a la cola gastaría atención a cambio de
  // nada: el motor lo marca SIN_CAMBIOS unas líneas más abajo.
  const r = decidir({ fila: filaBU(1000), base: bulto(12, 1050) });
  assert.equal(r.ok, true, "sin cambio no es motivo de revisión");
  assert.equal(r.costoMaestro, 1050);
});

test("CONTRAPRUEBA: movido un centavo, la misma fila sí queda para revisar", () => {
  const r = decidir({ fila: filaBU(1000), base: bulto(12, 1049) });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.FUERA_DE_RANGO);
});

// ── SIN RANGO NO SE CONCILIA ────────────────────────────────────────────────

test("sin rango no se propone ningún costo, y el motivo lo dice", () => {
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000), rango: null });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.SIN_RANGO);
});

test("CONTRAPRUEBA: con el rango puesto, esa misma fila se resuelve", () => {
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000), rango: RANGO });
  assert.equal(r.ok, true);
});

test("medio rango tampoco alcanza", () => {
  const r = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000), rango: { minPct: 5, maxPct: null } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.SIN_RANGO);
});

// ── EL IMPUESTO ADICIONAL ENTRA EN LA CUENTA ────────────────────────────────

test("el impuesto adicional mueve el costo y puede sacar una fila del rango", () => {
  // Sin impuesto, +5 % entra. Con 3 % encima, +8,15 % se pasa del máximo.
  const sin = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000) });
  assert.equal(sin.ok, true);
  assert.equal(sin.costoMaestro, 1050);

  const con = decidir({ fila: filaDI(1000, 12), base: bulto(12, 1000), impuestoAdicionalPct: 3 });
  assert.equal(con.ok, false, "el impuesto la sacó del rango");
  assert.equal(con.motivo, MOTIVO_LECTURA.FUERA_DE_RANGO);
  assert.equal(con.evaluadas[0].costoNuevo, 1081.5);
});

// ── UNA SOLA RESPUESTA PARA CONCILIAR Y PARA APLICAR ────────────────────────

test("con UNA sola lectura, el costo coincide con el del resolvedor del proveedor", () => {
  // Cierra el agujero que el CLAUDE.md describe con `armadoConfirmadoPorElArchivo`:
  // dos implementaciones de la misma regla que se separan con el tiempo. Cuando
  // no hay nada que elegir, las dos tienen que dar el MISMO número.
  const fila = filaBU(1000);
  const base = bulto(12, 1000);
  const precioConRecargo = aplicarRecargo(1000, RECARGO);

  const elegido = decidir({ fila, base });
  const delProveedor = CONFIG_ARCOR.resolverCostoMaestro({
    unidadProveedor: "BU",
    unidadesPorBulto: 1,
    precioConRecargo,
    producto: { factorPack: 12, unidadMedida: "pack", modoCompraProveedor: "BULTO" },
    requiereBulto: true,
    factorErp: 12,
    factorErpValido: true,
    equivalenciaDisplay: CONFIG_ARCOR.equivalenciaDisplay,
  });

  assert.equal(elegido.ok, true);
  assert.equal(elegido.costoMaestro, delProveedor.costoMaestro);
});
