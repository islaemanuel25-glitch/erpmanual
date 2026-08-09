// Reglas de la aplicación de costos.
//
// Es la parte del módulo que escribe dinero. Cada caso de acá corresponde a una
// forma concreta de arruinar un costo: multiplicar un bulto dos veces, aplicar
// un precio de kilo como si fuera de unidad, pisar un precio cargado a mano.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MODO_PRECIO_VENTA,
  MODO_PRECIO_VENTA_DEFAULT,
  RESULTADO_FILA,
  MOTIVO_OMISION,
  modoPrecioVentaValido,
  resolverModoPrecioVenta,
  revalidarFila,
  ventaParaModo,
  debeActualizarOverride,
  debeActualizarVentaOverride,
  resumirAplicacion,
  textoOmision,
} from "@/lib/proveedores/listas/aplicacion";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";
import {
  armadoConfirmadoPorElArchivo,
  hipotesisDeCosto,
} from "@/lib/proveedores/listas/confirmarPresentacion";

const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1 };
const RECARGO = 5;

// Producto del depósito, pack de 12, costo actual 1000.
function producto(extra = {}) {
  return {
    id: 10,
    nombre: "PURE LA HUERTA 530G X12",
    precio_costo: 1000,
    precio_venta: 1300,
    margen: 30,
    redondeo_100: false,
    es_combo: false,
    creadoEnLocalId: 1,
    unidad_medida: "pack",
    factor_pack: 12,
    modoCompraProveedor: "BULTO",
    pesoReferenciaKg: null,
    ...extra,
  };
}

// Fila "UN": el proveedor informa por unidad, UxBU coincide con el factor.
// 100 × 1,05 = 105 por unidad → × 12 = 1260 por bulto.
function filaUN(extra = {}) {
  return {
    id: 1,
    estado: "LISTO_PARA_ACTUALIZAR",
    aplicada: false,
    productoBaseId: 10,
    unidadProveedor: "UN",
    unidadesPorBulto: 12,
    precioConIva: 100,
    factorErp: 12,
    costoAnterior: 1000,
    costoMaestroPropuesto: 1260,
    ...extra,
  };
}

// ── UN ──────────────────────────────────────────────────────────────────────

test("UN: multiplica por el factor cuando coincide con UxBU", () => {
  const r = revalidarFila({ fila: filaUN(), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 1260);
  assert.equal(r.costoActual, 1000);
});

test("UN: si UxBU no coincide con el factor del ERP, no se aplica", () => {
  // Multiplicar por cualquiera de los dos da un costo equivocado por la mitad
  // o por el doble. Se frena.
  const r = revalidarFila({
    fila: filaUN({ unidadesPorBulto: 24 }),
    base: producto(),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.FACTOR_FALTANTE);
});

test("UN sobre producto por unidad suelta: no multiplica", () => {
  const base = producto({ unidad_medida: "unidad", factor_pack: null, precio_costo: 50 });
  const r = revalidarFila({
    fila: filaUN({ factorErp: null, costoAnterior: 50, costoMaestroPropuesto: 105 }),
    base, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 105);
});

test("UN sobre pack sin factor: no se aplica", () => {
  const base = producto({ factor_pack: null });
  const r = revalidarFila({
    fila: filaUN({ factorErp: null }), base,
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.FACTOR_FALTANTE);
});

// ── BU ──────────────────────────────────────────────────────────────────────

test("BU: NO vuelve a multiplicar por el factor", () => {
  // El precio del cajón no se multiplica por las unidades del cajón. Es el
  // error que multiplicaría el costo por doce.
  const fila = filaUN({
    unidadProveedor: "BU", unidadesPorBulto: 1,
    precioConIva: 1200, costoMaestroPropuesto: 1260,
  });
  const r = revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 1260); // 1200 × 1,05, sin × 12
});

test("BU sobre producto de unidad suelta: no se aplica", () => {
  const base = producto({ unidad_medida: "unidad", factor_pack: null, precio_costo: 50 });
  const fila = filaUN({ unidadProveedor: "BU", unidadesPorBulto: 1, precioConIva: 1200, factorErp: null, costoAnterior: 50 });
  const r = revalidarFila({ fila, base, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.FACTOR_FALTANTE);
});

// ── DI ──────────────────────────────────────────────────────────────────────

test("DI: nunca es aplicable, el ERP no tiene display", () => {
  const fila = filaUN({ unidadProveedor: "DI" });
  const r = revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.ERROR_DE_CALCULO);
});

// ── kg y fiambre ────────────────────────────────────────────────────────────

test("kg: no se aplica un precio por unidad a un costo por kilo", () => {
  const base = producto({ unidad_medida: "kg", factor_pack: null });
  const r = revalidarFila({ fila: filaUN({ factorErp: null }), base, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.UNIDAD_INCOMPATIBLE);
});

test("fiambre: tampoco", () => {
  const base = producto({ modoCompraProveedor: "UNIDAD" });
  const r = revalidarFila({ fila: filaUN(), base, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.UNIDAD_INCOMPATIBLE);
});

test("un producto que pasó a fiambre DESPUÉS de conciliar deja de ser aplicable", () => {
  const r = revalidarFila({
    fila: filaUN(), base: producto({ modoCompraProveedor: "UNIDAD" }),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
});

// ── Precio no creíble ───────────────────────────────────────────────────────

test("precio cero: no se aplica", () => {
  const r = revalidarFila({ fila: filaUN({ precioConIva: 0 }), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.PRECIO_NO_CREIBLE);
});

test("precio casi cero, por debajo del piso: no se aplica", () => {
  const r = revalidarFila({ fila: filaUN({ precioConIva: 0.4 }), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.PRECIO_NO_CREIBLE);
});

// ── Estado y doble aplicación ───────────────────────────────────────────────

test("una fila ya aplicada no se vuelve a aplicar", () => {
  const r = revalidarFila({ fila: filaUN({ aplicada: true }), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.YA_APLICADA);
});

test("una fila que dejó de estar lista no se aplica", () => {
  const r = revalidarFila({ fila: filaUN({ estado: "BLOQUEADO" }), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.motivo, MOTIVO_OMISION.ESTADO_NO_APLICABLE);
});

test("producto borrado: no se aplica", () => {
  const r = revalidarFila({ fila: filaUN(), base: null, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.motivo, MOTIVO_OMISION.PRODUCTO_INEXISTENTE);
});

test("combo: no tiene costo propio que actualizar", () => {
  const r = revalidarFila({ fila: filaUN(), base: producto({ es_combo: true }), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.motivo, MOTIVO_OMISION.PRODUCTO_ES_COMBO);
});

// ── Propiedad ───────────────────────────────────────────────────────────────

test("propiedad perdida: el producto pasó a ser de otro local", () => {
  const r = revalidarFila({
    fila: filaUN(), base: producto({ creadoEnLocalId: 4 }),
    contexto: { operandoEnLocalId: 1, depositoLocalId: 1 },
    config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.PROPIEDAD_PERDIDA);
});

// ── Cambios desde la conciliación ───────────────────────────────────────────

test("el costo del producto cambió desde que se concilió: se omite", () => {
  const r = revalidarFila({
    fila: filaUN(), base: producto({ precio_costo: 1111 }),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.COSTO_CAMBIO_DESDE_CONCILIACION);
});

test("cambió el factor del producto: se omite por configuración", () => {
  // El factor vivo es 6 y la fila se concilió con 12: la propuesta se calculó
  // con un armado que ya no es el del producto.
  const r = revalidarFila({
    fila: filaUN({ unidadesPorBulto: 6 }), base: producto({ factor_pack: 6 }),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.CONFIGURACION_CAMBIO);
});

test("la propuesta recalculada no coincide con la que se mostró: se omite", () => {
  const r = revalidarFila({
    fila: filaUN({ costoMaestroPropuesto: 9999 }), base: producto(),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.PROPUESTA_DIFERENTE);
});

test("el costo ya era el propuesto: no se escribe nada", () => {
  const r = revalidarFila({
    fila: filaUN({ costoAnterior: 1260 }), base: producto({ precio_costo: 1260 }),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.SIN_CAMBIO);
});

test("el recargo que vale es el de la importación, no el default de la config", () => {
  // La importación se concilió con 10 %: aplicar con el 5 % de la config daría
  // otro número del que el usuario aprobó.
  const r = revalidarFila({
    fila: filaUN({ costoMaestroPropuesto: 1320 }), base: producto(),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: 10,
  });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 1320); // 100 × 1,10 × 12
});

// ── Precio de venta ─────────────────────────────────────────────────────────

test("solo hay dos modos válidos", () => {
  assert.equal(modoPrecioVentaValido("MANTENER_VENTA"), true);
  assert.equal(modoPrecioVentaValido("RECALCULAR_POR_MARGEN"), true);
  assert.equal(modoPrecioVentaValido("NO_TOCAR"), false);
  assert.equal(modoPrecioVentaValido("cualquier_cosa"), false);
});

test("el default de Arcor es recalcular por margen", () => {
  assert.equal(MODO_PRECIO_VENTA_DEFAULT, MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN);
  assert.equal(resolverModoPrecioVenta(undefined), MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN);
});

test("MANTENER_VENTA no toca el precio", () => {
  const r = ventaParaModo({ modo: MODO_PRECIO_VENTA.MANTENER_VENTA, costo: 1260, margenConfigurado: 30 });
  assert.equal(r.aplica, false);
  assert.equal(r.precioFinal, null);
});

test("RECALCULAR_POR_MARGEN usa la fórmula del ERP", () => {
  const r = ventaParaModo({ modo: MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, costo: 1000, margenConfigurado: 30 });
  assert.equal(r.aplica, true);
  assert.equal(r.precioFinal, 1300);
});

test("con redondeo a 100 el precio sube, nunca baja", () => {
  const r = ventaParaModo({ modo: MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, costo: 1050, margenConfigurado: 30, redondeo100: true });
  assert.equal(r.precioFinal, 1400); // 1365 → 1400, no 1300
});

test("sin margen configurado NO se recalcula: el precio es manual", () => {
  for (const margen of [null, undefined, 0, -5]) {
    const r = ventaParaModo({ modo: MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, costo: 1260, margenConfigurado: margen });
    assert.equal(r.aplica, false, `margen ${margen}`);
  }
});

// ── Overrides por ubicación ─────────────────────────────────────────────────

test("override ausente: se actualiza", () => {
  assert.equal(debeActualizarOverride(null, 1000), true);
  assert.equal(debeActualizarOverride(undefined, 1000), true);
});

test("override que venía arrastrando el maestro: se actualiza", () => {
  assert.equal(debeActualizarOverride(1000, 1000), true);
  assert.equal(debeActualizarOverride("1000.00", 1000), true);
});

test("override cargado a mano: NO se toca", () => {
  assert.equal(debeActualizarOverride(950, 1000), false);
  assert.equal(debeActualizarOverride(1001, 1000), false);
});

test("la misma regla vale para el precio de venta del local", () => {
  assert.equal(debeActualizarVentaOverride(null, 1300), true);
  assert.equal(debeActualizarVentaOverride(1300, 1300), true);
  assert.equal(debeActualizarVentaOverride(1500, 1300), false);
});

// ── Resumen ─────────────────────────────────────────────────────────────────

test("el resumen cuenta y agrupa los motivos", () => {
  const r = resumirAplicacion([
    { resultado: RESULTADO_FILA.APLICADA },
    { resultado: RESULTADO_FILA.APLICADA },
    { resultado: RESULTADO_FILA.OMITIDA, motivo: MOTIVO_OMISION.SIN_CAMBIO },
    { resultado: RESULTADO_FILA.OMITIDA, motivo: MOTIVO_OMISION.SIN_CAMBIO },
    { resultado: RESULTADO_FILA.OMITIDA, motivo: MOTIVO_OMISION.PROPIEDAD_PERDIDA },
  ]);
  assert.equal(r.aplicadas, 2);
  assert.equal(r.omitidas, 3);
  assert.equal(r.total, 5);
  assert.equal(r.motivos[0].motivo, MOTIVO_OMISION.SIN_CAMBIO);
  assert.equal(r.motivos[0].cantidad, 2);
  assert.ok(r.motivos[0].texto.length > 0);
});

test("un motivo desconocido no rompe el texto", () => {
  assert.equal(typeof textoOmision("ALGO_NUEVO"), "string");
  assert.ok(textoOmision("ALGO_NUEVO").length > 0);
});

// ── Interpretación confirmada a mano ────────────────────────────────────────
//
// Lo que se confirma es un MULTIPLICADOR, y solo puede ser distinto de 1 cuando
// el archivo demuestra que el precio es por unidad suelta.

// Fila "DI" confirmada sin multiplicar: el display ya es el pack.
//
// `confirmadoEn` NO es decorado: una confirmación sin fecha no está vigente, y
// sin vigencia el multiplicador no se puede usar. Toda fila confirmada de verdad
// la tiene —`confirmar/route.js` la escribe en el mismo update que el
// multiplicador—, así que el fixture sin fecha describía una fila que no existe.
function filaDisplayConfirmada(extra = {}) {
  return {
    id: 2, estado: "LISTO_PARA_ACTUALIZAR", aplicada: false, productoBaseId: 10,
    unidadProveedor: "DI", unidadesPorBulto: 12, precioConIva: 1200,
    descripcionProveedor: "ALGO 12u x 30g",
    multiplicadorConfirmado: 1, cantidadPresentacion: 12,
    confirmadoEn: new Date("2026-08-02T10:00:00.000Z"),
    factorErp: 12, costoAnterior: 1000, costoMaestroPropuesto: 1260,
    ...extra,
  };
}

test("DI sin confirmar no es aplicable: el resolvedor no sabe qué es un display", () => {
  const fila = filaDisplayConfirmada({ multiplicadorConfirmado: null });
  assert.equal(revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO }).aplicable, false);
});

test("un display confirmado NO se multiplica por lo que trae adentro", () => {
  // 1200 × 1,05 = 1260. Ni × 12 ni × 18: el precio ya es el del display.
  const r = revalidarFila({ fila: filaDisplayConfirmada(), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 1260);
});

test("la cantidad de la presentación no mueve el costo", () => {
  const a = revalidarFila({ fila: filaDisplayConfirmada({ cantidadPresentacion: 12 }), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  const b = revalidarFila({ fila: filaDisplayConfirmada({ cantidadPresentacion: 18 }), base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(a.costoNuevo, b.costoNuevo, "la cantidad es un dato, no un factor");
});

test("un multiplicador mayor que 1 sobre un display NO se acepta", () => {
  // Aunque venga guardado, la revalidación lo rechaza: el archivo dice DI.
  const fila = filaDisplayConfirmada({ multiplicadorConfirmado: 12 });
  assert.equal(revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO }).aplicable, false);
});

test("con precio por unidad y producto que agrupa, sí se multiplica", () => {
  // 100 × 1,05 × 12 = 1260, y el archivo dice UN, que es lo que lo demuestra.
  const fila = filaDisplayConfirmada({
    unidadProveedor: "UN", precioConIva: 100, multiplicadorConfirmado: 12,
  });
  const r = revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 1260);
});

test("confirmar NO saltea el resto de las revalidaciones", () => {
  const ajeno = producto({ creadoEnLocalId: 99 });
  assert.equal(revalidarFila({ fila: filaDisplayConfirmada(), base: ajeno, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO }).aplicable, false);
  const movido = producto({ precio_costo: 1111 });
  assert.equal(revalidarFila({ fila: filaDisplayConfirmada(), base: movido, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO }).aplicable, false);
  assert.equal(revalidarFila({ fila: filaDisplayConfirmada(), base: null, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO }).aplicable, false);
  const otroFactor = producto({ factor_pack: 24 });
  assert.equal(revalidarFila({ fila: filaDisplayConfirmada(), base: otroFactor, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO }).aplicable, false);
});

test("un multiplicador inválido falla cerrado, no vuelve al motor automático", () => {
  for (const m of [0, -1, 1.5, "doce"]) {
    const fila = filaDisplayConfirmada({
      unidadProveedor: "UN", precioConIva: 100, unidadesPorBulto: 12, multiplicadorConfirmado: m,
    });
    const r = revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
    // Sin confirmación válida cae al motor, que para UN con UxBU 12 = factor 12
    // resuelve 1260. Lo que NO puede pasar es aplicar el multiplicador roto.
    assert.notEqual(r.costoNuevo, 0, String(m));
    if (r.aplicable) assert.equal(r.costoNuevo, 1260, String(m));
  }
});

test("una confirmación VENCIDA no escribe ningún costo", () => {
  // El agujero: alguien confirmó "es un display", después se revinculó la fila a
  // otro producto, y ese multiplicador seguiría decidiendo qué costo se escribe
  // en producción. Revincular no borra la confirmación —la autoría queda— pero
  // deja de contar, y la fila cae al resolvedor como si nunca se hubiera
  // confirmado. Para DI el resolvedor no sabe qué hacer, así que no se aplica.
  const vencida = filaDisplayConfirmada({
    confirmadoEn: new Date("2026-08-01T10:00:00.000Z"),
    vinculadoEn: new Date("2026-08-02T10:00:00.000Z"),
  });
  const r = revalidarFila({ fila: vencida, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, false, "el multiplicador vencido no puede escribir un costo");
  assert.equal(vencida.multiplicadorConfirmado, 1, "y lo que se decidió sigue guardado");

  // La misma fila, confirmada DESPUÉS de vincular, sí se aplica: lo que cambia
  // es el orden de las dos fechas, no el multiplicador.
  const vigente = filaDisplayConfirmada({
    confirmadoEn: new Date("2026-08-03T10:00:00.000Z"),
    vinculadoEn: new Date("2026-08-02T10:00:00.000Z"),
  });
  const ok = revalidarFila({ fila: vigente, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(ok.aplicable, true);
  assert.equal(ok.costoNuevo, 1260);
});

test("UxBU nunca entra en el costo revalidado", () => {
  // UxBU 216 contra un producto que agrupa 12: el costo usa 12, no 216.
  const fila = filaDisplayConfirmada({
    unidadProveedor: "UN", precioConIva: 100, unidadesPorBulto: 216, multiplicadorConfirmado: 12,
  });
  const r = revalidarFila({ fila, base: producto(), contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.costoNuevo, 1260);
});

// ── LO CONFIRMADO EN EL PANEL SE TIENE QUE PODER APLICAR ───────────────────
//
// El panel ofrece, para una fila de display cuyo armado confirma el archivo, la
// lectura del bulto. El que escribe tenía su propia copia de la regla, más
// vieja, que solo admitía multiplicar con precio por unidad: la fila se
// confirmaba y después se omitía con "no se pudo calcular el costo". Estos
// candados existen para que las dos puntas no se separen otra vez.

// Fila 936 real: TRAVIATA 3x108g, display, UxBU 16, el ERP guarda 16.
function filaTraviataConfirmada(extra = {}) {
  return {
    id: 4,
    estado: "LISTO_PARA_ACTUALIZAR",
    aplicada: false,
    productoBaseId: 10,
    unidadProveedor: "DI",
    unidadesPorBulto: 16,
    precioConIva: 1733.333349,
    costoAnterior: 26640,
    costoMaestroPropuesto: 29120,
    confirmadoEn: "2026-08-09T03:00:00Z",
    vinculadoEn: null,
    multiplicadorConfirmado: 16,
    ...extra,
  };
}
const cajaDisplay = (extra = {}) =>
  producto({ factor_pack: 16, precio_costo: 26640, ...extra });

test("EL CASO TRAVIATA: la lectura del bulto confirmada SE APLICA", () => {
  const r = revalidarFila({
    fila: filaTraviataConfirmada(), base: cajaDisplay(),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, true, "el panel la ofreció: el que escribe la tiene que aceptar");
  assert.equal(r.costoNuevo, 29120);
});

test("si el archivo NO confirma el armado, la confirmación no escribe nada", () => {
  // El caso SERRANAS con el factor viejo: el ERP decía 14 y el archivo 16.
  const r = revalidarFila({
    fila: filaTraviataConfirmada({ unidadesPorBulto: 16 }),
    base: cajaDisplay({ factor_pack: 14 }),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false, "falla cerrada: no aplica un costo que nadie aprobó");
  assert.equal(r.motivo, MOTIVO_OMISION.ERROR_DE_CALCULO);
});

test("en un display, el único multiplicador legítimo es el factor del producto", () => {
  const r = revalidarFila({
    fila: filaTraviataConfirmada({ multiplicadorConfirmado: 8 }),
    base: cajaDisplay(),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false, "8 no es el armado que informa el archivo");
});

test("un display con multiplicador 1 sigue aplicando como siempre", () => {
  // Son 89 de las 93 filas de display del archivo real: el display ES el envase.
  // El costo anterior de la fila TIENE que ser el del producto: una fila
  // conciliada contra un costo y un producto con otro es una fila que no existe,
  // y el motor la omite por eso —lo detectó este mismo candado al escribirlo—.
  const r = revalidarFila({
    fila: filaTraviataConfirmada({
      multiplicadorConfirmado: 1,
      costoAnterior: 1800,
      costoMaestroPropuesto: 1820,
    }),
    base: cajaDisplay({ precio_costo: 1800 }),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, true);
  assert.equal(r.costoNuevo, 1820);
});

test("una fila POR BULTO confirmada con multiplicador sigue sin escribir", () => {
  // BU no cambió: el precio ya es el del bulto y multiplicarlo es un error.
  const r = revalidarFila({
    fila: filaTraviataConfirmada({ unidadProveedor: "BU" }),
    base: cajaDisplay(),
    contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO,
  });
  assert.equal(r.aplicable, false);
});

test("el panel y el que escribe usan EL MISMO predicado", () => {
  // No es una prueba de comportamiento: es el candado contra la copia. Si alguien
  // vuelve a escribir la condición al lado, esto no lo detecta — pero el import
  // compartido deja dicho de dónde sale.
  const fila = filaTraviataConfirmada();
  const base = cajaDisplay();
  assert.equal(armadoConfirmadoPorElArchivo(fila, base), true);
  assert.equal(armadoConfirmadoPorElArchivo(fila, cajaDisplay({ factor_pack: 14 })), false);
  const h = hipotesisDeCosto({ fila, base, recargoPct: RECARGO });
  assert.equal(h.length, 2, "lo que ofrece el panel");
  const r = revalidarFila({ fila, base, contexto: CONTEXTO, config: CONFIG_ARCOR, recargoPct: RECARGO });
  assert.equal(r.aplicable, true, "y lo que escribe el motor");
});
